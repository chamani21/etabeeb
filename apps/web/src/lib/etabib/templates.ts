/**
 * eTabib V1 — WhatsApp template support (P1).
 *
 * Free-form text only reaches a recipient inside Meta's 24-hour customer-care
 * window. Business-initiated messages (staff notices, confirmations, the
 * prescription) need an APPROVED template outside that window.
 *
 * The backend decides intent, recipient, language and parameters; n8n only
 * transports. A template is used for an intent ONLY when it is listed in
 * ETABIB_WA_TEMPLATES (i.e. created AND approved in WhatsApp Manager):
 *
 *   ETABIB_WA_TEMPLATES='{"DOCTOR_APPROVAL_REQUEST":{"name":"etabib_doctor_approval_v1","language":"en"}}'
 *
 * Unlisted intents keep the existing text path (valid inside the 24-hour
 * window). Conversational patient replies (ask name/phone, acknowledgement,
 * case-in-progress) are always text: the patient has just written to us.
 *
 * Proposed template definitions (exact body text) are documented in
 * docs/ETABIB_V1_WHATSAPP_TEMPLATES.md and mirrored in TEMPLATE_DEFINITIONS.
 */
import { z } from 'zod'
import { getTemplateConfigRaw } from './config'
import type { OutboundJobType } from './outbound'

export const MESSAGE_INTENTS = [
  'ADMIN_NEW_CASE',
  'DOCTOR_APPROVAL_REQUEST',
  'CONSULTATION_CONFIRMED',
  'CONSULTATION_CONFIRMED_DOCTOR',
  'CONSULTATION_TIME_CHANGED',
  'PATIENT_PRESCRIPTION_READY',
  'FOLLOWUP_REMINDER',
  'CONSULTATION_CANCELLED',
  'ADMIN_CONSULTATION_CANCELLED',
  'DOCTOR_CONSULTATION_CANCELLED',
] as const
export type MessageIntent = (typeof MESSAGE_INTENTS)[number]

/** Outbound job type → template intent (business-initiated messages only). */
export const JOB_INTENT: Readonly<Partial<Record<OutboundJobType, MessageIntent>>> = {
  ADMIN_NEW_CASE: 'ADMIN_NEW_CASE',
  DOCTOR_APPROVAL_REQUEST: 'DOCTOR_APPROVAL_REQUEST',
  CONSULTATION_CONFIRMED_PATIENT: 'CONSULTATION_CONFIRMED',
  CONSULTATION_CONFIRMED_DOCTOR: 'CONSULTATION_CONFIRMED_DOCTOR',
  PRESCRIPTION_READY: 'PATIENT_PRESCRIPTION_READY',
  CONSULTATION_CANCELLED_PATIENT: 'CONSULTATION_CANCELLED',
  CONSULTATION_CANCELLED_ADMIN: 'ADMIN_CONSULTATION_CANCELLED',
  CONSULTATION_CANCELLED_DOCTOR: 'DOCTOR_CONSULTATION_CANCELLED',
}

export interface TemplateDefinition {
  intent: MessageIntent
  proposedName: string
  /** Meta language code. Patient templates are Pashto; staff templates English. */
  language: string
  audience: 'PATIENT' | 'ADMIN' | 'DOCTOR'
  category: 'UTILITY'
  /** Body parameter order ({{1}}, {{2}}, …). */
  params: readonly string[]
  /** Proposed body text submitted for approval (documentation + tests). */
  body: string
  /** Whether a backend trigger currently enqueues this intent. */
  wired: boolean
}

export const TEMPLATE_DEFINITIONS: Readonly<Record<MessageIntent, TemplateDefinition>> = {
  ADMIN_NEW_CASE: {
    intent: 'ADMIN_NEW_CASE', proposedName: 'etabib_admin_new_case_v2', language: 'en', audience: 'ADMIN', category: 'UTILITY',
    params: ['patientName', 'patientPhone', 'receivedAt', 'chatUrl', 'caseUrl'],
    body: 'eTabeeb — New consultation. Patient: {{1}}. Phone: {{2}}. Received: {{3}}. Chat with patient: {{4}} Open intake: {{5}}',
    wired: true,
  },
  DOCTOR_APPROVAL_REQUEST: {
    intent: 'DOCTOR_APPROVAL_REQUEST', proposedName: 'etabib_doctor_approval_v2', language: 'en', audience: 'DOCTOR', category: 'UTILITY',
    params: ['patientName', 'ageSex', 'location', 'proposedTime', 'caseUrl'],
    body: 'eTabeeb — Approval needed. Patient: {{1}}. Age/Sex: {{2}}. Location: {{3}}. Time: {{4}}. Review & approve: {{5}} Clinical details are available in the secure dashboard.',
    wired: true,
  },
  CONSULTATION_CONFIRMED: {
    intent: 'CONSULTATION_CONFIRMED', proposedName: 'etabib_consultation_confirmed_ps_v2', language: 'ps_AF', audience: 'PATIENT', category: 'UTILITY',
    params: ['time', 'link', 'helpUrl'],
    body: 'ستاسو مشوره له ډاکټر جلال الدین سره تایید شوه. وخت: {{1}}. د مشورې لینک: {{2}} مرستې لپاره: {{3}}',
    wired: true,
  },
  CONSULTATION_CONFIRMED_DOCTOR: {
    intent: 'CONSULTATION_CONFIRMED_DOCTOR', proposedName: 'etabib_doctor_confirmed_v2', language: 'en', audience: 'DOCTOR', category: 'UTILITY',
    params: ['patientName', 'time', 'caseUrl'],
    body: 'eTabeeb — Consultation confirmed. Patient: {{1}}. Time: {{2}}. Open case & join video: {{3}}',
    wired: true,
  },
  CONSULTATION_TIME_CHANGED: {
    intent: 'CONSULTATION_TIME_CHANGED', proposedName: 'etabib_time_changed_ps_v1', language: 'ps_AF', audience: 'PATIENT', category: 'UTILITY',
    params: ['time'],
    body: 'ستاسو د مشورې وخت بدل شو. نوی وخت: {{1}}. د پوښتنو لپاره همدې شمېرې ته ولیکئ.',
    wired: false,
  },
  PATIENT_PRESCRIPTION_READY: {
    intent: 'PATIENT_PRESCRIPTION_READY', proposedName: 'etabib_prescription_ready_ps_v1', language: 'ps_AF', audience: 'PATIENT', category: 'UTILITY',
    params: ['prescriptionRef', 'medicines'],
    body: 'ستاسو نسخه چمتو ده. د نسخې شمېره: {{1}}. درمل: {{2}}. د بشپړې نسخې لپاره همدې شمېرې ته ځواب ولیکئ.',
    wired: true,
  },
  FOLLOWUP_REMINDER: {
    intent: 'FOLLOWUP_REMINDER', proposedName: 'etabib_followup_reminder_ps_v1', language: 'ps_AF', audience: 'PATIENT', category: 'UTILITY',
    params: ['time'],
    body: 'یادونه: ستاسو د بیا کتنې وخت له ډاکټر جلال الدین سره {{1}} دی.',
    wired: false,
  },
  CONSULTATION_CANCELLED: {
    intent: 'CONSULTATION_CANCELLED', proposedName: 'etabib_consultation_cancelled_ps', language: 'ps_AF', audience: 'PATIENT', category: 'UTILITY',
    params: ['name', 'reason', 'helpUrl'],
    body: 'محترم/محترمه {{1}}، ستاسو د eTabeeb آنلاین مشوره لغوه شوه. د لغوه کېدو لامل: {{2}}. که غواړئ بله مشوره وټاکئ یا کومه پوښتنه لرئ: {{3}}',
    wired: true,
  },
  ADMIN_CONSULTATION_CANCELLED: {
    intent: 'ADMIN_CONSULTATION_CANCELLED', proposedName: 'etabib_admin_consultation_cancelled_v1', language: 'en', audience: 'ADMIN', category: 'UTILITY',
    params: ['patientName', 'scheduledTime', 'reason', 'caseUrl'],
    body: 'eTabeeb — Consultation cancelled by doctor. Patient: {{1}}. Scheduled time: {{2}}. Reason: {{3}}. Open case: {{4}}',
    wired: true,
  },
  DOCTOR_CONSULTATION_CANCELLED: {
    intent: 'DOCTOR_CONSULTATION_CANCELLED', proposedName: 'etabib_doctor_consultation_cancelled_v1', language: 'en', audience: 'DOCTOR', category: 'UTILITY',
    params: ['patientName', 'scheduledTime', 'caseUrl'],
    body: 'eTabeeb — Consultation cancelled. Patient: {{1}}. Scheduled time: {{2}}. View case: {{3}}',
    wired: true,
  },
}

// ------------------------------------------------------------------
// Configuration (approved templates only)
// ------------------------------------------------------------------

const templateNameSchema = z.string().regex(/^[a-z0-9_]{1,512}$/)
const languageSchema = z.string().regex(/^[a-z]{2,3}(_[A-Z]{2})?$/)
const configSchema = z.record(z.string(), z.object({ name: templateNameSchema, language: languageSchema }).strict())

export interface ApprovedTemplate {
  name: string
  language: string
}

export function getApprovedTemplates(): Partial<Record<MessageIntent, ApprovedTemplate>> {
  const raw = getTemplateConfigRaw()
  if (!raw) return {}
  let json: unknown
  try {
    json = JSON.parse(raw)
  } catch {
    console.error('[etabib:templates] ETABIB_WA_TEMPLATES is not valid JSON; templates disabled')
    return {}
  }
  const parsed = configSchema.safeParse(json)
  if (!parsed.success) {
    console.error('[etabib:templates] ETABIB_WA_TEMPLATES has an invalid shape; templates disabled')
    return {}
  }
  const out: Partial<Record<MessageIntent, ApprovedTemplate>> = {}
  for (const [intent, value] of Object.entries(parsed.data)) {
    if ((MESSAGE_INTENTS as readonly string[]).includes(intent)) out[intent as MessageIntent] = value
  }
  return out
}

// ------------------------------------------------------------------
// Template payload (strictly validated before dispatch)
// ------------------------------------------------------------------

const paramSchema = z
  .object({ type: z.literal('text'), text: z.string().min(1).max(1024).refine((t) => !/[\n\t]| {5,}/.test(t)) })
  .strict()
export const templatePayloadSchema = z
  .object({
    name: templateNameSchema,
    language: languageSchema,
    components: z
      .array(z.object({ type: z.literal('body'), parameters: z.array(paramSchema).max(10) }).strict())
      .max(1),
  })
  .strict()
export type TemplatePayload = z.infer<typeof templatePayloadSchema>

/** Meta forbids newlines, tabs and 5+ consecutive spaces in parameters. */
export function sanitizeTemplateParam(value: unknown, max = 300): string {
  const text = (value === null || value === undefined ? '' : String(value))
    .replace(/[\r\n\t]+/g, ' / ')
    .replace(/ {2,}/g, ' ')
    .trim()
  const clipped = text.length > max ? `${text.slice(0, max - 3)}...` : text
  return clipped.length > 0 ? clipped : '-'
}

export function buildTemplatePayload(intent: MessageIntent, approved: ApprovedTemplate, values: readonly unknown[]): TemplatePayload {
  const def = TEMPLATE_DEFINITIONS[intent]
  if (values.length !== def.params.length) {
    throw new Error(`Template ${intent} expects ${def.params.length} parameters, got ${values.length}`)
  }
  const payload = {
    name: approved.name,
    language: approved.language,
    components: [{ type: 'body' as const, parameters: values.map((v) => ({ type: 'text' as const, text: sanitizeTemplateParam(v) })) }],
  }
  return templatePayloadSchema.parse(payload)
}
