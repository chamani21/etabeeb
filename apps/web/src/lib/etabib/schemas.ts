import { z } from 'zod'
import { NextRequest } from 'next/server'
import { EtabibError } from './errors'
import { normalizePhone } from './phone'
import { CANCELLATION_REASONS } from './transitions'
import { prescriptionItemSchema } from '@/lib/prescriptions'

export const caseIdSchema = z.string().uuid()

/** Validate the [id] route segment. */
export function parseCaseId(id: string | undefined): string {
  const parsed = caseIdSchema.safeParse(id)
  if (!parsed.success) throw new EtabibError('invalid_id', 'Invalid consultation id', 400)
  return parsed.data
}

/** Read the raw request body (size-capped) exactly as received. */
export async function readRawBody(req: NextRequest, maxBytes = 64 * 1024): Promise<string> {
  const raw = await req.text()
  if (Buffer.byteLength(raw, 'utf8') > maxBytes) throw new EtabibError('payload_too_large', 'Payload too large', 413)
  if (raw.trim().length === 0) throw new EtabibError('invalid_json', 'Request body is required', 400)
  return raw
}

/** Parse an already-read body; malformed JSON → 400. */
export function parseJsonBody(raw: string): unknown {
  try {
    return JSON.parse(raw)
  } catch {
    throw new EtabibError('invalid_json', 'Malformed JSON', 400)
  }
}

/** Read a JSON body with a size cap; malformed JSON → 400. */
export async function readJson(req: NextRequest, maxBytes = 64 * 1024): Promise<unknown> {
  return parseJsonBody(await readRawBody(req, maxBytes))
}

const isoDateTime = z
  .string()
  .datetime({ offset: true })
  .transform((v) => new Date(v))

const futureDateTime = isoDateTime.refine((d) => d.getTime() > Date.now(), 'Time must be in the future')

const trimmed = (min: number, max: number) => z.string().trim().min(min).max(max)

const phoneSchema = z
  .string()
  .max(32)
  .transform((v, ctx) => {
    const phone = normalizePhone(v)
    if (!phone) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Invalid phone number' })
      return z.NEVER
    }
    return phone
  })

export const intakeSchema = z
  .object({
    age: z.number().int().min(0).max(130),
    sex: z.enum(['MALE', 'FEMALE']),
    consultationFor: z.enum(['SELF', 'OTHER']),
    location: trimmed(2, 200),
    mainComplaint: trimmed(3, 1000),
    medicalHistory: z.string().trim().max(4000).nullable().optional(),
    // Optional corrections of bot-collected data
    patientName: trimmed(2, 80).optional(),
    patientPhone: phoneSchema.optional(),
  })
  .strict()

export const adminNotesSchema = z.object({ notes: z.string().trim().max(4000).nullable() }).strict()

const optionalSection = z.string().trim().max(2000).nullable().optional()

// .strict(): paymentConfirmedBy / paymentConfirmedAt from the client are rejected
export const paymentSchema = z
  .object({
    received: z.boolean(),
    source: z.enum(['EASYPAISA', 'OTHER']),
    reference: z.string().trim().min(1).max(100).nullable().optional(),
    amount: z.number().int().min(0).max(10_000_000).nullable().optional(),
  })
  .strict()

export const requestApprovalSchema = z
  .object({ proposedConsultationTime: futureDateTime })
  .strict()

export const doctorDecisionSchema = z.discriminatedUnion('decision', [
  z
    .object({
      decision: z.literal('APPROVED'),
      approvedTime: isoDateTime,
      consultationLink: z
        .string()
        .url()
        .max(500)
        .refine((u) => u.startsWith('https://'), 'Consultation link must use https')
        .nullable()
        .optional(),
    })
    .strict(),
  z
    .object({
      decision: z.literal('PROPOSE_NEW_TIME'),
      proposedTime: futureDateTime.optional(),
      approvedTime: futureDateTime.optional(), // accepted as the candidate time
    })
    .strict(),
  z.object({ decision: z.literal('POSTPONED') }).strict(),
  z.object({ decision: z.literal('REJECTED') }).strict(),
]).superRefine((v, ctx) => {
  if (v.decision === 'PROPOSE_NEW_TIME' && !v.proposedTime && !v.approvedTime) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['proposedTime'], message: 'proposedTime is required' })
  }
})

/** Cancellation: a reason code is mandatory; a short note only (and required) for OTHER. */
export const cancelCaseSchema = z
  .object({
    reason: z.enum(CANCELLATION_REASONS),
    note: z.string().trim().max(200).nullable().optional(),
  })
  .strict()
  .superRefine((v, ctx) => {
    if (v.reason === 'OTHER' && !v.note) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['note'], message: 'A short note is required for "Other"' })
  })

const rxText = (max: number) => z.string().trim().max(max).nullable().optional()
const rxMedicineSchema = z
  .object({
    name: z.string().trim().max(160),
    strength: rxText(60),
    formulation: rxText(60),
    route: rxText(60),
    dose: rxText(120),
    frequency: rxText(120),
    timing: rxText(120),
    duration: rxText(60),
    instructions: rxText(500),
  })
  .strict()

/** Prescription draft (doctor). Nothing is mandatory except a name per medicine row actually used. */
export const rxDraftSchema = z
  .object({
    diagnosis: rxText(500),
    vitals: z
      .object({ weight: rxText(30), bp: rxText(30), pulse: rxText(30), temperature: rxText(30), respiratoryRate: rxText(30) })
      .strict()
      .nullable()
      .optional(),
    medicines: z.array(rxMedicineSchema).max(40),
    freeText: rxText(4000),
    investigations: rxText(2000),
    advice: rxText(3000),
    followUp: rxText(1000),
    followUpInterval: rxText(60),
    redFlags: rxText(1500),
  })
  .strict()

export const rxSendSchema = z.object({ complete: z.boolean().optional() }).strict()
export const rxCopySchema = z.object({ fromPrescriptionId: z.string().uuid() }).strict()
export const rxVoicePatchSchema = z.object({ includeInDelivery: z.boolean() }).strict()
export const rxRetrySchema = z.object({ jobId: z.string().uuid() }).strict()

export const casePrescriptionSchema = z
  .object({
    items: z.array(prescriptionItemSchema).min(1).max(30),
    diagnosis: optionalSection,
    investigations: optionalSection,
    advice: optionalSection,
    followUp: optionalSection,
    notes: optionalSection,
  })
  .strict()

// ---- P1 schemas ----

export const senderPurposeSchema = z.enum(['PATIENT_TEST', 'STAFF', 'PILOT_PATIENT', 'BLOCKED'])
export const senderCreateSchema = z
  .object({
    phone: z.string().trim().min(5).max(32),
    label: trimmed(1, 80),
    purpose: senderPurposeSchema,
    notes: z.string().trim().max(500).nullable().optional(),
  })
  .strict()
export const senderUpdateSchema = z
  .object({
    label: trimmed(1, 80).optional(),
    purpose: senderPurposeSchema.optional(),
    notes: z.string().trim().max(500).nullable().optional(),
    active: z.boolean().optional(),
  })
  .strict()
  .refine((v) => Object.keys(v).length > 0, 'No changes supplied')

export const passwordChangeSchema = z
  .object({
    currentPassword: z.string().min(1).max(256),
    newPassword: z.string().min(1).max(256),
    confirmPassword: z.string().min(1).max(256),
  })
  .strict()

export const passwordResetCompleteSchema = z
  .object({
    token: z.string().regex(/^[A-Za-z0-9_-]{20,100}$/),
    newPassword: z.string().min(1).max(256),
    confirmPassword: z.string().min(1).max(256),
  })
  .strict()

export const caseListQuerySchema = z.object({
  status: z.enum(['NEW', 'ADMIN_INTAKE', 'INTAKE_COMPLETE', 'AWAITING_PAYMENT', 'PAYMENT_RECEIVED', 'AWAITING_DOCTOR_APPROVAL', 'CONFIRMED', 'IN_CONSULTATION', 'PRESCRIPTION_SENT', 'COMPLETED', 'CANCELLED', 'OPEN', 'ALL']).default('OPEN'),
  q: z.string().trim().max(80).optional(),
})

export const outboundResultSchema = z
  .object({
    jobId: z.string().uuid().optional(),
    idempotencyKey: z.string().min(1).max(300).optional(),
    consultationId: z.string().uuid().optional(),
    type: z.string().max(64).optional(),
    messageType: z.string().max(64).optional(),
    success: z.boolean(),
    status: z.enum(['sent', 'delivered', 'read', 'failed']).optional(),
    wamid: z.string().min(1).max(256).optional(),
    error: z
      .object({
        code: z.union([z.string().max(100), z.number()]).optional(),
        message: z.string().optional(),
      })
      .optional(),
  })
  // unknown keys are stripped (never stored)
  .refine((v) => v.jobId || v.idempotencyKey, 'jobId or idempotencyKey is required')

export const n8nErrorSchema = z.object({
  workflowName: trimmed(1, 200),
  workflowId: z.union([z.string(), z.number()]).transform(String).pipe(z.string().max(100)).optional(),
  node: z.string().trim().max(200).optional(),
  executionId: z.union([z.string(), z.number()]).transform(String).pipe(z.string().max(100)).optional(),
  timestamp: isoDateTime.optional(),
  errorMessage: z.string().optional(),
  // Any other keys (raw payloads, items, credentials) are stripped by Zod
})
