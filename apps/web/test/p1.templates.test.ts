/**
 * P1.6 — WhatsApp template support: configuration, strict payloads, intent →
 * template selection, text path unchanged, prescription text built in the
 * backend, callbacks still drive the state machine.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { db } from '@etabeeb/db'
import { notificationOutbox } from '@etabeeb/db/schema'
import { eq } from 'drizzle-orm'
import {
  TEMPLATE_DEFINITIONS,
  MESSAGE_INTENTS,
  buildTemplatePayload,
  getApprovedTemplates,
  sanitizeTemplateParam,
  templatePayloadSchema,
} from '@/lib/etabib/templates'
import { dispatchOutboundJobs } from '@/lib/etabib/outbound'
import { applyOutboundResult, createCasePrescription } from '@/lib/etabib/cases'
import { hasTestDb, resetDb, createUser, getCase, jobsOfType, caseAt, rxItems } from './helpers'

describe('template configuration and payloads', () => {
  afterEach(() => delete process.env.ETABIB_WA_TEMPLATES)

  it('is empty by default and fails safe on invalid JSON/shape', () => {
    expect(getApprovedTemplates()).toEqual({})
    process.env.ETABIB_WA_TEMPLATES = '{not json'
    expect(getApprovedTemplates()).toEqual({})
    process.env.ETABIB_WA_TEMPLATES = JSON.stringify({ DOCTOR_APPROVAL_REQUEST: { name: 'Bad Name!', language: 'en' } })
    expect(getApprovedTemplates()).toEqual({})
    process.env.ETABIB_WA_TEMPLATES = JSON.stringify({ DOCTOR_APPROVAL_REQUEST: { name: 'x', language: 'en', extra: 1 } })
    expect(getApprovedTemplates()).toEqual({})
  })

  it('accepts approved templates for known intents only', () => {
    process.env.ETABIB_WA_TEMPLATES = JSON.stringify({
      DOCTOR_APPROVAL_REQUEST: { name: 'etabib_doctor_approval_v1', language: 'en' },
      NOT_AN_INTENT: { name: 'x', language: 'en' },
    })
    expect(getApprovedTemplates()).toEqual({ DOCTOR_APPROVAL_REQUEST: { name: 'etabib_doctor_approval_v1', language: 'en' } })
  })

  it('every intent has a documented definition with matching placeholders', () => {
    for (const intent of MESSAGE_INTENTS) {
      const def = TEMPLATE_DEFINITIONS[intent]
      const placeholders = def.body.match(/\{\{\d+\}\}/g) ?? []
      expect(placeholders).toHaveLength(def.params.length)
      expect(def.proposedName).toMatch(/^[a-z0-9_]+$/)
      if (def.audience === 'PATIENT') expect(def.language).toBe('ps_AF')
    }
  })

  it('sanitizes parameters (no newlines/tabs/runs of spaces, length capped, never empty)', () => {
    expect(sanitizeTemplateParam('a\nb\tc')).toBe('a / b / c')
    expect(sanitizeTemplateParam('a      b')).toBe('a b')
    expect(sanitizeTemplateParam(null)).toBe('-')
    expect(sanitizeTemplateParam('x'.repeat(500)).length).toBe(300)
  })

  it('builds a strictly valid payload and rejects wrong parameter counts or arbitrary structure', () => {
    const t = buildTemplatePayload('ADMIN_NEW_CASE', { name: 'etabib_admin_new_case_v2', language: 'en' }, ['Syn', '+920000000000', 'https://wa.me/920000000000', 'https://staging.example.test/admin/cases/abcd1234', 'abcd1234'])
    expect(t.components[0]!.parameters).toHaveLength(5)
    expect(() => buildTemplatePayload('ADMIN_NEW_CASE', { name: 'etabib_admin_new_case_v2', language: 'en' }, ['only one'])).toThrow()
    // browser-style injection attempts are not valid template payloads
    for (const bad of [
      { name: 'x', language: 'en', components: [{ type: 'header', parameters: [] }] },
      { name: 'x', language: 'en', components: [{ type: 'body', parameters: [{ type: 'image', image: { link: 'https://evil' } }] }] },
      { name: 'x', language: 'en', components: [{ type: 'body', parameters: [{ type: 'text', text: 'a\nb' }] }] },
      { name: 'x', language: 'en', components: [], namespace: 'other' },
    ]) {
      expect(templatePayloadSchema.safeParse(bad).success).toBe(false)
    }
  })
})

describe.skipIf(!hasTestDb)('template transport', () => {
  let adminId: string
  let doctorId: string
  let fetchMock: ReturnType<typeof vi.fn>
  const sent = () => fetchMock.mock.calls.map((c) => JSON.parse(c[1].body))
  beforeEach(async () => {
    await resetDb()
    adminId = await createUser('Synthetic Admin')
    doctorId = await createUser('Synthetic Doctor')
    process.env.ETABIB_ADMIN_WHATSAPP = '+923009990001'
    process.env.ETABIB_DOCTOR_WHATSAPP = '+923009990002'
    process.env.ETABIB_N8N_OUTBOUND_URL = 'https://n8n.example.test/webhook/outbound'
    process.env.ETABIB_N8N_OUTBOUND_KEY = 'test-outbound-key'
    fetchMock = vi.fn().mockResolvedValue(new Response('{}', { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)
  })
  afterEach(() => {
    vi.unstubAllGlobals()
    delete process.env.ETABIB_WA_TEMPLATES
    delete process.env.ETABIB_N8N_OUTBOUND_URL
    delete process.env.ETABIB_N8N_OUTBOUND_KEY
  })

  it('text path is unchanged when no template is approved', async () => {
    await caseAt('AWAITING_DOCTOR_APPROVAL', { adminId, doctorId })
    const [job] = await jobsOfType('DOCTOR_APPROVAL_REQUEST')
    await dispatchOutboundJobs([job!.id])
    const [p] = sent()
    expect(p).toMatchObject({ messageKind: 'text', type: 'DOCTOR_APPROVAL_REQUEST', to: '+923009990002' })
    expect(p.text).toContain('Consultation approval required')
    expect(p.template).toBeUndefined()
  })

  it('an approved intent is sent as a template (no free text); other intents stay text', async () => {
    process.env.ETABIB_WA_TEMPLATES = JSON.stringify({ DOCTOR_APPROVAL_REQUEST: { name: 'etabib_doctor_approval_v1', language: 'en' } })
    await caseAt('AWAITING_DOCTOR_APPROVAL', { adminId, doctorId })
    const [approval] = await jobsOfType('DOCTOR_APPROVAL_REQUEST')
    const [adminJob] = await jobsOfType('ADMIN_NEW_CASE')
    await dispatchOutboundJobs([approval!.id, adminJob!.id])
    const [a, b] = sent()
    expect(a.messageKind).toBe('template')
    expect(a.text).toBeUndefined()
    expect(a.template).toMatchObject({ name: 'etabib_doctor_approval_v1', language: 'en' })
    expect(a.template.components[0].parameters).toHaveLength(5)
    expect(templatePayloadSchema.safeParse(a.template).success).toBe(true)
    expect(JSON.stringify(a.template)).not.toMatch(/\\n/)
    expect(a.idempotencyKey).toBe(approval!.idempotencyKey)
    expect(b.messageKind).toBe('text')
  })

  it('admin new-case notice has action links: chat with the patient and open the intake (text and template)', async () => {
    process.env.NEXT_PUBLIC_APP_URL = 'https://staging.example.test/'
    const { id } = await caseAt('ADMIN_INTAKE', { adminId, doctorId })
    const c = await getCase(id)
    const chat = `https://wa.me/${c.whatsappPhone!.replace(/\D/g, '')}?text=${encodeURIComponent('Hello, this is eTabeeb regarding your online consultation request.')}`
    const [job] = await jobsOfType('ADMIN_NEW_CASE')
    await dispatchOutboundJobs([job!.id])
    const text = sent()[0].text as string
    expect(text).toContain('eTabeeb — New consultation request')
    expect(text).toContain(`💬 Chat with patient\n${chat}`)
    expect(text).toContain(`📋 Open intake form\nhttps://staging.example.test/admin/cases/${id}`)
    // the full UUID appears only inside the case URL; elsewhere just a short reference
    expect(text.replace(`https://staging.example.test/admin/cases/${id}`, '')).not.toContain(id)
    expect(text).toContain(`Ref: ${id.slice(0, 8)}`)
    process.env.ETABIB_WA_TEMPLATES = JSON.stringify({ ADMIN_NEW_CASE: { name: 'etabib_admin_new_case_v2', language: 'en' } })
    await db.update(notificationOutbox).set({ status: 'pending' }).where(eq(notificationOutbox.id, job!.id))
    await dispatchOutboundJobs([job!.id])
    const params = sent()[1].template.components[0].parameters
    expect(params).toHaveLength(5)
    expect(params[2].text).toBe(chat)
    expect(params[3].text).toBe(`https://staging.example.test/admin/cases/${id}`)
    delete process.env.NEXT_PUBLIC_APP_URL
  })

  it('patient conversational replies are always text, even if every intent is approved', async () => {
    process.env.ETABIB_WA_TEMPLATES = JSON.stringify(Object.fromEntries(MESSAGE_INTENTS.map((i) => [i, { name: TEMPLATE_DEFINITIONS[i].proposedName, language: TEMPLATE_DEFINITIONS[i].language }])))
    await caseAt('ADMIN_INTAKE', { adminId, doctorId })
    const ask = await jobsOfType('ASK_PATIENT_NAME')
    await dispatchOutboundJobs(ask.map((j) => j.id))
    expect(sent().every((p) => p.messageKind === 'text')).toBe(true)
  })

  it('prescription text is built by the backend in Pashto with all sections; n8n receives no item list', async () => {
    const { id } = await caseAt('IN_CONSULTATION', { adminId, doctorId })
    await createCasePrescription(id, rxItems, { type: 'DOCTOR', id: doctorId }, { diagnosis: 'SYN diagnosis', advice: 'SYN advice', followUp: 'SYN follow-up' })
    const [job] = await jobsOfType('PRESCRIPTION_READY')
    await dispatchOutboundJobs([job!.id])
    const [p] = sent()
    expect(p.messageKind).toBe('text')
    for (const s of ['نسخه', 'تشخیص: SYN diagnosis', 'درمل:', '1. Paracetamol 500mg - 1 tablet | twice daily', 'مشورې: SYN advice', 'بیا کتنه: SYN follow-up']) {
      expect(p.text).toContain(s)
    }
    expect(p.data).toEqual({ prescription: { number: expect.stringMatching(/^[0-9A-F]{8}$/), textComplete: true } })
  })

  it('prescription via approved template carries a one-line medicine summary', async () => {
    process.env.ETABIB_WA_TEMPLATES = JSON.stringify({ PATIENT_PRESCRIPTION_READY: { name: 'etabib_prescription_ready_ps_v1', language: 'ps_AF' } })
    const { id } = await caseAt('IN_CONSULTATION', { adminId, doctorId })
    await createCasePrescription(id, rxItems, { type: 'DOCTOR', id: doctorId })
    const [job] = await jobsOfType('PRESCRIPTION_READY')
    await dispatchOutboundJobs([job!.id])
    const [p] = sent()
    expect(p.template).toMatchObject({ name: 'etabib_prescription_ready_ps_v1', language: 'ps_AF' })
    expect(p.template.components[0].parameters[1].text).toContain('Paracetamol')
  })

  it('callback success (with wamid) completes the case; a failure leaves it IN_CONSULTATION', async () => {
    process.env.ETABIB_WA_TEMPLATES = JSON.stringify({ PATIENT_PRESCRIPTION_READY: { name: 'etabib_prescription_ready_ps_v1', language: 'ps_AF' } })
    const ok = await caseAt('PRESCRIBED', { adminId, doctorId })
    const okJob = (await jobsOfType('PRESCRIPTION_READY')).find((j) => JSON.parse(j.templateVariables!).consultationId === ok.id)!
    const failed = await applyOutboundResult({ jobId: okJob.id, success: false, status: 'failed', error: { code: 131047, message: 'Re-engagement message' } })
    expect(failed.consultationStatus).toBe('IN_CONSULTATION')
    const done = await applyOutboundResult({ jobId: okJob.id, success: true, status: 'sent', wamid: 'wamid.SYN.TEMPLATE.1' })
    expect(done.consultationStatus).toBe('COMPLETED')
    expect((await getCase(ok.id)).status).toBe('COMPLETED')
    const [row] = await db.select().from(notificationOutbox).where(eq(notificationOutbox.id, okJob.id))
    expect(row!.providerMessageId).toBe('wamid.SYN.TEMPLATE.1')
  })
})
