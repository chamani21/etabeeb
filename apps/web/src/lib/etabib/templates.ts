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
  'PATIENT_PRESCRIPTION_IMAGE',
  'STAFF_HANDOVER_REQUEST',
  'STAFF_HANDOVER_RETURNED',
  'PATIENT_REPLY_INVITE',
] as const
export type MessageIntent = (typeof MESSAGE_INTENTS)[number]

/**
 * Outbound job type → template intent (business-initiated messages only).
 * PRESCRIPTION_IMAGE is special-cased in outbound.ts: the template (image header)
 * is used only for page 1 when the patient's 24-hour window is closed.
 */
export const JOB_INTENT: Readonly<Partial<Record<OutboundJobType, MessageIntent>>> = {
  ADMIN_NEW_CASE: 'ADMIN_NEW_CASE',
  DOCTOR_APPROVAL_REQUEST: 'DOCTOR_APPROVAL_REQUEST',
  CONSULTATION_CONFIRMED_PATIENT: 'CONSULTATION_CONFIRMED',
  CONSULTATION_CONFIRMED_DOCTOR: 'CONSULTATION_CONFIRMED_DOCTOR',
  CONSULTATION_CANCELLED_PATIENT: 'CONSULTATION_CANCELLED',
  CONSULTATION_CANCELLED_ADMIN: 'ADMIN_CONSULTATION_CANCELLED',
  CONSULTATION_CANCELLED_DOCTOR: 'DOCTOR_CONSULTATION_CANCELLED',
  STAFF_HANDOVER_REQUEST: 'STAFF_HANDOVER_REQUEST',
  STAFF_HANDOVER_RETURNED: 'STAFF_HANDOVER_RETURNED',
  INBOX_INVITE: 'PATIENT_REPLY_INVITE',
}

export interface TemplateDefinition {
  intent: MessageIntent
  /** Exact Meta template name (approved ones mirror WhatsApp Manager; others are proposals). */
  proposedName: string
  /** Meta language code. Patient templates are Pashto; staff templates English. */
  language: string
  audience: 'PATIENT' | 'ADMIN' | 'DOCTOR'
  category: 'UTILITY'
  /** Body parameter order ({{1}}, {{2}}, …). */
  params: readonly string[]
  /** Media header the template was approved with (its value is sent per message). */
  header?: 'IMAGE'
  /** Body text as approved in WhatsApp Manager (documentation + tests). */
  body: string
  /** Approved in WhatsApp Manager (verified from the Graph API inventory, 2026-10-06). */
  approved: boolean
  /** Whether a backend trigger currently enqueues this intent. */
  wired: boolean
}

const STAFF_CANCELLED_BODY = 'An eTabeeb consultation was cancelled {{1}}.\n\nPatient: {{2}}\nScheduled time: {{3}}\nReason: {{4}}\n\nOpen case: {{5}}\n\nNo further action is needed unless the patient requests another appointment.'

export const TEMPLATE_DEFINITIONS: Readonly<Record<MessageIntent, TemplateDefinition>> = {
  ADMIN_NEW_CASE: {
    intent: 'ADMIN_NEW_CASE', proposedName: 'etabib_admin_new_case_v2', language: 'en', audience: 'ADMIN', category: 'UTILITY',
    params: ['patientName', 'patientPhone', 'receivedAt', 'chatUrl', 'caseUrl'],
    body: 'New eTabeeb consultation request.\n\nPatient: {{1}}\nPhone: {{2}}\nReceived: {{3}}\n\nChat with patient: {{4}}\n\nOpen intake: {{5}}\n\nPlease complete the intake in the admin dashboard.',
    approved: true, wired: true,
  },
  DOCTOR_APPROVAL_REQUEST: {
    intent: 'DOCTOR_APPROVAL_REQUEST', proposedName: 'etabib_doctor_approval_request_v2', language: 'en', audience: 'DOCTOR', category: 'UTILITY',
    params: ['patientName', 'ageSex', 'location', 'proposedTime', 'caseUrl'],
    body: 'eTabeeb consultation approval needed.\n\nPatient: {{1}}\nAge/Sex: {{2}}\nLocation: {{3}}\nProposed time: {{4}}\n\nReview and approve: {{5}}\n\nClinical details are available in the secure doctor dashboard.',
    approved: true, wired: true,
  },
  CONSULTATION_CONFIRMED: {
    intent: 'CONSULTATION_CONFIRMED', proposedName: 'etabib_consultation_confirmed_ps', language: 'ps_AF', audience: 'PATIENT', category: 'UTILITY',
    params: ['name', 'time', 'link'],
    body: 'محترم/محترمه {{1}}،\n\nستاسو د eTabeeb مشوره تایید شوه.\n\nنېټه او وخت: {{2}}\nډاکټر: ډاکټر جلال الدین\n\nد مشورې لینک:\n{{3}}\n\nمهرباني وکړئ په ټاکلي وخت کې لینک خلاص کړئ.',
    approved: true, wired: true,
  },
  CONSULTATION_CONFIRMED_DOCTOR: {
    intent: 'CONSULTATION_CONFIRMED_DOCTOR', proposedName: 'etabib_doctor_confirmed_v2', language: 'en', audience: 'DOCTOR', category: 'UTILITY',
    params: ['patientName', 'caseUrl'],
    body: 'eTabeeb staff notification: The consultation for patient {{1}} has been confirmed.\n\nOpen the dashboard to review the confirmed consultation details:\n{{2}}\n\nPlease refer to the dashboard for the current arrangements.',
    approved: true, wired: true,
  },
  CONSULTATION_TIME_CHANGED: {
    intent: 'CONSULTATION_TIME_CHANGED', proposedName: 'etabib_consultation_time_changed_ps', language: 'ps_AF', audience: 'PATIENT', category: 'UTILITY',
    params: ['name', 'time'],
    body: 'محترم/محترمه {{1}}،\n\nستاسو د eTabeeb مشورې وخت بدل شوی دی.\n\nنوی وخت: {{2}}\n\nکه دا وخت درته مناسب وي، مهرباني وکړئ د مشورې لپاره په ټاکلي وخت کې حاضر اوسئ.',
    approved: true, wired: false,
  },
  PATIENT_PRESCRIPTION_READY: {
    // Legacy text-prescription notice. The approved one is MARKETING and links a page that does not exist: never used.
    intent: 'PATIENT_PRESCRIPTION_READY', proposedName: 'etabib_prescription_ready_ps', language: 'ps_AF', audience: 'PATIENT', category: 'UTILITY',
    params: ['name', 'link'],
    body: 'محترم/محترمه {{1}}،\n\nستاسو د eTabeeb مشوره بشپړه شوه او نسخه چمتو ده.\n\nتاسو کولی شئ خپله نسخه دلته وګورئ:\n{{2}}\n\nکه ډاکټر د بیا کتنې مشوره درکړې وي، مهرباني وکړئ د ټاکلي وخت مطابق تعقیب وکړئ.',
    approved: false, wired: false,
  },
  FOLLOWUP_REMINDER: {
    intent: 'FOLLOWUP_REMINDER', proposedName: 'etabib_followup_reminder_ps', language: 'ps_AF', audience: 'PATIENT', category: 'UTILITY',
    params: ['name', 'time'],
    body: 'محترم/محترمه {{1}}،\n\nدا د eTabeeb له خوا ستاسو د تعقیبي مشورې یادونه ده.\n\nنېټه او وخت: {{2}}\n\nکه ډاکټر کوم پخواني راپورونه یا معاینات درڅخه غوښتي وي، مهرباني وکړئ له ځان سره یې چمتو وساتئ.',
    approved: true, wired: false,
  },
  CONSULTATION_CANCELLED: {
    intent: 'CONSULTATION_CANCELLED', proposedName: 'etabib_consultation_cancelled_ps', language: 'ps_AF', audience: 'PATIENT', category: 'UTILITY',
    params: ['name', 'reason', 'helpUrl'],
    body: 'محترم/محترمه {{1}}،\n\nستاسو د eTabeeb آنلاین مشوره لغوه شوه.\n\nلامل: {{2}}\n\nکه غواړئ بله مشوره وټاکئ یا پوښتنه لرئ، دلته له موږ سره اړیکه ونیسئ:\n{{3}}\n\nمننه چې eTabeeb مو غوره کړ.',
    approved: true, wired: true,
  },
  ADMIN_CONSULTATION_CANCELLED: {
    intent: 'ADMIN_CONSULTATION_CANCELLED', proposedName: 'etabib_staff_consultation_cancelled', language: 'en', audience: 'ADMIN', category: 'UTILITY',
    params: ['byWhom', 'patientName', 'scheduledTime', 'reason', 'caseUrl'],
    body: STAFF_CANCELLED_BODY,
    approved: true, wired: true,
  },
  DOCTOR_CONSULTATION_CANCELLED: {
    intent: 'DOCTOR_CONSULTATION_CANCELLED', proposedName: 'etabib_staff_consultation_cancelled', language: 'en', audience: 'DOCTOR', category: 'UTILITY',
    params: ['byWhom', 'patientName', 'scheduledTime', 'reason', 'caseUrl'],
    body: STAFF_CANCELLED_BODY,
    approved: true, wired: true,
  },
  PATIENT_PRESCRIPTION_IMAGE: {
    intent: 'PATIENT_PRESCRIPTION_IMAGE', proposedName: 'etabib_prescription_ready_ps_v2', language: 'ps_AF', audience: 'PATIENT', category: 'UTILITY',
    params: ['name'], header: 'IMAGE',
    body: 'محترم/محترمه {{1}}،\n\nستاسو د eTabeeb مشوره بشپړه شوه. ستاسو نسخه په دې پیغام کې ده.\n\nکه ډاکټر غږیزه مشوره هم درکړې وي، د ترلاسه کولو لپاره دې پیغام ته ځواب ولیکئ.',
    approved: true, wired: true,
  },
  STAFF_HANDOVER_REQUEST: {
    intent: 'STAFF_HANDOVER_REQUEST', proposedName: 'etabib_staff_handover_request', language: 'en', audience: 'DOCTOR', category: 'UTILITY',
    params: ['patientName', 'chatUrl'],
    body: 'eTabeeb staff notification: An administrator has requested that you take over the conversation for patient {{1}}.\n\nOpen the dashboard to review and accept or decline:\n{{2}}\n\nThe administrator remains responsible until you accept.',
    approved: true, wired: true,
  },
  STAFF_HANDOVER_RETURNED: {
    intent: 'STAFF_HANDOVER_RETURNED', proposedName: 'etabib_staff_handover_returned', language: 'en', audience: 'ADMIN', category: 'UTILITY',
    params: ['patientName', 'chatUrl'],
    body: 'eTabeeb staff notification: The doctor has returned the conversation for patient {{1}} to you for further handling.\n\nOpen the dashboard to review the conversation and any internal instructions:\n{{2}}\n\nThis is an update to an existing patient conversation.',
    approved: true, wired: true,
  },
  PATIENT_REPLY_INVITE: {
    intent: 'PATIENT_REPLY_INVITE', proposedName: 'etabib_reply_invite_ps', language: 'ps_AF', audience: 'PATIENT', category: 'UTILITY',
    params: ['name'],
    body: 'محترم/محترمه {{1}}،\n\nستاسو د eTabeeb مشورې په اړه له تاسو سره خبرو ته اړتیا لرو.\n\nمهرباني وکړئ همدې پیغام ته ځواب راکړئ، ترڅو خبرې درسره دوام ورکړو.\n\nمننه.',
    approved: true, wired: true,
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
const headerImageSchema = z
  .object({ type: z.literal('header'), parameters: z.array(z.object({ type: z.literal('image'), image: z.object({ link: z.string().url().startsWith('https://').max(900) }).strict() }).strict()).length(1) })
  .strict()
const bodySchema = z.object({ type: z.literal('body'), parameters: z.array(paramSchema).max(10) }).strict()
export const templatePayloadSchema = z
  .object({
    name: templateNameSchema,
    language: languageSchema,
    components: z.array(z.union([headerImageSchema, bodySchema])).max(2),
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

export function buildTemplatePayload(
  intent: MessageIntent,
  approved: ApprovedTemplate,
  values: readonly unknown[],
  opts: { headerImageLink?: string } = {},
): TemplatePayload {
  const def = TEMPLATE_DEFINITIONS[intent]
  if (values.length !== def.params.length) {
    throw new Error(`Template ${intent} expects ${def.params.length} parameters, got ${values.length}`)
  }
  if (def.header === 'IMAGE' && !opts.headerImageLink) throw new Error(`Template ${intent} needs an image header`)
  const body = { type: 'body' as const, parameters: values.map((v) => ({ type: 'text' as const, text: sanitizeTemplateParam(v) })) }
  const payload = {
    name: approved.name,
    language: approved.language,
    components: def.header === 'IMAGE' ? [{ type: 'header' as const, parameters: [{ type: 'image' as const, image: { link: opts.headerImageLink! } }] }, body] : [body],
  }
  return templatePayloadSchema.parse(payload)
}
