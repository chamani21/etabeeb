/**
 * P1.3 / P1.7 / P1.8 / P1.10 — admin APIs: queue, detail, intake edits, notes,
 * outbound retry, allow-list administration, status, role boundaries, audit.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'

vi.mock('@/lib/auth-helpers', () => ({ getCurrentUser: vi.fn() }))

import { getCurrentUser } from '@/lib/auth-helpers'
import { NextRequest } from 'next/server'
import { db } from '@etabeeb/db'
import { notificationOutbox, staffAuditEvents, whatsappAllowedSenders } from '@etabeeb/db/schema'
import { eq, sql } from 'drizzle-orm'
import { GET as listRoute } from '@/app/api/admin/cases/route'
import { GET as detailRoute } from '@/app/api/admin/cases/[id]/route'
import { POST as intakeRoute } from '@/app/api/admin/cases/[id]/intake/route'
import { POST as paymentRoute } from '@/app/api/admin/cases/[id]/payment/route'
import { POST as approvalRoute } from '@/app/api/admin/cases/[id]/request-doctor-approval/route'
import { POST as notesRoute } from '@/app/api/admin/cases/[id]/notes/route'
import { POST as retryRoute } from '@/app/api/admin/cases/[id]/outbox/[jobId]/retry/route'
import { GET as sendersGet, POST as sendersPost } from '@/app/api/admin/senders/route'
import { PATCH as senderPatch } from '@/app/api/admin/senders/[id]/route'
import { GET as statusRoute } from '@/app/api/admin/status/route'
import { POST as decisionRoute } from '@/app/api/doctor/cases/[id]/decision/route'
import { POST as dispatchHook } from '@/app/api/hooks/outbox-dispatch/route'
import { hasTestDb, HOOK_KEY, resetDb, createUser, jsonRequest, getCase, eventsFor, jobsOfType, caseAt, future, intake } from './helpers'

type SessionUser = NonNullable<Awaited<ReturnType<typeof getCurrentUser>>>
const mockUser = vi.mocked(getCurrentUser)
function loginAs(id: string | null, role = 'administrator', mustChangePassword = false) {
  mockUser.mockResolvedValue(id ? ({ id, role, publicId: id, phone: '', displayName: 'Synthetic', locale: 'en', mustChangePassword } as SessionUser) : null)
}
const get = (path: string) => new NextRequest(`http://localhost${path}`)
const patchReq = (path: string, body: unknown) =>
  new NextRequest(`http://localhost${path}`, { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })
const p = (id: string) => ({ params: { id } })

describe.skipIf(!hasTestDb)('P1 admin', () => {
  let adminId: string
  let doctorId: string
  beforeEach(async () => {
    await resetDb()
    adminId = await createUser('Synthetic Admin')
    doctorId = await createUser('Synthetic Doctor')
    process.env.ETABIB_V1_DOCTOR_USER_ID = doctorId
    process.env.ETABIB_ADMIN_WHATSAPP = '+923009990001'
    process.env.ETABIB_DOCTOR_WHATSAPP = '+923009990002'
    mockUser.mockReset()
  })
  afterEach(() => {
    vi.unstubAllGlobals()
    delete process.env.ETABIB_N8N_OUTBOUND_URL
    delete process.env.ETABIB_N8N_OUTBOUND_KEY
  })

  describe('role boundaries', () => {
    it('unauthenticated → 401; doctor/patient → 403; admin → 200 on every admin read', async () => {
      const { id } = await caseAt('ADMIN_INTAKE', { adminId, doctorId })
      const calls = [
        () => listRoute(get('/api/admin/cases')),
        () => detailRoute(get(`/api/admin/cases/${id}`), p(id)),
        () => sendersGet(),
        () => statusRoute(),
      ]
      for (const call of calls) {
        loginAs(null)
        expect((await call()).status).toBe(401)
        loginAs(doctorId, 'practitioner')
        expect((await call()).status).toBe(403)
        loginAs(doctorId, 'patient')
        expect((await call()).status).toBe(403)
        loginAs(adminId)
        expect((await call()).status).toBe(200)
      }
    })

    it('an admin flagged for password rotation is blocked from every admin action', async () => {
      const { id } = await caseAt('ADMIN_INTAKE', { adminId, doctorId })
      loginAs(adminId, 'administrator', true)
      for (const res of [
        await listRoute(get('/api/admin/cases')),
        await intakeRoute(jsonRequest(`/api/admin/cases/${id}/intake`, intake), p(id)),
        await sendersPost(jsonRequest('/api/admin/senders', { phone: '03001112222', label: 'x', purpose: 'PATIENT_TEST' })),
      ]) {
        expect(res.status).toBe(403)
        expect((await res.json()).code).toBe('password_change_required')
      }
      expect((await getCase(id)).status).toBe('ADMIN_INTAKE')
    })

    it('admin cannot make a doctor decision', async () => {
      const { id } = await caseAt('AWAITING_DOCTOR_APPROVAL', { adminId, doctorId })
      loginAs(adminId)
      const res = await decisionRoute(jsonRequest(`/api/doctor/cases/${id}/decision`, { decision: 'APPROVED', approvedTime: future(48).toISOString() }), p(id))
      expect(res.status).toBe(403)
      expect((await getCase(id)).status).toBe('AWAITING_DOCTOR_APPROVAL')
    })
  })

  describe('queue and detail', () => {
    it('lists open cases with counts; filters by status; searches by case id, phone and name', async () => {
      const a = await caseAt('ADMIN_INTAKE', { adminId, doctorId })
      const b = await caseAt('PAYMENT_RECEIVED', { adminId, doctorId })
      loginAs(adminId)
      const all = await (await listRoute(get('/api/admin/cases'))).json()
      expect(all.cases.map((c: any) => c.id).sort()).toEqual([a.id, b.id].sort())
      expect(all.counts).toMatchObject({ ADMIN_INTAKE: 1, PAYMENT_RECEIVED: 1 })
      const filtered = await (await listRoute(get('/api/admin/cases?status=PAYMENT_RECEIVED'))).json()
      expect(filtered.cases.map((c: any) => c.id)).toEqual([b.id])
      const byId = await (await listRoute(get(`/api/admin/cases?status=ALL&q=${a.id.slice(0, 8)}`))).json()
      expect(byId.cases.map((c: any) => c.id)).toEqual([a.id])
      const byPhone = await (await listRoute(get(`/api/admin/cases?status=ALL&q=${encodeURIComponent('0' + b.sender.slice(3))}`))).json()
      expect(byPhone.cases.map((c: any) => c.id)).toEqual([b.id])
      const byName = await (await listRoute(get('/api/admin/cases?status=ALL&q=synthetic%20pat'))).json()
      expect(byName.cases).toHaveLength(2)
      expect((await listRoute(get('/api/admin/cases?status=BOGUS'))).status).toBe(400)
    })

    it('detail returns case, chronological events with actor names, masked outbox recipients, no secrets', async () => {
      const { id, sender } = await caseAt('PAYMENT_RECEIVED', { adminId, doctorId })
      loginAs(adminId)
      const body = await (await detailRoute(get(`/api/admin/cases/${id}`), p(id))).json()
      expect(body.case).toMatchObject({ id, status: 'PAYMENT_RECEIVED', paymentConfirmedByName: 'Synthetic Admin', paymentAmount: 2000 })
      expect(body.events.map((e: any) => e.eventType)).toContain('PAYMENT_CONFIRMED')
      expect(body.events.find((e: any) => e.eventType === 'PAYMENT_CONFIRMED').actorName).toBe('Synthetic Admin')
      expect(body.outbox.length).toBeGreaterThan(0)
      const raw = JSON.stringify(body.outbox)
      expect(raw).not.toContain(sender)
      expect(raw).not.toContain('+923009990001')
      expect(body.outbox[0].to).toMatch(/\*\*\*\d{4}$/)
      expect(JSON.stringify(body)).not.toMatch(/x-etabib-key|test-hook-key/)
    })

    it('unknown case → 404; malformed id → 400', async () => {
      loginAs(adminId)
      expect((await detailRoute(get('/x'), p('00000000-0000-4000-8000-000000000000'))).status).toBe(404)
      expect((await detailRoute(get('/x'), p('nope'))).status).toBe(400)
    })
  })

  describe('admin actions', () => {
    it('intake can be corrected until the consultation starts, never after', async () => {
      loginAs(adminId)
      for (const stage of ['PAYMENT_RECEIVED', 'AWAITING_DOCTOR_APPROVAL', 'CONFIRMED'] as const) {
        const { id } = await caseAt(stage, { adminId, doctorId })
        const res = await intakeRoute(jsonRequest(`/api/admin/cases/${id}/intake`, { ...intake, location: 'Corrected District' }), p(id))
        expect(res.status).toBe(200)
        expect((await getCase(id)).location).toBe('Corrected District')
        expect((await getCase(id)).status).toBe(stage)
        expect((await eventsFor(id)).map((e) => e.eventType)).toContain('ADMIN_INTAKE_UPDATED')
      }
      const { id } = await caseAt('IN_CONSULTATION', { adminId, doctorId })
      expect((await intakeRoute(jsonRequest(`/api/admin/cases/${id}/intake`, { ...intake, location: 'Too late' }), p(id))).status).toBe(409)
    })

    it('invalid state actions are rejected with 409 and change nothing', async () => {
      const { id } = await caseAt('ADMIN_INTAKE', { adminId, doctorId })
      loginAs(adminId)
      expect((await paymentRoute(jsonRequest(`/api/admin/cases/${id}/payment`, { received: true, source: 'EASYPAISA' }), p(id))).status).toBe(409)
      expect((await approvalRoute(jsonRequest(`/api/admin/cases/${id}/request-doctor-approval`, { proposedConsultationTime: future(24).toISOString() }), p(id))).status).toBe(409)
      expect((await getCase(id)).status).toBe('ADMIN_INTAKE')
    })

    it('notes are saved with an audit event that never contains the note text', async () => {
      const { id } = await caseAt('ADMIN_INTAKE', { adminId, doctorId })
      loginAs(adminId)
      const res = await notesRoute(jsonRequest(`/api/admin/cases/${id}/notes`, { notes: 'SYNTHETIC private note 0300-1234567' }), p(id))
      expect((await res.json()).changed).toBe(true)
      expect((await getCase(id)).adminNotes).toBe('SYNTHETIC private note 0300-1234567')
      const ev = (await eventsFor(id)).find((e) => e.eventType === 'ADMIN_NOTES_UPDATED')!
      expect(JSON.stringify(ev.metadata)).not.toContain('private')
      const again = await notesRoute(jsonRequest(`/api/admin/cases/${id}/notes`, { notes: 'SYNTHETIC private note 0300-1234567' }), p(id))
      expect((await again.json()).changed).toBe(false)
    })

    it('a FAILED message can be retried (same idempotency key, audited); sent/foreign jobs cannot', async () => {
      const { id } = await caseAt('ADMIN_INTAKE', { adminId, doctorId })
      const other = await caseAt('ADMIN_INTAKE', { adminId, doctorId })
      const [job] = await jobsOfType('ADMIN_NEW_CASE').then((js) => js.filter((j) => JSON.parse(j.templateVariables!).consultationId === id))
      await db.update(notificationOutbox).set({ status: 'failed', lastError: '131047: re-engagement required' }).where(eq(notificationOutbox.id, job!.id))
      process.env.ETABIB_N8N_OUTBOUND_URL = 'https://n8n.example.test/webhook/outbound'
      process.env.ETABIB_N8N_OUTBOUND_KEY = 'test-outbound-key'
      const fetchMock = vi.fn().mockResolvedValue(new Response('{}', { status: 200 }))
      vi.stubGlobal('fetch', fetchMock)
      loginAs(adminId)

      expect((await retryRoute(jsonRequest('/x', {}), { params: { id: other.id, jobId: job!.id } })).status).toBe(404)
      const res = await retryRoute(jsonRequest('/x', {}), { params: { id, jobId: job!.id } })
      expect(res.status).toBe(200)
      expect((await res.json()).dispatched).toBe(true)
      expect(JSON.parse(fetchMock.mock.calls[0]![1].body).idempotencyKey).toBe(job!.idempotencyKey)
      const [after] = await db.select().from(notificationOutbox).where(eq(notificationOutbox.id, job!.id))
      expect(after!.status).toBe('processing')
      expect((await eventsFor(id)).map((e) => e.eventType)).toContain('OUTBOX_RETRY_REQUESTED')

      await db.update(notificationOutbox).set({ status: 'sent' }).where(eq(notificationOutbox.id, job!.id))
      expect((await retryRoute(jsonRequest('/x', {}), { params: { id, jobId: job!.id } })).status).toBe(409)
      loginAs(doctorId, 'practitioner')
      expect((await retryRoute(jsonRequest('/x', {}), { params: { id, jobId: job!.id } })).status).toBe(403)
    })
  })

  describe('allow-list administration', () => {
    it('adds (normalized E.164), rejects duplicates and invalid numbers, edits, soft-deactivates, audits', async () => {
      loginAs(adminId)
      const created = await sendersPost(jsonRequest('/api/admin/senders', { phone: '0300 111 2222', label: 'Synthetic tester', purpose: 'PATIENT_TEST' }))
      expect(created.status).toBe(201)
      const { sender } = await created.json()
      expect(sender.phoneE164).toBe('+923001112222')
      expect((await sendersPost(jsonRequest('/api/admin/senders', { phone: '+923001112222', label: 'dup', purpose: 'STAFF' }))).status).toBe(409)
      expect((await sendersPost(jsonRequest('/api/admin/senders', { phone: '12345', label: 'bad', purpose: 'STAFF' }))).status).toBe(400)
      expect((await sendersPost(jsonRequest('/api/admin/senders', { phone: '03001112223', label: 'x', purpose: 'ROOT' }))).status).toBe(400)

      const upd = await senderPatch(patchReq(`/api/admin/senders/${sender.id}`, { purpose: 'PILOT_PATIENT', notes: 'pilot' }), p(sender.id))
      expect((await upd.json()).sender).toMatchObject({ purpose: 'PILOT_PATIENT', notes: 'pilot', active: true })
      const off = await senderPatch(patchReq(`/api/admin/senders/${sender.id}`, { active: false }), p(sender.id))
      expect((await off.json()).sender.active).toBe(false)
      expect(await db.select().from(whatsappAllowedSenders)).toHaveLength(1) // soft, not deleted
      expect((await senderPatch(patchReq(`/api/admin/senders/${sender.id}`, {}), p(sender.id))).status).toBe(400)
      expect((await senderPatch(patchReq(`/api/admin/senders/${sender.id}`, { phoneE164: '+1' }), p(sender.id))).status).toBe(400)

      const audit = await db.select().from(staffAuditEvents)
      expect(audit.map((a) => a.action)).toEqual(['ALLOWED_SENDER_CREATED', 'ALLOWED_SENDER_UPDATED', 'ALLOWED_SENDER_UPDATED'])
      expect(audit.every((a) => a.actorId === adminId)).toBe(true)
      expect(JSON.stringify(audit)).not.toContain('923001112222')
      expect(audit[0]!.metadata).toMatchObject({ phoneLast4: '2222' })
    })

    it('doctor cannot manage the allow-list', async () => {
      loginAs(doctorId, 'practitioner')
      expect((await sendersPost(jsonRequest('/api/admin/senders', { phone: '03001112222', label: 'x', purpose: 'PATIENT_TEST' }))).status).toBe(403)
      expect(await db.select().from(whatsappAllowedSenders)).toHaveLength(0)
    })

    it('staff_audit_events is append-only', async () => {
      loginAs(adminId)
      await sendersPost(jsonRequest('/api/admin/senders', { phone: '03001112224', label: 'x', purpose: 'STAFF' }))
      await expect(db.execute(sql`UPDATE staff_audit_events SET action = 'X'`)).rejects.toThrow(/append-only/)
      await expect(db.execute(sql`DELETE FROM staff_audit_events`)).rejects.toThrow(/append-only/)
    })
  })

  describe('operational status', () => {
    it('reports inbound policy, outbox counts and the scheduler heartbeat without secrets', async () => {
      await caseAt('ADMIN_INTAKE', { adminId, doctorId })
      process.env.ETABIB_WHATSAPP_INBOUND_ENABLED = 'false'
      loginAs(adminId)
      let status = (await (await statusRoute()).json()).status
      expect(status.inbound).toMatchObject({ enabled: false, mode: 'disabled' })
      expect(status.outbox.pending).toBeGreaterThan(0)
      expect(status.scheduler.lastDispatchAt).toBeNull()
      await dispatchHook(jsonRequest('/api/hooks/outbox-dispatch', {}, { 'x-etabib-key': HOOK_KEY }))
      status = (await (await statusRoute()).json()).status
      expect(status.scheduler.healthy).toBe(true)
      expect(JSON.stringify(status)).not.toMatch(/test-hook-key|test-outbound-key|password/i)
      process.env.ETABIB_WHATSAPP_INBOUND_ENABLED = 'true'
    })
  })
})
