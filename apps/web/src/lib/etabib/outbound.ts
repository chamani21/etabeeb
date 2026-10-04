/**
 * eTabib V1 — centralized outbound integration (app → n8n "eTabib - Outbound Sender").
 *
 * Reuses the existing transactional outbox table `notification_outbox`:
 *   - jobs are enqueued INSIDE the same DB transaction as the state change
 *   - `idempotency_key` (UNIQUE) makes enqueueing idempotent: a retried request
 *     or duplicate webhook can never create a second job
 *   - the row stores only references (job type, consultation id, message key),
 *     never clinical content; the full payload is built at dispatch time and
 *     only sent over HTTPS to n8n
 *   - after commit, `dispatchOutboundJobs` atomically claims each pending job
 *     (pending → processing) and POSTs it to n8n; n8n reports the delivery
 *     result to POST /api/hooks/outbound-result
 *
 * No n8n URL or key is referenced anywhere else in the codebase.
 */
import { db } from '@etabeeb/db'
import { notificationOutbox, consultationCases, prescriptions, prescriptionItems } from '@etabeeb/db/schema'
import type { ConsultationCase } from '@etabeeb/db'
import { and, eq, asc, lt, sql } from 'drizzle-orm'
import { ETABIB_KEY_HEADER, getAdminWhatsapp, getAppUrl, getDoctorWhatsapp, getOutboundConfig } from './config'
import { PATIENT_MESSAGES_PS, formatConsultationTimePs, formatPrescriptionTextPs } from './messages.ps'
import { STAFF_MESSAGES, clinicTime } from './messages.staff'
import { JOB_INTENT, buildTemplatePayload, getApprovedTemplates, type TemplatePayload } from './templates'
import type { Tx } from './transitions'
import { mintPatientJoinLink } from './video'

export const OUTBOUND_JOB_TYPES = [
  'ADMIN_NEW_CASE',
  'ASK_PATIENT_NAME',
  'ASK_PATIENT_PHONE',
  'PATIENT_ACKNOWLEDGED',
  'PATIENT_CASE_IN_PROGRESS',
  'DOCTOR_APPROVAL_REQUEST',
  'CONSULTATION_CONFIRMED_PATIENT',
  'CONSULTATION_CONFIRMED_DOCTOR',
  'PRESCRIPTION_READY',
] as const
export type OutboundJobType = (typeof OUTBOUND_JOB_TYPES)[number]

export type OutboundAudience = 'PATIENT' | 'ADMIN' | 'DOCTOR'

export const JOB_AUDIENCE: Readonly<Record<OutboundJobType, OutboundAudience>> = {
  ADMIN_NEW_CASE: 'ADMIN',
  ASK_PATIENT_NAME: 'PATIENT',
  ASK_PATIENT_PHONE: 'PATIENT',
  PATIENT_ACKNOWLEDGED: 'PATIENT',
  PATIENT_CASE_IN_PROGRESS: 'PATIENT',
  DOCTOR_APPROVAL_REQUEST: 'DOCTOR',
  CONSULTATION_CONFIRMED_PATIENT: 'PATIENT',
  CONSULTATION_CONFIRMED_DOCTOR: 'DOCTOR',
  PRESCRIPTION_READY: 'PATIENT',
}

/** Message variants for patient jobs (selects the Pashto string). */
export type PatientMessageKey = 'default' | 'invalid'

/** Stored in notification_outbox.template_variables — references only, no PHI. */
export interface OutboundJobRefs {
  consultationId: string
  messageKey?: PatientMessageKey
  prescriptionId?: string
}

export interface EnqueuedJob {
  id: string
  type: OutboundJobType
  idempotencyKey: string
  created: boolean
}

const KEY_PREFIX = 'etabib:'

/**
 * Enqueue a job inside the caller's transaction. `dedupeKey` must uniquely
 * identify the business occurrence (e.g. the inbound wamid, or case id +
 * proposed time) so retries map onto the same job.
 */
export async function enqueueOutboundJob(
  tx: Tx,
  input: {
    type: OutboundJobType
    consultationId: string
    dedupeKey: string
    recipientPhone?: string | null
    messageKey?: PatientMessageKey
    prescriptionId?: string
  },
): Promise<EnqueuedJob> {
  const idempotencyKey = `${KEY_PREFIX}${input.type}:${input.dedupeKey}`
  const refs: OutboundJobRefs = {
    consultationId: input.consultationId,
    ...(input.messageKey ? { messageKey: input.messageKey } : {}),
    ...(input.prescriptionId ? { prescriptionId: input.prescriptionId } : {}),
  }
  const inserted = await tx
    .insert(notificationOutbox)
    .values({
      idempotencyKey,
      channel: 'whatsapp',
      recipientPhone: JOB_AUDIENCE[input.type] === 'PATIENT' ? (input.recipientPhone ?? null) : null,
      templateKey: input.type,
      locale: 'ps',
      templateVariables: JSON.stringify(refs),
      status: 'pending',
    })
    .onConflictDoNothing({ target: notificationOutbox.idempotencyKey })
    .returning({ id: notificationOutbox.id })

  if (inserted[0]) return { id: inserted[0].id, type: input.type, idempotencyKey, created: true }

  const [existing] = await tx
    .select({ id: notificationOutbox.id })
    .from(notificationOutbox)
    .where(eq(notificationOutbox.idempotencyKey, idempotencyKey))
    .limit(1)
  if (!existing) throw new Error('Outbox job vanished after conflict')
  return { id: existing.id, type: input.type, idempotencyKey, created: false }
}

export function parseJobRefs(raw: string | null): OutboundJobRefs | null {
  if (!raw) return null
  try {
    const parsed = JSON.parse(raw) as Partial<OutboundJobRefs>
    return typeof parsed.consultationId === 'string' ? (parsed as OutboundJobRefs) : null
  } catch {
    return null
  }
}

export function isOutboundJobType(value: string): value is OutboundJobType {
  return (OUTBOUND_JOB_TYPES as readonly string[]).includes(value)
}

// ------------------------------------------------------------------
// Payload construction (dispatch time only — never persisted)
// ------------------------------------------------------------------

export interface OutboundPayload {
  jobId: string
  idempotencyKey: string
  type: OutboundJobType
  audience: OutboundAudience
  consultationId: string
  /**
   * WhatsApp recipient (E.164), always resolved by the app: the patient's number,
   * or the configured admin / doctor number. Absent only when not configured.
   */
  to?: string
  /** `text` (free-form, 24-hour window) or `template` (approved Meta template). */
  messageKind: 'text' | 'template'
  /** Ready-to-send text: Pashto for patients, short English notice for staff (text kind only). */
  text?: string
  /** Strictly validated template (template kind only). Never built from browser input. */
  template?: TemplatePayload
  data?: Record<string, unknown>
  /** Callback contract for n8n. */
  callback: { path: '/api/hooks/outbound-result' }
}

function shortComplaint(text: string | null): string | null {
  if (!text) return null
  return text.length > 200 ? `${text.slice(0, 197)}...` : text
}

function iso(date: Date | null): string | null {
  return date ? date.toISOString() : null
}

function patientRecipient(c: ConsultationCase): string | undefined {
  return c.whatsappPhone ?? c.patientPhone ?? undefined
}

type TextPayload = Omit<OutboundPayload, 'messageKind' | 'template'>
interface BuiltText {
  payload: TextPayload
  /** Body parameters if this job's intent is sent as an approved template. */
  templateValues: unknown[] | null
}

const caseRef = (id: string) => id.slice(0, 8)

/** Thrown when a configured template cannot be built; the job fails permanently. */
export class InvalidTemplateError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'InvalidTemplateError'
  }
}

async function buildPayload(
  job: { id: string; idempotencyKey: string; templateKey: string; recipientPhone: string | null },
  refs: OutboundJobRefs,
): Promise<OutboundPayload | null> {
  const built = await buildTextPayload(job, refs)
  if (!built) return null
  const intent = JOB_INTENT[built.payload.type]
  const approved = intent ? getApprovedTemplates()[intent] : undefined
  if (!intent || !approved || !built.templateValues) return { ...built.payload, messageKind: 'text' }
  let template: TemplatePayload
  try {
    template = buildTemplatePayload(intent, approved, built.templateValues)
  } catch (error) {
    throw new InvalidTemplateError(error instanceof Error ? error.message.slice(0, 150) : 'invalid template')
  }
  // Template kind: the free-form text is not sent to n8n
  const { text: _unused, ...rest } = built.payload
  void _unused
  return { ...rest, messageKind: 'template', template }
}

async function buildTextPayload(
  job: { id: string; idempotencyKey: string; templateKey: string; recipientPhone: string | null },
  refs: OutboundJobRefs,
): Promise<BuiltText | null> {
  if (!isOutboundJobType(job.templateKey)) return null
  const type = job.templateKey
  const [c] = await db
    .select()
    .from(consultationCases)
    .where(eq(consultationCases.id, refs.consultationId))
    .limit(1)
  if (!c) return null

  const base = {
    jobId: job.id,
    idempotencyKey: job.idempotencyKey,
    type,
    audience: JOB_AUDIENCE[type],
    consultationId: c.id,
    callback: { path: '/api/hooks/outbound-result' as const },
  }
  const audience = JOB_AUDIENCE[type]
  const to =
    audience === 'ADMIN'
      ? (getAdminWhatsapp() ?? undefined)
      : audience === 'DOCTOR'
        ? (getDoctorWhatsapp() ?? undefined)
        : (job.recipientPhone ?? patientRecipient(c))
  const invalid = refs.messageKey === 'invalid'

  switch (type) {
    case 'ASK_PATIENT_NAME':
      return { templateValues: null, payload: { ...base, ...(to ? { to } : {}), text: invalid ? PATIENT_MESSAGES_PS.invalidName : PATIENT_MESSAGES_PS.askName } }
    case 'ASK_PATIENT_PHONE':
      return {
        templateValues: null,
        payload: {
          ...base,
          ...(to ? { to } : {}),
          text: invalid ? PATIENT_MESSAGES_PS.invalidPhone : PATIENT_MESSAGES_PS.askPhone(c.patientName ?? ''),
        },
      }
    case 'PATIENT_ACKNOWLEDGED':
      return { templateValues: null, payload: { ...base, ...(to ? { to } : {}), text: PATIENT_MESSAGES_PS.acknowledged } }
    case 'PATIENT_CASE_IN_PROGRESS':
      return { templateValues: null, payload: { ...base, ...(to ? { to } : {}), text: PATIENT_MESSAGES_PS.caseInProgress } }
    case 'ADMIN_NEW_CASE': {
      // Direct link to the admin case page (login returns there via callbackUrl)
      const appUrl = getAppUrl()
      const intakeUrl = appUrl ? `${appUrl}/admin/cases/${c.id}` : null
      return {
        templateValues: [c.patientName, c.patientPhone, caseRef(c.id), intakeUrl ?? `/admin/cases/${c.id}`],
        payload: {
        ...base,
        ...(to ? { to } : {}),
        text: STAFF_MESSAGES.adminNewCase({
          consultationId: c.id,
          patientName: c.patientName,
          patientPhone: c.patientPhone,
          intakeUrl,
        }),
        data: {
          consultationId: c.id,
          patientName: c.patientName,
          patientPhone: c.patientPhone,
          createdAt: iso(c.createdAt),
        },
        },
      }
    }
    case 'DOCTOR_APPROVAL_REQUEST': {
      const data = {
        consultationId: c.id,
        patientName: c.patientName,
        age: c.age,
        sex: c.sex,
        location: c.location,
        shortComplaint: shortComplaint(c.mainComplaint),
        proposedConsultationTime: iso(c.proposedConsultationTime),
      }
      return {
        templateValues: [
          [c.patientName, c.age, c.sex].filter((v) => v !== null && v !== undefined).join(', '),
          c.location,
          data.shortComplaint,
          clinicTime(data.proposedConsultationTime),
          caseRef(c.id),
        ],
        payload: { ...base, ...(to ? { to } : {}), text: STAFF_MESSAGES.doctorApprovalRequest(data), data },
      }
    }
    case 'CONSULTATION_CONFIRMED_PATIENT': {
      // Phase 6.6: a fresh secure eTabeeb video link (older links are revoked);
      // falls back to a doctor-supplied external link when there is no session.
      const video = await mintPatientJoinLink(c.id)
      const link = video?.url ?? c.consultationLink
      return {
        templateValues: [
          c.doctorApprovedTime ? formatConsultationTimePs(c.doctorApprovedTime) : '',
          link ?? 'وروسته به درته ولېږل شي',
        ],
        payload: {
        ...base,
        ...(to ? { to } : {}),
        text: PATIENT_MESSAGES_PS.consultationConfirmed(
          c.doctorApprovedTime ? formatConsultationTimePs(c.doctorApprovedTime) : '',
          link,
        ),
        data: { approvedTime: iso(c.doctorApprovedTime), hasVideoLink: Boolean(video) },
        },
      }
    }
    case 'CONSULTATION_CONFIRMED_DOCTOR': {
      const data = {
        consultationId: c.id,
        patientName: c.patientName,
        age: c.age,
        sex: c.sex,
        location: c.location,
        shortComplaint: shortComplaint(c.mainComplaint),
        approvedTime: iso(c.doctorApprovedTime),
        consultationLink: c.consultationLink,
      }
      return {
        templateValues: [c.patientName, clinicTime(data.approvedTime), c.consultationLink ?? 'to follow', caseRef(c.id)],
        payload: { ...base, ...(to ? { to } : {}), text: STAFF_MESSAGES.doctorConfirmed(data), data },
      }
    }
    case 'PRESCRIPTION_READY': {
      const prescriptionId = refs.prescriptionId ?? c.prescriptionId
      if (!prescriptionId) return null
      const [rx] = await db.select().from(prescriptions).where(eq(prescriptions.id, prescriptionId)).limit(1)
      if (!rx) return null
      const items = await db
        .select()
        .from(prescriptionItems)
        .where(eq(prescriptionItems.prescriptionId, rx.id))
        .orderBy(asc(prescriptionItems.sortOrder))
      const number = rx.publicId.slice(0, 8).toUpperCase()
      const text = formatPrescriptionTextPs({
        number,
        diagnosis: rx.diagnosis,
        investigations: rx.investigations,
        advice: rx.advice,
        followUp: rx.followUp,
        notes: rx.notes,
        items,
      })
      const medicines = items
        .map((i) => [i.genericName, i.strength, i.dose, i.frequency].filter(Boolean).join(' '))
        .join('; ')
      return {
        templateValues: [number, medicines],
        payload: {
          ...base,
          ...(to ? { to } : {}),
          // Complete text built here (Pashto frame + doctor content); n8n sends it as-is
          text,
          data: { prescription: { number, textComplete: true } },
        },
      }
    }
  }
}

// ------------------------------------------------------------------
// Dispatch (after commit). Never throws — state is already committed.
// ------------------------------------------------------------------

export interface DispatchResult {
  jobId: string
  dispatched: boolean
  reason?: string
}

async function releaseJob(jobId: string, reason: string): Promise<void> {
  const [row] = await db
    .select({ attempts: notificationOutbox.attempts })
    .from(notificationOutbox)
    .where(eq(notificationOutbox.id, jobId))
    .limit(1)
  await db
    .update(notificationOutbox)
    .set({ status: 'pending', attempts: (row?.attempts ?? 0) + 1, lastError: reason.slice(0, 200) })
    .where(and(eq(notificationOutbox.id, jobId), eq(notificationOutbox.status, 'processing')))
}

export async function dispatchOutboundJobs(jobIds: string[]): Promise<DispatchResult[]> {
  const results: DispatchResult[] = []
  if (jobIds.length === 0) return results
  const config = getOutboundConfig()
  if (!config) {
    // Left pending for a later dispatcher run once n8n is connected (Phase 5)
    for (const jobId of jobIds) results.push({ jobId, dispatched: false, reason: 'outbound_not_configured' })
    return results
  }

  for (const jobId of jobIds) {
    try {
      // Atomic claim: only one dispatcher can move pending → processing
      const [claimed] = await db
        .update(notificationOutbox)
        .set({ status: 'processing' })
        .where(and(eq(notificationOutbox.id, jobId), eq(notificationOutbox.status, 'pending')))
        .returning()
      if (!claimed) {
        results.push({ jobId, dispatched: false, reason: 'not_pending' })
        continue
      }
      const refs = parseJobRefs(claimed.templateVariables)
      let payload: OutboundPayload | null
      try {
        payload = refs ? await buildPayload(claimed, refs) : null
      } catch (error) {
        if (!(error instanceof InvalidTemplateError)) throw error
        await db
          .update(notificationOutbox)
          .set({ status: 'failed', lastError: 'invalid_template', processedAt: new Date() })
          .where(eq(notificationOutbox.id, jobId))
        console.error(`[etabib:outbound] job ${jobId} has an invalid template configuration`)
        results.push({ jobId, dispatched: false, reason: 'invalid_template' })
        continue
      }
      if (!payload) {
        await db
          .update(notificationOutbox)
          .set({ status: 'failed', lastError: 'payload_unavailable' })
          .where(eq(notificationOutbox.id, jobId))
        results.push({ jobId, dispatched: false, reason: 'payload_unavailable' })
        continue
      }

      const response = await fetch(config.url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', [ETABIB_KEY_HEADER]: config.key },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(10_000),
      })
      if (!response.ok) {
        await releaseJob(jobId, `http_${response.status}`)
        console.warn(`[etabib:outbound] job ${jobId} (${payload.type}) rejected by n8n: HTTP ${response.status}`)
        results.push({ jobId, dispatched: false, reason: `http_${response.status}` })
        continue
      }
      // Accepted by n8n; stays `processing` until /api/hooks/outbound-result
      results.push({ jobId, dispatched: true })
    } catch (error) {
      const name = error instanceof Error ? error.name : 'Error'
      await releaseJob(jobId, `dispatch_error:${name}`).catch(() => undefined)
      console.warn(`[etabib:outbound] job ${jobId} dispatch failed: ${name}`)
      results.push({ jobId, dispatched: false, reason: 'dispatch_error' })
    }
  }
  return results
}

/**
 * Re-dispatch eTabib jobs still `pending` (never reached n8n, or n8n rejected
 * them) — called by the n8n "eTabib - Scheduler". Bounded batch, oldest first,
 * only V1 jobs under their attempt limit. Each job is claimed atomically inside
 * dispatchOutboundJobs, so overlapping runs cannot double-dispatch. Jobs stuck in
 * `processing` are intentionally NOT re-sent here (n8n may already have sent them).
 */
export async function dispatchPendingOutboundJobs(limit = 20): Promise<DispatchResult[]> {
  const rows = await db
    .select({ id: notificationOutbox.id })
    .from(notificationOutbox)
    .where(
      and(
        eq(notificationOutbox.status, 'pending'),
        sql`${notificationOutbox.idempotencyKey} LIKE ${KEY_PREFIX + '%'}`,
        lt(notificationOutbox.attempts, notificationOutbox.maxAttempts),
      ),
    )
    .orderBy(asc(notificationOutbox.createdAt))
    .limit(Math.min(Math.max(limit, 1), 50))
  return dispatchOutboundJobs(rows.map((r) => r.id))
}
