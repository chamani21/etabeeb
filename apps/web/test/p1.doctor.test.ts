/**
 * P1.4 / P1.7 — doctor APIs: lists, clinical detail, decisions, start,
 * prescription with clinical sections, role boundaries.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest'

vi.mock('@/lib/auth-helpers', () => ({ getCurrentUser: vi.fn() }))

import { getCurrentUser } from '@/lib/auth-helpers'
import { db } from '@etabeeb/db'
import { prescriptions } from '@etabeeb/db/schema'
import { eq } from 'drizzle-orm'
import { GET as listRoute } from '@/app/api/doctor/cases/route'
import { GET as detailRoute } from '@/app/api/doctor/cases/[id]/route'
import { POST as decisionRoute } from '@/app/api/doctor/cases/[id]/decision/route'
import { POST as startRoute } from '@/app/api/doctor/cases/[id]/start/route'
import { POST as prescriptionRoute } from '@/app/api/doctor/cases/[id]/prescription/route'
import { POST as paymentRoute } from '@/app/api/admin/cases/[id]/payment/route'
import { hasTestDb, resetDb, createUser, jsonRequest, getCase, eventsFor, caseAt, future, rxItems } from './helpers'

type SessionUser = NonNullable<Awaited<ReturnType<typeof getCurrentUser>>>
const mockUser = vi.mocked(getCurrentUser)
function loginAs(id: string | null, role = 'practitioner', mustChangePassword = false) {
  mockUser.mockResolvedValue(id ? ({ id, role, publicId: id, phone: '', displayName: 'Synthetic', locale: 'en', mustChangePassword } as SessionUser) : null)
}
const p = (id: string) => ({ params: { id } })
const req = (path: string) => new Request(`http://localhost${path}`)

describe.skipIf(!hasTestDb)('P1 doctor', () => {
  let adminId: string
  let doctorId: string
  let otherDoctorId: string
  beforeEach(async () => {
    await resetDb()
    adminId = await createUser('Synthetic Admin')
    doctorId = await createUser('Synthetic Dr. Jalaluddin')
    otherDoctorId = await createUser('Synthetic Other Doctor')
    process.env.ETABIB_V1_DOCTOR_USER_ID = doctorId
    mockUser.mockReset()
  })

  it('only the configured V1 doctor can read; others get 401/403; rotation flag blocks', async () => {
    const { id } = await caseAt('AWAITING_DOCTOR_APPROVAL', { adminId, doctorId })
    for (const call of [() => listRoute(), () => detailRoute(req('/x'), p(id))]) {
      loginAs(null)
      expect((await call()).status).toBe(401)
      loginAs(otherDoctorId, 'practitioner')
      expect((await call()).status).toBe(403)
      loginAs(adminId, 'administrator')
      expect((await call()).status).toBe(403)
      loginAs(doctorId, 'practitioner', true)
      expect((await call()).status).toBe(403)
      loginAs(doctorId)
      expect((await call()).status).toBe(200)
    }
  })

  it('groups pending approvals, confirmed, in-consultation and recently completed', async () => {
    const pending = await caseAt('AWAITING_DOCTOR_APPROVAL', { adminId, doctorId })
    const confirmed = await caseAt('CONFIRMED', { adminId, doctorId })
    const active = await caseAt('IN_CONSULTATION', { adminId, doctorId })
    await caseAt('PAYMENT_RECEIVED', { adminId, doctorId }) // not yet the doctor's
    loginAs(doctorId)
    const body = await (await listRoute()).json()
    expect(body.pendingApproval.map((c: any) => c.id)).toEqual([pending.id])
    expect(body.confirmed.map((c: any) => c.id)).toEqual([confirmed.id])
    expect(body.inConsultation.map((c: any) => c.id)).toEqual([active.id])
    expect(body.recentlyCompleted).toEqual([])
  })

  it('detail is clinical only: no payment amount/reference/confirmer; pre-approval cases are hidden', async () => {
    const { id } = await caseAt('AWAITING_DOCTOR_APPROVAL', { adminId, doctorId })
    loginAs(doctorId)
    const body = await (await detailRoute(req('/x'), p(id))).json()
    expect(body.case).toMatchObject({ id, age: 34, sex: 'FEMALE', location: 'Synthetic District', mainComplaint: 'Synthetic complaint for testing' })
    const raw = JSON.stringify(body)
    for (const k of ['paymentAmount', 'paymentReference', 'paymentConfirmedBy', 'SYN-REF', 'PAYMENT_CONFIRMED']) expect(raw).not.toContain(k)
    expect(body.deliveryMode).toBe('text')
    const early = await caseAt('PAYMENT_RECEIVED', { adminId, doctorId })
    expect((await detailRoute(req('/x'), p(early.id))).status).toBe(404)
  })

  it('UI path: postpone → propose new time → approve → start → prescription with all sections', async () => {
    const { id } = await caseAt('AWAITING_DOCTOR_APPROVAL', { adminId, doctorId })
    loginAs(doctorId)
    const post = (route: (r: ReturnType<typeof jsonRequest>, c: { params: { id: string } }) => Promise<Response>, body: unknown) => route(jsonRequest("/x", body), p(id))

    expect((await post(decisionRoute, { decision: 'POSTPONED' })).status).toBe(200)
    expect((await getCase(id)).status).toBe('AWAITING_DOCTOR_APPROVAL')
    const newTime = future(72)
    expect((await post(decisionRoute, { decision: 'PROPOSE_NEW_TIME', proposedTime: newTime.toISOString() })).status).toBe(200)
    let c = await getCase(id)
    expect(c.status).toBe('AWAITING_DOCTOR_APPROVAL')
    expect(c.doctorApprovedTime).toBeNull()

    // start/prescription are refused before confirmation
    expect((await startRoute(jsonRequest('/x', {}), p(id))).status).toBe(409)
    expect((await post(prescriptionRoute, { items: rxItems })).status).toBe(409)

    expect((await post(decisionRoute, { decision: 'APPROVED', approvedTime: newTime.toISOString(), consultationLink: 'https://meet.example.test/syn' })).status).toBe(200)
    expect((await getCase(id)).status).toBe('CONFIRMED')
    expect((await startRoute(jsonRequest('/x', {}), p(id))).status).toBe(200)
    expect((await getCase(id)).status).toBe('IN_CONSULTATION')

    const res = await post(prescriptionRoute, {
      items: [...rxItems, { genericName: 'ORS', dose: '1 sachet', frequency: 'after each loose stool', durationDays: 3, substitutionAllowed: true, isControlled: false }],
      diagnosis: 'SYNTHETIC acute gastroenteritis',
      investigations: 'SYNTHETIC CBC',
      advice: 'SYNTHETIC fluids',
      followUp: 'SYNTHETIC 3 days',
      notes: 'SYNTHETIC note',
    })
    expect(res.status).toBe(201)
    c = await getCase(id)
    expect(c.status).toBe('IN_CONSULTATION') // only n8n delivery confirmation completes the case
    const [rx] = await db.select().from(prescriptions).where(eq(prescriptions.id, c.prescriptionId!))
    expect(rx).toMatchObject({ diagnosis: 'SYNTHETIC acute gastroenteritis', investigations: 'SYNTHETIC CBC', advice: 'SYNTHETIC fluids', followUp: 'SYNTHETIC 3 days', notes: 'SYNTHETIC note' })
    const detail = await (await detailRoute(req('/x'), p(id))).json()
    expect(detail.prescription.items).toHaveLength(2)
    expect(detail.prescriptionDelivery).toMatchObject({ status: 'pending', delivered: false })
    const types = (await eventsFor(id)).map((e) => e.eventType)
    for (const t of ['DOCTOR_POSTPONED', 'DOCTOR_PROPOSED_NEW_TIME', 'DOCTOR_APPROVED', 'CONSULTATION_CONFIRMED', 'CONSULTATION_STARTED', 'PRESCRIPTION_CREATED']) expect(types).toContain(t)
  })

  it('rejects malformed prescriptions (unknown fields, oversize sections, no items)', async () => {
    const { id } = await caseAt('IN_CONSULTATION', { adminId, doctorId })
    loginAs(doctorId)
    for (const body of [{ items: [] }, { items: rxItems, extra: 1 }, { items: rxItems, diagnosis: 'x'.repeat(2001) }]) {
      expect((await prescriptionRoute(jsonRequest('/x', body), p(id))).status).toBe(400)
    }
  })

  it('doctor cannot confirm payment', async () => {
    const { id } = await caseAt('AWAITING_PAYMENT', { adminId, doctorId })
    loginAs(doctorId)
    expect((await paymentRoute(jsonRequest('/x', { received: true, source: 'EASYPAISA' }), p(id))).status).toBe(403)
    expect((await getCase(id)).paymentReceived).toBe(false)
  })
})
