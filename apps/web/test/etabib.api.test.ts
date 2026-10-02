/**
 * eTabib V1 — API routes: authentication/authorization, WhatsApp patient flow,
 * hook contracts and the full lifecycle through the HTTP handlers.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest'

vi.mock('@/lib/auth-helpers', () => ({ getCurrentUser: vi.fn() }))

import { getCurrentUser } from '@/lib/auth-helpers'
import { db } from '@etabeeb/db'
import { consultationCases, integrationErrors, notificationOutbox, whatsappEvents } from '@etabeeb/db/schema'
import { eq } from 'drizzle-orm'
import { POST as whatsappHook } from '@/app/api/hooks/whatsapp/route'
import { POST as outboundResultHook } from '@/app/api/hooks/outbound-result/route'
import { POST as n8nErrorHook } from '@/app/api/hooks/n8n-error/route'
import { POST as intakeRoute } from '@/app/api/admin/cases/[id]/intake/route'
import { POST as paymentRoute } from '@/app/api/admin/cases/[id]/payment/route'
import { POST as approvalRoute } from '@/app/api/admin/cases/[id]/request-doctor-approval/route'
import { POST as decisionRoute } from '@/app/api/doctor/cases/[id]/decision/route'
import { POST as startRoute } from '@/app/api/doctor/cases/[id]/start/route'
import { POST as prescriptionRoute } from '@/app/api/doctor/cases/[id]/prescription/route'
import { dispatchOutboundJobs } from '@/lib/etabib/outbound'
import {
  hasTestDb,
  HOOK_KEY,
  resetDb,
  createUser,
  fakePhone,
  jsonRequest,
  metaPayload,
  getCase,
  eventsFor,
  jobsOfType,
  caseAt,
  future,
  intake,
  rxItems,
} from './helpers'

type SessionUser = NonNullable<Awaited<ReturnType<typeof getCurrentUser>>>
const mockUser = vi.mocked(getCurrentUser)
function loginAs(id: string | null, role = 'administrator') {
  mockUser.mockResolvedValue(
    id ? ({ id, role, publicId: id, phone: '', displayName: 'Synthetic', locale: 'ps' } as SessionUser) : null,
  )
}

const hookHeaders = { 'x-etabib-key': HOOK_KEY }
const params = (id: string) => ({ params: { id } })
let wamidN = 0
async function sendWhatsApp(from: string, text: string, wamid = `wamid.API.${Date.now()}.${++wamidN}`) {
  const res = await whatsappHook(jsonRequest('/api/hooks/whatsapp', metaPayload(from, wamid, text), hookHeaders))
  return { res, body: await res.json(), wamid }
}

describe.skipIf(!hasTestDb)('eTabib V1 — API', () => {
  let adminId: string
  let doctorId: string
  beforeEach(async () => {
    await resetDb()
    adminId = await createUser('Synthetic Admin')
    doctorId = await createUser('Synthetic Dr. Jalaluddin')
    process.env.ETABIB_V1_DOCTOR_USER_ID = doctorId
    mockUser.mockReset()
  })

  describe('authentication & authorization', () => {
    it('20. unauthenticated admin intake is rejected', async () => {
      const { id } = await caseAt('ADMIN_INTAKE', { adminId, doctorId })
      loginAs(null)
      const res = await intakeRoute(jsonRequest(`/api/admin/cases/${id}/intake`, intake), params(id))
      expect(res.status).toBe(401)
      expect((await getCase(id)).status).toBe('ADMIN_INTAKE')
    })

    it('21. non-admin intake is rejected', async () => {
      const { id } = await caseAt('ADMIN_INTAKE', { adminId, doctorId })
      for (const role of ['patient', 'practitioner', 'support']) {
        loginAs(doctorId, role)
        const res = await intakeRoute(jsonRequest(`/api/admin/cases/${id}/intake`, intake), params(id))
        expect(res.status).toBe(403)
      }
      expect((await getCase(id)).status).toBe('ADMIN_INTAKE')
    })

    it('22. unauthenticated doctor decision is rejected', async () => {
      const { id, approvedTime } = await caseAt('AWAITING_DOCTOR_APPROVAL', { adminId, doctorId })
      loginAs(null)
      const res = await decisionRoute(
        jsonRequest(`/api/doctor/cases/${id}/decision`, { decision: 'APPROVED', approvedTime: approvedTime.toISOString() }),
        params(id),
      )
      expect(res.status).toBe(401)
      expect((await getCase(id)).status).toBe('AWAITING_DOCTOR_APPROVAL')
    })

    it('23. unauthorized doctor (other practitioner, admin, or unconfigured) is rejected', async () => {
      const { id, approvedTime } = await caseAt('AWAITING_DOCTOR_APPROVAL', { adminId, doctorId })
      const body = { decision: 'APPROVED', approvedTime: approvedTime.toISOString() }
      const otherDoctor = await createUser('Synthetic Other Doctor')
      for (const [userId, role] of [
        [otherDoctor, 'practitioner'],
        [adminId, 'administrator'],
        [doctorId, 'patient'],
      ] as const) {
        loginAs(userId, role)
        const res = await decisionRoute(jsonRequest(`/api/doctor/cases/${id}/decision`, body), params(id))
        expect(res.status).toBe(403)
      }
      delete process.env.ETABIB_V1_DOCTOR_USER_ID
      loginAs(doctorId, 'practitioner')
      expect((await decisionRoute(jsonRequest(`/api/doctor/cases/${id}/decision`, body), params(id))).status).toBe(403)
      expect((await getCase(id)).status).toBe('AWAITING_DOCTOR_APPROVAL')
    })

    it('24. invalid or missing n8n shared key is rejected on every hook', async () => {
      const payload = metaPayload(fakePhone(), 'wamid.BADKEY', 'Salam')
      for (const headers of [{}, { 'x-etabib-key': 'wrong' }, { 'x-etabib-key': '' }]) {
        expect((await whatsappHook(jsonRequest('/api/hooks/whatsapp', payload, headers))).status).toBe(401)
        expect((await outboundResultHook(jsonRequest('/api/hooks/outbound-result', { jobId: crypto.randomUUID(), success: true }, headers))).status).toBe(401)
        expect((await n8nErrorHook(jsonRequest('/api/hooks/n8n-error', { workflowName: 'x' }, headers))).status).toBe(401)
      }
      expect(await db.select().from(whatsappEvents)).toHaveLength(0)
      // Unconfigured key fails closed
      const saved = process.env.ETABIB_HOOK_KEY
      delete process.env.ETABIB_HOOK_KEY
      expect((await whatsappHook(jsonRequest('/api/hooks/whatsapp', payload, hookHeaders))).status).toBe(401)
      process.env.ETABIB_HOOK_KEY = saved
    })

    it('rejects malformed ids and payloads with 400', async () => {
      loginAs(adminId)
      expect((await intakeRoute(jsonRequest('/api/admin/cases/nope/intake', intake), params('nope'))).status).toBe(400)
      const { id } = await caseAt('ADMIN_INTAKE', { adminId, doctorId })
      expect((await intakeRoute(jsonRequest(`/api/admin/cases/${id}/intake`, { ...intake, age: -1 }), params(id))).status).toBe(400)
      expect((await intakeRoute(jsonRequest(`/api/admin/cases/${id}/intake`, { ...intake, sex: 'X' }), params(id))).status).toBe(400)
      expect((await intakeRoute(jsonRequest(`/api/admin/cases/${id}/intake`, '{not json'), params(id))).status).toBe(400)
      expect((await whatsappHook(jsonRequest('/api/hooks/whatsapp', '{oops', hookHeaders))).status).toBe(400)
    })
  })

  describe('WhatsApp patient flow (Pashto, name + phone only)', () => {
    it('25–30. asks name, saves name, asks phone, saves phone, moves to ADMIN_INTAKE, stops asking', async () => {
      const sender = fakePhone()

      // 25. new patient → case created + Pashto ask-name job
      const first = await sendWhatsApp(sender, 'السلام علیکم')
      expect(first.res.status).toBe(200)
      expect(first.body.results[0]).toMatchObject({ outcome: 'asked_name', status: 'NEW', duplicate: false })
      const caseId: string = first.body.results[0].consultationId
      expect(await jobsOfType('ASK_PATIENT_NAME')).toHaveLength(1)

      // 26 + 27. name saved, phone requested
      const second = await sendWhatsApp(sender, 'احمد خان')
      expect(second.body.results[0].outcome).toBe('name_saved_asked_phone')
      expect((await getCase(caseId)).patientName).toBe('احمد خان')
      expect(await jobsOfType('ASK_PATIENT_PHONE')).toHaveLength(1)

      // invalid phone → re-asked, no state change
      const bad = await sendWhatsApp(sender, 'زه نه پوهېږم')
      expect(bad.body.results[0].outcome).toBe('asked_phone_again')
      expect((await getCase(caseId)).status).toBe('NEW')

      // 28 + 29. phone saved (Pashto digits), case → ADMIN_INTAKE, admin notified
      const third = await sendWhatsApp(sender, '۰۳۰۰۱۲۳۴۵۶۷')
      expect(third.body.results[0]).toMatchObject({ outcome: 'phone_saved_admin_intake', status: 'ADMIN_INTAKE' })
      const c = await getCase(caseId)
      expect(c.patientPhone).toBe('+923001234567')
      expect(c.status).toBe('ADMIN_INTAKE')
      expect(c.age).toBeNull()
      const adminJobs = await jobsOfType('ADMIN_NEW_CASE')
      expect(adminJobs).toHaveLength(1)
      expect(adminJobs[0]!.recipientPhone).toBeNull() // admin recipient resolved by n8n
      expect(adminJobs[0]!.templateVariables).not.toContain('احمد') // no PHI stored in the outbox row

      // 30. further messages: no more questions, no onboarding restart
      const later1 = await sendWhatsApp(sender, 'زما سر درد کوي')
      const later2 = await sendWhatsApp(sender, 'Hello?')
      expect(later1.body.results[0].outcome).toBe('case_in_progress')
      expect(later2.body.results[0].outcome).toBe('case_in_progress')
      expect(await jobsOfType('ASK_PATIENT_NAME')).toHaveLength(1)
      expect(await jobsOfType('ASK_PATIENT_PHONE')).toHaveLength(2) // ask + one invalid re-ask, nothing after
      expect(await jobsOfType('PATIENT_CASE_IN_PROGRESS')).toHaveLength(1) // once per stage
      expect((await getCase(caseId)).status).toBe('ADMIN_INTAKE')
      const eventTypes = (await eventsFor(caseId)).map((e) => e.eventType)
      expect(eventTypes).toEqual(['CASE_CREATED', 'PATIENT_NAME_RECEIVED', 'PATIENT_PHONE_RECEIVED', 'ADMIN_INTAKE_REQUESTED'])
    })

    it('duplicate Meta delivery of the same wamid is acknowledged without reprocessing', async () => {
      const sender = fakePhone()
      const a = await sendWhatsApp(sender, 'Salam', 'wamid.SAME')
      const b = await sendWhatsApp(sender, 'Salam', 'wamid.SAME')
      expect(a.body.processed).toBe(1)
      expect(b.res.status).toBe(200)
      expect(b.body.results[0]).toMatchObject({ duplicate: true, outcome: 'duplicate' })
      expect(await db.select().from(consultationCases)).toHaveLength(1)
      expect(await jobsOfType('ASK_PATIENT_NAME')).toHaveLength(1)
    })

    it('status-only webhooks are acknowledged and ignored', async () => {
      const res = await whatsappHook(
        jsonRequest('/api/hooks/whatsapp', { entry: [{ changes: [{ value: { statuses: [{ id: 'wamid.X', status: 'delivered' }] } }] }] }, hookHeaders),
      )
      expect(res.status).toBe(200)
      expect((await res.json()).processed).toBe(0)
    })
  })

  describe('admin, payment, doctor, prescription — full lifecycle over HTTP', () => {
    it('drives a case from WhatsApp to COMPLETED with all guards and events', async () => {
      const { id } = await caseAt('ADMIN_INTAKE', { adminId, doctorId })

      // Payment / approval before intake are rejected
      loginAs(adminId)
      expect((await paymentRoute(jsonRequest(`/api/admin/cases/${id}/payment`, { received: true, source: 'EASYPAISA' }), params(id))).status).toBe(409)
      expect((await approvalRoute(jsonRequest(`/api/admin/cases/${id}/request-doctor-approval`, { proposedConsultationTime: future(24).toISOString() }), params(id))).status).toBe(409)

      // Intake: ADMIN_INTAKE → INTAKE_COMPLETE → AWAITING_PAYMENT
      let res: Response = await intakeRoute(jsonRequest(`/api/admin/cases/${id}/intake`, intake), params(id))
      expect(res.status).toBe(200)
      expect((await res.json()).case.status).toBe('AWAITING_PAYMENT')

      // Doctor cannot confirm before payment
      loginAs(doctorId, 'practitioner')
      res = await decisionRoute(jsonRequest(`/api/doctor/cases/${id}/decision`, { decision: 'APPROVED', approvedTime: future(24).toISOString() }), params(id))
      expect(res.status).toBe(409)

      // Payment: client-supplied confirmer is rejected; server derives it
      loginAs(adminId)
      res = await paymentRoute(jsonRequest(`/api/admin/cases/${id}/payment`, { received: true, source: 'EASYPAISA', paymentConfirmedBy: doctorId }), params(id))
      expect(res.status).toBe(400)
      res = await paymentRoute(jsonRequest(`/api/admin/cases/${id}/payment`, { received: true, source: 'EASYPAISA', reference: 'SYN-123', amount: 2000 }), params(id))
      expect(res.status).toBe(200)
      let c = await getCase(id)
      expect(c).toMatchObject({ status: 'PAYMENT_RECEIVED', paymentReceived: true, paymentConfirmedBy: adminId, paymentSource: 'EASYPAISA' })

      // Doctor cannot confirm before an approval request
      loginAs(doctorId, 'practitioner')
      res = await decisionRoute(jsonRequest(`/api/doctor/cases/${id}/decision`, { decision: 'APPROVED', approvedTime: future(24).toISOString() }), params(id))
      expect(res.status).toBe(409)

      // Request doctor approval
      loginAs(adminId)
      const proposed = future(24)
      res = await approvalRoute(jsonRequest(`/api/admin/cases/${id}/request-doctor-approval`, { proposedConsultationTime: proposed.toISOString() }), params(id))
      expect(res.status).toBe(200)
      expect((await getCase(id)).status).toBe('AWAITING_DOCTOR_APPROVAL')
      expect(await jobsOfType('DOCTOR_APPROVAL_REQUEST')).toHaveLength(1)

      // Doctor proposes another time / postpones → not confirmed
      loginAs(doctorId, 'practitioner')
      const counter = future(30)
      res = await decisionRoute(jsonRequest(`/api/doctor/cases/${id}/decision`, { decision: 'PROPOSE_NEW_TIME', proposedTime: counter.toISOString() }), params(id))
      expect(res.status).toBe(200)
      c = await getCase(id)
      expect(c).toMatchObject({ status: 'AWAITING_DOCTOR_APPROVAL', doctorDecision: 'PROPOSE_NEW_TIME' })
      expect(c.proposedConsultationTime!.getTime()).toBe(counter.getTime())
      res = await decisionRoute(jsonRequest(`/api/doctor/cases/${id}/decision`, { decision: 'POSTPONED' }), params(id))
      expect((await getCase(id)).status).toBe('AWAITING_DOCTOR_APPROVAL')

      // APPROVED requires approvedTime
      res = await decisionRoute(jsonRequest(`/api/doctor/cases/${id}/decision`, { decision: 'APPROVED' }), params(id))
      expect(res.status).toBe(400)

      // Start before confirmation is rejected
      expect((await startRoute(jsonRequest(`/api/doctor/cases/${id}/start`, {}), params(id))).status).toBe(409)

      res = await decisionRoute(
        jsonRequest(`/api/doctor/cases/${id}/decision`, { decision: 'APPROVED', approvedTime: counter.toISOString(), consultationLink: 'https://meet.example.test/room-1' }),
        params(id),
      )
      expect(res.status).toBe(200)
      c = await getCase(id)
      expect(c).toMatchObject({ status: 'CONFIRMED', doctorDecision: 'APPROVED', consultationLink: 'https://meet.example.test/room-1' })
      expect(await jobsOfType('CONSULTATION_CONFIRMED_PATIENT')).toHaveLength(1)
      expect(await jobsOfType('CONSULTATION_CONFIRMED_DOCTOR')).toHaveLength(1)

      // Prescription before start is rejected; start is idempotent
      expect((await prescriptionRoute(jsonRequest(`/api/doctor/cases/${id}/prescription`, { items: rxItems }), params(id))).status).toBe(409)
      res = await startRoute(jsonRequest(`/api/doctor/cases/${id}/start`, {}), params(id))
      expect((await res.json()).changed).toBe(true)
      res = await startRoute(jsonRequest(`/api/doctor/cases/${id}/start`, {}), params(id))
      expect((await res.json()).changed).toBe(false)
      expect((await getCase(id)).status).toBe('IN_CONSULTATION')

      // Prescription reuses the existing module; a second one is refused
      res = await prescriptionRoute(jsonRequest(`/api/doctor/cases/${id}/prescription`, { items: rxItems }), params(id))
      expect(res.status).toBe(201)
      expect((await prescriptionRoute(jsonRequest(`/api/doctor/cases/${id}/prescription`, { items: rxItems }), params(id))).status).toBe(409)
      c = await getCase(id)
      expect(c.prescriptionId).not.toBeNull()
      expect(c.status).toBe('IN_CONSULTATION') // queued ≠ sent

      // n8n delivery callback → PRESCRIPTION_SENT → COMPLETED (twice: idempotent)
      const [job] = await jobsOfType('PRESCRIPTION_READY')
      const result = { jobId: job!.id, consultationId: id, type: 'PRESCRIPTION_READY', success: true, status: 'sent', wamid: 'wamid.RX.1', accessToken: 'never-stored' }
      for (let i = 0; i < 2; i++) {
        res = await outboundResultHook(jsonRequest('/api/hooks/outbound-result', result, hookHeaders))
        expect(res.status).toBe(200)
        expect((await res.json()).consultationStatus).toBe('COMPLETED')
      }
      const events = (await eventsFor(id)).map((e) => e.eventType)
      expect(events).toEqual([
        'CASE_CREATED',
        'PATIENT_NAME_RECEIVED',
        'PATIENT_PHONE_RECEIVED',
        'ADMIN_INTAKE_REQUESTED',
        'ADMIN_INTAKE_COMPLETED',
        'PAYMENT_REQUESTED',
        'PAYMENT_CONFIRMED',
        'DOCTOR_APPROVAL_REQUESTED',
        'DOCTOR_PROPOSED_NEW_TIME',
        'DOCTOR_POSTPONED',
        'DOCTOR_APPROVED',
        'CONSULTATION_CONFIRMED',
        'CONSULTATION_STARTED',
        'PRESCRIPTION_CREATED',
        'PRESCRIPTION_SENT',
        'CASE_COMPLETED',
      ])
      const [outbox] = await db.select().from(notificationOutbox).where(eq(notificationOutbox.id, job!.id))
      expect(JSON.stringify(outbox)).not.toContain('never-stored')

      // Intake can no longer be submitted against a completed case
      loginAs(adminId)
      expect((await intakeRoute(jsonRequest(`/api/admin/cases/${id}/intake`, intake), params(id))).status).toBe(409)

      // A new WhatsApp message after completion starts a fresh case
      const sender = (await getCase(id)).whatsappPhone!
      const again = await sendWhatsApp(sender, 'Salam')
      expect(again.body.results[0].consultationId).not.toBe(id)
    })

    it('outbound-result rejects unknown jobs and mismatched consultations', async () => {
      const { id } = await caseAt('ADMIN_INTAKE', { adminId, doctorId })
      const [job] = await jobsOfType('ADMIN_NEW_CASE')
      let res: Response = await outboundResultHook(jsonRequest('/api/hooks/outbound-result', { jobId: crypto.randomUUID(), success: true }, hookHeaders))
      expect(res.status).toBe(404)
      res = await outboundResultHook(jsonRequest('/api/hooks/outbound-result', { jobId: job!.id, consultationId: crypto.randomUUID(), success: true }, hookHeaders))
      expect(res.status).toBe(400)
      res = await outboundResultHook(jsonRequest('/api/hooks/outbound-result', { idempotencyKey: job!.idempotencyKey, consultationId: id, success: true, wamid: 'wamid.A' }, hookHeaders))
      expect(res.status).toBe(200)
      expect((await res.json()).jobStatus).toBe('sent')
    })
  })

  describe('n8n error hook', () => {
    it('stores only sanitized operational fields, idempotently', async () => {
      const body = {
        workflowName: 'eTabib - Outbound Sender',
        workflowId: 'wf_1',
        node: 'Send WhatsApp',
        executionId: 4242,
        timestamp: new Date().toISOString(),
        errorMessage: 'Request failed: Authorization: Bearer SECRETVALUE for +923001234567 ' + 'z'.repeat(1000),
        rawPayload: { patient: 'Synthetic', complaint: 'should never be stored' },
        credentials: { token: 'nope' },
      }
      for (let i = 0; i < 2; i++) {
        const res = await n8nErrorHook(jsonRequest('/api/hooks/n8n-error', body, hookHeaders))
        expect(res.status).toBe(200)
      }
      const rows = await db.select().from(integrationErrors)
      expect(rows).toHaveLength(1)
      expect(rows[0]).toMatchObject({ workflowName: 'eTabib - Outbound Sender', node: 'Send WhatsApp', executionId: '4242' })
      const stored = JSON.stringify(rows[0])
      expect(stored).not.toMatch(/SECRETVALUE|3001234567|should never be stored|nope/)
      expect(rows[0]!.errorMessage!.length).toBeLessThanOrEqual(500)
      expect((await n8nErrorHook(jsonRequest('/api/hooks/n8n-error', { node: 'x' }, hookHeaders))).status).toBe(400)
    })
  })

  describe('outbound dispatch', () => {
    it('posts jobs to the configured n8n sender with the shared key and claims them once', async () => {
      const { id } = await caseAt('ADMIN_INTAKE', { adminId, doctorId })
      const [job] = await jobsOfType('ADMIN_NEW_CASE')
      process.env.ETABIB_N8N_OUTBOUND_URL = 'https://n8n.example.test/webhook/outbound'
      process.env.ETABIB_N8N_OUTBOUND_KEY = 'test-outbound-key'
      const fetchMock = vi.fn().mockResolvedValue(new Response('{}', { status: 200 }))
      vi.stubGlobal('fetch', fetchMock)
      try {
        const results = await Promise.all([dispatchOutboundJobs([job!.id]), dispatchOutboundJobs([job!.id])])
        expect(results.flat().filter((r) => r.dispatched)).toHaveLength(1)
        expect(fetchMock).toHaveBeenCalledTimes(1)
        const [url, init] = fetchMock.mock.calls[0]!
        expect(url).toBe('https://n8n.example.test/webhook/outbound')
        expect(init.headers['x-etabib-key']).toBe('test-outbound-key')
        const payload = JSON.parse(init.body)
        expect(payload).toMatchObject({ jobId: job!.id, type: 'ADMIN_NEW_CASE', audience: 'ADMIN', consultationId: id })
        expect(payload.data).toMatchObject({ consultationId: id, patientName: 'Synthetic Patient', patientPhone: '+923001234567' })
        expect(Object.keys(payload.data).sort()).toEqual(['consultationId', 'createdAt', 'patientName', 'patientPhone'])

        // Patient jobs carry Pashto text and the WhatsApp recipient
        const [ask] = await jobsOfType('ASK_PATIENT_NAME')
        await dispatchOutboundJobs([ask!.id])
        const askPayload = JSON.parse(fetchMock.mock.calls[1]![1].body)
        expect(askPayload.audience).toBe('PATIENT')
        expect(askPayload.to).toMatch(/^\+92/)
        expect(askPayload.text).toContain('نوم')
      } finally {
        vi.unstubAllGlobals()
        delete process.env.ETABIB_N8N_OUTBOUND_URL
        delete process.env.ETABIB_N8N_OUTBOUND_KEY
      }
    })

    it('leaves jobs pending when n8n is not configured or rejects', async () => {
      await caseAt('ADMIN_INTAKE', { adminId, doctorId })
      const [job] = await jobsOfType('ADMIN_NEW_CASE')
      expect((await dispatchOutboundJobs([job!.id]))[0]!.reason).toBe('outbound_not_configured')
      process.env.ETABIB_N8N_OUTBOUND_URL = 'https://n8n.example.test/webhook/outbound'
      process.env.ETABIB_N8N_OUTBOUND_KEY = 'test-outbound-key'
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('no', { status: 503 })))
      try {
        expect((await dispatchOutboundJobs([job!.id]))[0]).toMatchObject({ dispatched: false, reason: 'http_503' })
        const [after] = await db.select().from(notificationOutbox).where(eq(notificationOutbox.id, job!.id))
        expect(after).toMatchObject({ status: 'pending', attempts: 1, lastError: 'http_503' })
      } finally {
        vi.unstubAllGlobals()
        delete process.env.ETABIB_N8N_OUTBOUND_URL
        delete process.env.ETABIB_N8N_OUTBOUND_KEY
      }
    })
  })
})
