/**
 * Messaging UX + consultation cancellation. Synthetic data only; n8n and
 * LiveKit are stubbed (fetch), LiveKit credentials are test values.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'

vi.mock('@/lib/auth-helpers', () => ({ getCurrentUser: vi.fn() }))

import { getCurrentUser } from '@/lib/auth-helpers'
import { db } from '@etabeeb/db'
import { consultationVideoSessions, notificationOutbox, whatsappEvents } from '@etabeeb/db/schema'
import { eq, sql } from 'drizzle-orm'
import { cancelConsultation, createCasePrescription, startConsultation } from '@/lib/etabib/cases'
import { dispatchOutboundJobs } from '@/lib/etabib/outbound'
import { mintPatientJoinLink } from '@/lib/etabib/video'
import { processInboundMessage } from '@/lib/etabib/whatsapp'
import { listCasesForAdmin, listCasesForDoctor, getCaseDetailForDoctor } from '@/lib/etabib/queries'
import { waMeLink, representativeChatTarget, representativeHelpUrl, REPRESENTATIVE_PREFILL_PS } from '@/lib/etabib/links'
import { POST as adminCancelRoute } from '@/app/api/admin/cases/[id]/cancel/route'
import { POST as doctorCancelRoute } from '@/app/api/doctor/cases/[id]/cancel/route'
import { POST as patientAccessRoute } from '@/app/api/video/patient/access/route'
import { POST as patientTokenRoute } from '@/app/api/video/patient/token/route'
import { POST as doctorTokenRoute } from '@/app/api/doctor/cases/[id]/video/token/route'
import { GET as adminDetailRoute } from '@/app/api/admin/cases/[id]/route'
import { hasTestDb, resetDb, createUser, jsonRequest, getCase, eventsFor, jobsOfType, caseAt, inbound, rxItems } from './helpers'

const LK = { url: 'wss://livekit.example.test', key: 'APItestkey', secret: 'test-livekit-secret-not-real-0123456789abcdef' }
const N8N_URL = 'https://n8n.example.test/webhook/outbound'
const REP = '+923009990009'
type SessionUser = NonNullable<Awaited<ReturnType<typeof getCurrentUser>>>
const mockUser = vi.mocked(getCurrentUser)
const loginAs = (id: string | null, role = 'practitioner') =>
  mockUser.mockResolvedValue(id ? ({ id, role, publicId: id, phone: '', displayName: 'Syn', locale: 'en', mustChangePassword: false } as SessionUser) : null)
const p = (id: string) => ({ params: { id } })
const tokenOf = (url: string) => url.split('/consult/')[1]!
const access = async (token: string) => (await patientAccessRoute(jsonRequest('/x', { token }))).json()
const cancelBody = (reason: string, note?: string) => ({ reason, ...(note !== undefined ? { note } : {}) })

type Stage = 'ADMIN_INTAKE' | 'AWAITING_PAYMENT' | 'PAYMENT_RECEIVED' | 'AWAITING_DOCTOR_APPROVAL' | 'CONFIRMED' | 'IN_CONSULTATION'

describe.skipIf(!hasTestDb)('messaging UX + consultation cancellation', () => {
  let adminId: string
  let doctorId: string
  let fetchMock: ReturnType<typeof vi.fn>
  const n8nCalls = () => fetchMock.mock.calls.filter((c) => String(c[0]) === N8N_URL).map((c) => JSON.parse(c[1].body))
  const sentOfType = (type: string) => n8nCalls().filter((b) => b.type === type)
  const ADMIN = () => ({ type: 'ADMIN' as const, id: adminId })
  const DOCTOR = () => ({ type: 'DOCTOR' as const, id: doctorId })

  beforeEach(async () => {
    await resetDb()
    adminId = await createUser('Synthetic Admin')
    doctorId = await createUser('Synthetic Doctor')
    Object.assign(process.env, {
      ETABIB_V1_DOCTOR_USER_ID: doctorId,
      ETABIB_ADMIN_WHATSAPP: '+923009990001',
      ETABIB_DOCTOR_WHATSAPP: '+923009990002',
      ETABIB_REPRESENTATIVE_WHATSAPP: REP,
      ETABIB_N8N_OUTBOUND_URL: N8N_URL,
      ETABIB_N8N_OUTBOUND_KEY: 'test-outbound-key',
      NEXT_PUBLIC_APP_URL: 'https://staging.example.test',
      LIVEKIT_URL: LK.url,
      LIVEKIT_API_KEY: LK.key,
      LIVEKIT_API_SECRET: LK.secret,
    })
    fetchMock = vi.fn().mockResolvedValue(new Response('{}', { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)
    mockUser.mockReset()
  })
  afterEach(() => {
    vi.unstubAllGlobals()
    for (const k of ['ETABIB_REPRESENTATIVE_WHATSAPP', 'ETABIB_N8N_OUTBOUND_URL', 'ETABIB_N8N_OUTBOUND_KEY', 'NEXT_PUBLIC_APP_URL', 'LIVEKIT_URL', 'LIVEKIT_API_KEY', 'LIVEKIT_API_SECRET', 'ETABIB_WA_TEMPLATES']) delete process.env[k]
  })

  // ------------------------------------------------------------------
  describe('state machine', () => {
    it.each<Stage>(['ADMIN_INTAKE', 'AWAITING_PAYMENT', 'PAYMENT_RECEIVED', 'AWAITING_DOCTOR_APPROVAL', 'CONFIRMED'])('admin can cancel %s', async (stage) => {
      const { id } = await caseAt(stage, { adminId, doctorId })
      const r = await cancelConsultation(id, { reason: 'PATIENT_REQUESTED' }, ADMIN())
      expect(r.changed).toBe(true)
      const c = await getCase(id)
      expect(c).toMatchObject({ status: 'CANCELLED', cancelledBy: adminId, cancelledByRole: 'ADMIN', cancellationReason: 'PATIENT_REQUESTED', cancelledFromStatus: stage })
      expect(c.cancelledAt).toBeInstanceOf(Date)
      const ev = (await eventsFor(id)).filter((e) => e.eventType === 'CONSULTATION_CANCELLED')
      expect(ev).toHaveLength(1)
      expect(ev[0]).toMatchObject({ oldStatus: stage, newStatus: 'CANCELLED', actorType: 'ADMIN', actorId: adminId })
      expect(ev[0]!.metadata).toEqual({ actorRole: 'ADMIN', reason: 'PATIENT_REQUESTED', hasNote: false })
    })

    it.each<Stage>(['AWAITING_DOCTOR_APPROVAL', 'CONFIRMED'])('doctor can cancel %s', async (stage) => {
      const { id } = await caseAt(stage, { adminId, doctorId })
      await cancelConsultation(id, { reason: 'DOCTOR_UNAVAILABLE' }, DOCTOR())
      expect(await getCase(id)).toMatchObject({ status: 'CANCELLED', cancelledByRole: 'DOCTOR', cancelledBy: doctorId })
    })

    it.each<Stage>(['ADMIN_INTAKE', 'AWAITING_PAYMENT', 'PAYMENT_RECEIVED'])('doctor cannot cancel %s', async (stage) => {
      const { id } = await caseAt(stage, { adminId, doctorId })
      await expect(cancelConsultation(id, { reason: 'DOCTOR_UNAVAILABLE' }, DOCTOR())).rejects.toMatchObject({ code: 'cancel_not_allowed', httpStatus: 409 })
      expect((await getCase(id)).status).toBe(stage)
    })

    it('cancellation from IN_CONSULTATION is rejected for admin and doctor', async () => {
      const { id } = await caseAt('IN_CONSULTATION', { adminId, doctorId })
      for (const actor of [ADMIN(), DOCTOR()]) {
        await expect(cancelConsultation(id, { reason: 'OTHER', note: 'x' }, actor)).rejects.toMatchObject({ code: 'cancel_not_allowed' })
      }
      expect((await getCase(id)).status).toBe('IN_CONSULTATION')
    })

    it('cancellation from COMPLETED is rejected', async () => {
      const { id } = await caseAt('COMPLETED', { adminId, doctorId })
      expect((await getCase(id)).status).toBe('COMPLETED')
      await expect(cancelConsultation(id, { reason: 'PATIENT_REQUESTED' }, ADMIN())).rejects.toMatchObject({ code: 'cancel_not_allowed' })
    })

    it('repeated cancellation is a safe no-op: one event, one notification set', async () => {
      const { id } = await caseAt('CONFIRMED', { adminId, doctorId })
      await cancelConsultation(id, { reason: 'SCHEDULING_PROBLEM' }, ADMIN())
      const again = await cancelConsultation(id, { reason: 'PATIENT_REQUESTED' }, ADMIN())
      const byDoctor = await cancelConsultation(id, { reason: 'DOCTOR_UNAVAILABLE' }, DOCTOR())
      expect(again).toMatchObject({ changed: false, jobs: [] })
      expect(byDoctor).toMatchObject({ changed: false, jobs: [] })
      expect((await eventsFor(id)).filter((e) => e.eventType === 'CONSULTATION_CANCELLED')).toHaveLength(1)
      expect(await jobsOfType('CONSULTATION_CANCELLED_PATIENT')).toHaveLength(1)
      expect(await jobsOfType('CONSULTATION_CANCELLED_DOCTOR')).toHaveLength(1)
      expect(await jobsOfType('CONSULTATION_CANCELLED_ADMIN')).toHaveLength(0)
      expect((await getCase(id)).cancellationReason).toBe('SCHEDULING_PROBLEM') // first reason kept
    })

    it('a cancelled case blocks every later workflow action (start, prescription)', async () => {
      const { id } = await caseAt('CONFIRMED', { adminId, doctorId })
      await cancelConsultation(id, { reason: 'PATIENT_REQUESTED' }, ADMIN())
      await expect(startConsultation(id, DOCTOR())).rejects.toMatchObject({ httpStatus: 409 })
      await expect(createCasePrescription(id, rxItems, DOCTOR())).rejects.toMatchObject({ httpStatus: 409 })
      expect((await getCase(id)).status).toBe('CANCELLED')
    })

    it('the DB refuses a CANCELLED row without when/why/from', async () => {
      const { id } = await caseAt('AWAITING_PAYMENT', { adminId, doctorId })
      await expect(db.execute(sql`UPDATE consultation_cases SET status = 'CANCELLED' WHERE id = ${id}`)).rejects.toThrow()
    })

    it('the "Other" note is stored on the case but never in the audit event or WhatsApp', async () => {
      const { id } = await caseAt('PAYMENT_RECEIVED', { adminId, doctorId })
      const r = await cancelConsultation(id, { reason: 'OTHER', note: 'SYN internal note' }, ADMIN())
      await dispatchOutboundJobs(r.jobs.map((j) => j.id))
      expect((await getCase(id)).cancellationNote).toBe('SYN internal note')
      expect(JSON.stringify(await eventsFor(id))).not.toContain('SYN internal note')
      expect(JSON.stringify(n8nCalls())).not.toContain('SYN internal note')
    })

    it('after cancellation the same WhatsApp sender can start a NEW case', async () => {
      const { id, sender } = await caseAt('AWAITING_PAYMENT', { adminId, doctorId })
      await cancelConsultation(id, { reason: 'PATIENT_REQUESTED' }, ADMIN())
      const next = await processInboundMessage(inbound(sender, 'Salam again'))
      expect(next.consultationId).toBeTruthy()
      expect(next.consultationId).not.toBe(id)
      expect((await getCase(next.consultationId!)).status).toBe('NEW')
    })
  })

  // ------------------------------------------------------------------
  describe('video on cancellation', () => {
    it('revokes the patient link, blocks patient + doctor tokens, ends the session (audit kept), closes the room', async () => {
      const { id } = await caseAt('CONFIRMED', { adminId, doctorId })
      await db.update(consultationVideoSessions).set({ scheduledAt: new Date(Date.now() + 5 * 60_000) }).where(eq(consultationVideoSessions.consultationId, id))
      const token = tokenOf((await mintPatientJoinLink(id))!.url)
      expect((await access(token)).status).toBe('ok')

      loginAs(adminId, 'administrator')
      const res = await adminCancelRoute(jsonRequest('/x', cancelBody('DOCTOR_UNAVAILABLE')), p(id))
      expect(res.status).toBe(200)
      const body = await res.json()
      expect(body).toMatchObject({ success: true, changed: true, status: 'CANCELLED' })
      expect(JSON.stringify(body)).not.toMatch(/etb-[0-9a-f]{32}|videoRoomToClose/)

      // friendly cancelled state + representative link, never "invalid"
      expect(await access(token)).toEqual({ status: 'cancelled', helpUrl: 'https://staging.example.test/help' })
      const t = await patientTokenRoute(jsonRequest('/x', { token }))
      expect(t.status).toBe(410)
      expect((await t.json()).code).toBe('video_cancelled')
      loginAs(doctorId)
      expect((await doctorTokenRoute(jsonRequest('/x', {}), p(id))).status).toBe(409)
      expect(await mintPatientJoinLink(id)).toBeNull()

      const [s] = await db.select().from(consultationVideoSessions).where(eq(consultationVideoSessions.consultationId, id))
      expect(s).toMatchObject({ status: 'ENDED' })
      expect(s!.endedAt).toBeInstanceOf(Date)
      const events = await eventsFor(id)
      expect(events.find((e) => e.eventType === 'VIDEO_LINK_REVOKED' && (e.metadata as any)?.reason === 'case_cancelled')).toBeTruthy()
      expect(events.find((e) => e.eventType === 'VIDEO_SESSION_ENDED' && (e.metadata as any)?.reason === 'case_cancelled')).toBeTruthy()
      // best-effort LiveKit room deletion was attempted for this room
      expect(fetchMock.mock.calls.some((c) => String(c[0]).includes('DeleteRoom') && String(c[1]?.body ?? '').includes(s!.roomName))).toBe(true)
    })
  })

  // ------------------------------------------------------------------
  describe('outbox on cancellation', () => {
    it('withdraws obsolete pending jobs (kept for audit) and never sends them later', async () => {
      const { id } = await caseAt('CONFIRMED', { adminId, doctorId })
      const [confirm] = await jobsOfType('CONSULTATION_CONFIRMED_PATIENT')
      expect(confirm!.status).toBe('pending') // never dispatched in this test
      const r = await cancelConsultation(id, { reason: 'PATIENT_REQUESTED' }, ADMIN())
      expect(r.withdrawnJobs).toBeGreaterThanOrEqual(2) // patient + doctor confirmations
      const [after] = await db.select().from(notificationOutbox).where(eq(notificationOutbox.id, confirm!.id))
      expect(after).toMatchObject({ status: 'cancelled', lastError: 'superseded: case cancelled' })
      await dispatchOutboundJobs([confirm!.id])
      expect(sentOfType('CONSULTATION_CONFIRMED_PATIENT')).toHaveLength(0)
      expect((await jobsOfType('CONSULTATION_CANCELLED_PATIENT'))[0]!.status).toBe('pending')
    })

    it('a job re-queued after cancellation is withdrawn at dispatch (race guard)', async () => {
      const { id } = await caseAt('CONFIRMED', { adminId, doctorId })
      await cancelConsultation(id, { reason: 'PATIENT_REQUESTED' }, ADMIN())
      const [doc] = await jobsOfType('CONSULTATION_CONFIRMED_DOCTOR')
      await db.update(notificationOutbox).set({ status: 'pending' }).where(eq(notificationOutbox.id, doc!.id))
      const [result] = await dispatchOutboundJobs([doc!.id])
      expect(result).toMatchObject({ dispatched: false, reason: 'case_cancelled' })
      expect(n8nCalls()).toHaveLength(0)
    })

    it('admin cancel after doctor involvement: patient + doctor notified once; earlier stage: patient only', async () => {
      const a = await caseAt('CONFIRMED', { adminId, doctorId })
      const r = await cancelConsultation(a.id, { reason: 'PATIENT_UNREACHABLE' }, ADMIN())
      expect(r.jobs.map((j) => j.type).sort()).toEqual(['CONSULTATION_CANCELLED_DOCTOR', 'CONSULTATION_CANCELLED_PATIENT'])
      const b = await caseAt('AWAITING_PAYMENT', { adminId, doctorId })
      const r2 = await cancelConsultation(b.id, { reason: 'PAYMENT_ISSUE' }, ADMIN())
      expect(r2.jobs.map((j) => j.type)).toEqual(['CONSULTATION_CANCELLED_PATIENT'])
    })

    it('doctor cancel: patient + admin notified; messages carry no clinical data or staff notes', async () => {
      const { id } = await caseAt('AWAITING_DOCTOR_APPROVAL', { adminId, doctorId })
      loginAs(doctorId)
      const res = await doctorCancelRoute(jsonRequest('/x', cancelBody('DOCTOR_UNAVAILABLE')), p(id))
      expect(res.status).toBe(200)
      const [patient] = sentOfType('CONSULTATION_CANCELLED_PATIENT')
      const [admin] = sentOfType('CONSULTATION_CANCELLED_ADMIN')
      expect(patient.to).toBe((await getCase(id)).whatsappPhone)
      expect(patient.text).toContain('ستاسو د eTabeeb آنلاین مشوره لغوه شوه')
      expect(patient.text).toContain('د لغوه کېدو لامل: ډاکټر په دې وخت کې شتون نه لري')
      expect(patient.text).toContain('\nhttps://staging.example.test/help')
      expect(patient.text).not.toContain('wa.me')
      expect(admin.to).toBe('+923009990001')
      expect(admin.text).toContain('eTabeeb — Consultation cancelled by doctor')
      expect(admin.text).toContain('Reason: Doctor unavailable')
      expect(admin.text).toContain(`📋 Open case\nhttps://staging.example.test/admin/cases/${id}`)
      for (const m of [patient, admin]) expect(JSON.stringify(m)).not.toContain('Synthetic complaint')
      // repeat request: no new messages
      await doctorCancelRoute(jsonRequest('/x', cancelBody('DOCTOR_UNAVAILABLE')), p(id))
      expect(sentOfType('CONSULTATION_CANCELLED_PATIENT')).toHaveLength(1)
    })

    it('cancellation notification uses the approved Pashto template when configured', async () => {
      process.env.ETABIB_WA_TEMPLATES = JSON.stringify({ CONSULTATION_CANCELLED: { name: 'etabib_consultation_cancelled_ps', language: 'ps_AF' } })
      const { id, sender } = await caseAt('PAYMENT_RECEIVED', { adminId, doctorId })
      // the patient's 24-hour window is closed → the approved template is required
      await db.update(whatsappEvents).set({ createdAt: new Date(Date.now() - 30 * 3600_000) }).where(eq(whatsappEvents.senderPhone, sender))
      const r = await cancelConsultation(id, { reason: 'PAYMENT_ISSUE' }, ADMIN())
      await dispatchOutboundJobs(r.jobs.map((j) => j.id))
      const [m] = sentOfType('CONSULTATION_CANCELLED_PATIENT')
      expect(m.messageKind).toBe('template')
      expect(m.template.name).toBe('etabib_consultation_cancelled_ps')
      expect(m.template.components[0].parameters.map((x: any) => x.text)).toEqual(['Synthetic Patient', 'د فیس د ورکړې ستونزه', 'https://staging.example.test/help'])
    })
  })

  // ------------------------------------------------------------------
  describe('authorization and validation', () => {
    it('unauthenticated → 401; patient role → 403; admin on the doctor route → 403; other doctor → 403', async () => {
      const { id } = await caseAt('CONFIRMED', { adminId, doctorId })
      loginAs(null)
      expect((await adminCancelRoute(jsonRequest('/x', cancelBody('OTHER', 'x')), p(id))).status).toBe(401)
      expect((await doctorCancelRoute(jsonRequest('/x', cancelBody('OTHER', 'x')), p(id))).status).toBe(401)
      loginAs(await createUser('Synthetic Patient User'), 'patient')
      expect((await adminCancelRoute(jsonRequest('/x', cancelBody('PATIENT_REQUESTED')), p(id))).status).toBe(403)
      expect((await doctorCancelRoute(jsonRequest('/x', cancelBody('PATIENT_REQUESTED')), p(id))).status).toBe(403)
      loginAs(adminId, 'administrator')
      expect((await doctorCancelRoute(jsonRequest('/x', cancelBody('PATIENT_REQUESTED')), p(id))).status).toBe(403)
      loginAs(await createUser('Synthetic Other Doctor'))
      expect((await doctorCancelRoute(jsonRequest('/x', cancelBody('DOCTOR_UNAVAILABLE')), p(id))).status).toBe(403)
      expect((await getCase(id)).status).toBe('CONFIRMED')
    })

    it('a reason is required; "Other" needs a short note; unknown fields are rejected', async () => {
      const { id } = await caseAt('AWAITING_PAYMENT', { adminId, doctorId })
      loginAs(adminId, 'administrator')
      for (const bad of [{}, { reason: 'NOPE' }, { reason: 'OTHER' }, { reason: 'OTHER', note: '   ' }, { reason: 'OTHER', note: 'x'.repeat(201) }, { reason: 'PATIENT_REQUESTED', status: 'COMPLETED' }]) {
        expect((await adminCancelRoute(jsonRequest('/x', bad), p(id))).status).toBe(400)
      }
      expect((await getCase(id)).status).toBe('AWAITING_PAYMENT')
    })

    it('the doctor route cannot cancel a case before it reached the doctor', async () => {
      const { id } = await caseAt('PAYMENT_RECEIVED', { adminId, doctorId })
      loginAs(doctorId)
      expect((await doctorCancelRoute(jsonRequest('/x', cancelBody('DOCTOR_UNAVAILABLE')), p(id))).status).toBe(409)
    })
  })

  // ------------------------------------------------------------------
  describe('queues, detail and visibility', () => {
    it('cancelled cases leave the open queue, have their own filter, and show who/why/when', async () => {
      const open = await caseAt('AWAITING_PAYMENT', { adminId, doctorId })
      const gone = await caseAt('CONFIRMED', { adminId, doctorId })
      await cancelConsultation(gone.id, { reason: 'DUPLICATE_REQUEST' }, ADMIN())
      expect((await listCasesForAdmin({ status: 'OPEN' })).map((r) => r.id)).toEqual([open.id])
      expect((await listCasesForAdmin({ status: 'CANCELLED' })).map((r) => r.id)).toEqual([gone.id])
      loginAs(adminId, 'administrator')
      const detail = await (await adminDetailRoute(jsonRequest('/x', {}), p(gone.id))).json()
      expect(detail.case).toMatchObject({ status: 'CANCELLED', cancellationReason: 'DUPLICATE_REQUEST', cancelledByName: 'Synthetic Admin', cancelledFromStatus: 'CONFIRMED' })
      expect(detail.events.find((e: any) => e.eventType === 'CONSULTATION_CANCELLED')).toMatchObject({ actorType: 'ADMIN', actorName: 'Synthetic Admin', reason: 'DUPLICATE_REQUEST' })
    })

    it('doctor: cancelled cases leave the active lists; ones the doctor saw stay visible as history', async () => {
      const seen = await caseAt('CONFIRMED', { adminId, doctorId })
      const unseen = await caseAt('PAYMENT_RECEIVED', { adminId, doctorId })
      await cancelConsultation(seen.id, { reason: 'PATIENT_REQUESTED' }, ADMIN())
      await cancelConsultation(unseen.id, { reason: 'PATIENT_REQUESTED' }, ADMIN())
      const lists = await listCasesForDoctor()
      expect([...lists.pendingApproval, ...lists.confirmed, ...lists.inConsultation]).toHaveLength(0)
      expect(lists.recentlyCompleted.map((c) => c.id)).toEqual([seen.id])
      expect((await getCaseDetailForDoctor(seen.id)).case).toMatchObject({ status: 'CANCELLED', cancellationReason: 'PATIENT_REQUESTED', cancelledByRole: 'ADMIN' })
      await expect(getCaseDetailForDoctor(unseen.id)).rejects.toMatchObject({ httpStatus: 404 })
    })
  })

  // ------------------------------------------------------------------
  describe('messaging UX links', () => {
    it('wa.me links: digits only, URL-encoded prefill; representative falls back to the admin number', () => {
      expect(waMeLink('+92 300-1234567', 'سلام، x')).toBe(`https://wa.me/923001234567?text=${encodeURIComponent('سلام، x')}`)
      expect(waMeLink('123')).toBeNull()
      expect(waMeLink(null)).toBeNull()
      expect(representativeChatTarget()).toBe(`https://wa.me/923009990009?text=${encodeURIComponent(REPRESENTATIVE_PREFILL_PS)}`)
      expect(representativeHelpUrl()).toBe('https://staging.example.test/help')
      delete process.env.ETABIB_REPRESENTATIVE_WHATSAPP
      expect(representativeChatTarget()).toMatch(/^https:\/\/wa\.me\/923009990001\?text=/)
    })

    it('patient acknowledgement carries the representative link', async () => {
      await caseAt('ADMIN_INTAKE', { adminId, doctorId })
      const [ack] = await jobsOfType('PATIENT_ACKNOWLEDGED')
      await dispatchOutboundJobs([ack!.id])
      const [m] = sentOfType('PATIENT_ACKNOWLEDGED')
      expect(m.text).toContain('ستاسو د آنلاین مشورې غوښتنه ثبت شوه.')
      expect(m.text).toContain('\nhttps://staging.example.test/help')
      expect(m.text).not.toContain('wa.me')
    })

    it('doctor approval request: lock-screen safe summary + direct review link, no complaint/history', async () => {
      const { id } = await caseAt('AWAITING_DOCTOR_APPROVAL', { adminId, doctorId })
      const [job] = await jobsOfType('DOCTOR_APPROVAL_REQUEST')
      await dispatchOutboundJobs([job!.id])
      const [m] = sentOfType('DOCTOR_APPROVAL_REQUEST')
      expect(m.text).toContain('eTabeeb — Approval needed')
      expect(m.text).toContain('Age/Sex: 34 / FEMALE')
      expect(m.text).toContain(`🩺 Review & approve\nhttps://staging.example.test/doctor/cases/${id}`)
      expect(m.text).toContain('Clinical details are available in the secure dashboard.')
      expect(JSON.stringify(m)).not.toMatch(/Synthetic complaint|None \(synthetic\)|shortComplaint|mainComplaint|medicalHistory/)
    })

    it('patient confirmation: doctor, time, secure eTabeeb link and help link — never a raw video token or room', async () => {
      const { id } = await caseAt('CONFIRMED', { adminId, doctorId })
      const [job] = await jobsOfType('CONSULTATION_CONFIRMED_PATIENT')
      await dispatchOutboundJobs([job!.id])
      const [m] = sentOfType('CONSULTATION_CONFIRMED_PATIENT')
      expect(m.text).toContain('ستاسو مشوره له ډاکټر جلال الدین سره تایید شوه.')
      expect(m.text).toMatch(/د مشورې لینک:\nhttps:\/\/staging\.example\.test\/consult\/[A-Za-z0-9_-]{43}\n\nمرستې لپاره:\nhttps:\/\/staging\.example\.test\/help$/)
      const [s] = await db.select().from(consultationVideoSessions).where(eq(consultationVideoSessions.consultationId, id))
      expect(JSON.stringify(m)).not.toContain(s!.roomName)
      expect(JSON.stringify(m)).not.toMatch(/eyJ[A-Za-z0-9_-]{10,}|livekit|APItestkey/i)
      const [doc] = await jobsOfType('CONSULTATION_CONFIRMED_DOCTOR')
      await dispatchOutboundJobs([doc!.id])
      expect(sentOfType('CONSULTATION_CONFIRMED_DOCTOR')[0].text).toContain(`https://staging.example.test/doctor/cases/${id}`)
    })
  })
})
