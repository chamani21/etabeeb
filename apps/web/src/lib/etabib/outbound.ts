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
import { notificationOutbox, consultationCases, prescriptions, prescriptionItems, whatsappEvents } from '@etabeeb/db/schema'
import type { ConsultationCase } from '@etabeeb/db'
import { and, eq, asc, inArray, lt, max, sql } from 'drizzle-orm'
import { ETABIB_KEY_HEADER, getAdminWhatsapp, getDoctorWhatsapp, getOutboundConfig } from './config'
import { CANCELLATION_REASON_PS, PATIENT_MESSAGES_PS, formatPrescriptionTextPs } from './messages.ps'
import { consultationTimeBlockPs, consultationTimeLinePs } from './patient-time'
import { STAFF_MESSAGES, clinicTime } from './messages.staff'
import { cancellationReasonLabel } from './cancellation'
import { adminCaseUrl, doctorCaseUrl, patientWhatsAppUrl, representativeHelpUrl } from './links'
import { signedMediaUrl } from './media-links'
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
  'CONSULTATION_CANCELLED_PATIENT',
  'CONSULTATION_CANCELLED_ADMIN',
  'CONSULTATION_CANCELLED_DOCTOR',
  // Prescription stage: rendered image page(s) and the doctor's voice explanation
  'PRESCRIPTION_IMAGE',
  'PRESCRIPTION_VOICE',
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
  CONSULTATION_CANCELLED_PATIENT: 'PATIENT',
  CONSULTATION_CANCELLED_ADMIN: 'ADMIN',
  CONSULTATION_CANCELLED_DOCTOR: 'DOCTOR',
  PRESCRIPTION_IMAGE: 'PATIENT',
  PRESCRIPTION_VOICE: 'PATIENT',
}

/** Media jobs WhatsApp can only deliver inside the patient's 24-hour window (no approved media template). */
const WINDOW_BOUND_TYPES: ReadonlySet<string> = new Set<OutboundJobType>(['PRESCRIPTION_IMAGE', 'PRESCRIPTION_VOICE'])
/** A media job still waiting for the window after this long is failed (visible + retryable). */
const WINDOW_WAIT_MAX_MS = 7 * 86_400_000

/** Jobs that still make sense once a case is CANCELLED; every other pending job is withdrawn. */
export const CANCELLATION_JOB_TYPES: ReadonlySet<string> = new Set<OutboundJobType>([
  'CONSULTATION_CANCELLED_PATIENT',
  'CONSULTATION_CANCELLED_ADMIN',
  'CONSULTATION_CANCELLED_DOCTOR',
])

/** Message variants for patient jobs (selects the Pashto string). */
export type PatientMessageKey = 'default' | 'invalid'

/** Stored in notification_outbox.template_variables — references only, no PHI. */
export interface OutboundJobRefs {
  consultationId: string
  messageKey?: PatientMessageKey
  prescriptionId?: string
  /** PRESCRIPTION_IMAGE: 1-based page and page count; whether a voice note follows */
  page?: number
  pages?: number
  withVoice?: boolean
  /** PRESCRIPTION_VOICE */
  voiceNoteId?: string
  /** Job ids that must be handed to WhatsApp first (message order) */
  dependsOn?: string[]
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
    page?: number
    pages?: number
    withVoice?: boolean
    voiceNoteId?: string
    dependsOn?: string[]
  },
): Promise<EnqueuedJob> {
  const idempotencyKey = `${KEY_PREFIX}${input.type}:${input.dedupeKey}`
  const refs: OutboundJobRefs = {
    consultationId: input.consultationId,
    ...(input.messageKey ? { messageKey: input.messageKey } : {}),
    ...(input.prescriptionId ? { prescriptionId: input.prescriptionId } : {}),
    ...(input.page ? { page: input.page, pages: input.pages ?? input.page } : {}),
    ...(input.withVoice ? { withVoice: true } : {}),
    ...(input.voiceNoteId ? { voiceNoteId: input.voiceNoteId } : {}),
    ...(input.dependsOn?.length ? { dependsOn: input.dependsOn } : {}),
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
  /** `text` (free-form, 24-hour window), `template` (approved Meta template), or media (24-hour window). */
  messageKind: 'text' | 'template' | 'image' | 'audio'
  /** image/audio: short-lived signed HTTPS link WhatsApp fetches; caption (image) / voice flag (audio). */
  media?: { link: string; caption?: string; voice?: boolean }
  /** Ready-to-send text: Pashto for patients, short English notice for staff (text kind only). */
  text?: string
  /** Strictly validated template (template kind only). Never built from browser input. */
  template?: TemplatePayload
  data?: Record<string, unknown>
  /** Callback contract for n8n. */
  callback: { path: '/api/hooks/outbound-result' }
}

function iso(date: Date | null): string | null {
  return date ? date.toISOString() : null
}

function patientRecipient(c: ConsultationCase): string | undefined {
  return c.whatsappPhone ?? c.patientPhone ?? undefined
}

type TextPayload = Omit<OutboundPayload, 'messageKind' | 'template'> & { messageKind?: 'image' | 'audio' }
interface BuiltText {
  payload: TextPayload
  /** Body parameters if this job's intent is sent as an approved template. */
  templateValues: unknown[] | null
}


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
  if (built.payload.messageKind === 'image' || built.payload.messageKind === 'audio') {
    // Outside the 24-hour window the first prescription page goes as the approved
    // image-header template (the patient's reply then opens the window for the rest)
    const imageTemplate = getApprovedTemplates().PATIENT_PRESCRIPTION_IMAGE
    if (built.payload.type === 'PRESCRIPTION_IMAGE' && built.templateValues && imageTemplate && !(await windowOpen(refs.consultationId))) {
      let template: TemplatePayload
      try {
        template = buildTemplatePayload('PATIENT_PRESCRIPTION_IMAGE', imageTemplate, built.templateValues, { headerImageLink: built.payload.media!.link })
      } catch (error) {
        throw new InvalidTemplateError(error instanceof Error ? error.message.slice(0, 150) : 'invalid template')
      }
      const { text: _t, media: _m, ...rest } = built.payload
      void _t
      void _m
      return { ...rest, messageKind: 'template', template }
    }
    return { ...built.payload, messageKind: built.payload.messageKind }
  }
  const intent = JOB_INTENT[built.payload.type]
  const approved = intent ? getApprovedTemplates()[intent] : undefined
  if (!intent || !approved || !built.templateValues) return { ...built.payload, messageKind: 'text' }
  // Inside the recipient's 24-hour window free-form text is allowed (free, keeps the
  // clickable links); approved templates are only needed when the window is closed.
  if (built.payload.to && (await recipientWindowOpen(built.payload.to))) return { ...built.payload, messageKind: 'text' }
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
      return { templateValues: null, payload: { ...base, ...(to ? { to } : {}), text: PATIENT_MESSAGES_PS.acknowledged(c.patientName, representativeHelpUrl()) } }
    case 'PATIENT_CASE_IN_PROGRESS':
      return { templateValues: null, payload: { ...base, ...(to ? { to } : {}), text: PATIENT_MESSAGES_PS.caseInProgress(representativeHelpUrl()) } }
    case 'ADMIN_NEW_CASE': {
      // Action links: chat with the patient's WhatsApp number, open the case (login returns there)
      const caseUrl = adminCaseUrl(c.id)
      const chatUrl = patientWhatsAppUrl(c)
      return {
        templateValues: [c.patientName, c.patientPhone, clinicTime(iso(c.createdAt)), chatUrl, caseUrl],
        payload: {
          ...base,
          ...(to ? { to } : {}),
          text: STAFF_MESSAGES.adminNewCase({ patientName: c.patientName, patientPhone: c.patientPhone, receivedAt: iso(c.createdAt), chatUrl, caseUrl }),
          data: { consultationId: c.id, patientName: c.patientName, patientPhone: c.patientPhone, createdAt: iso(c.createdAt) },
        },
      }
    }
    case 'DOCTOR_APPROVAL_REQUEST': {
      // Lock-screen safe: no complaint/history in WhatsApp (read in the dashboard)
      const data = {
        consultationId: c.id,
        patientName: c.patientName,
        age: c.age,
        sex: c.sex,
        location: c.location,
        proposedConsultationTime: iso(c.proposedConsultationTime),
        caseUrl: doctorCaseUrl(c.id),
      }
      return {
        templateValues: [c.patientName, `${c.age ?? '-'} / ${c.sex ?? '-'}`, c.location, clinicTime(data.proposedConsultationTime), data.caseUrl],
        payload: { ...base, ...(to ? { to } : {}), text: STAFF_MESSAGES.doctorApprovalRequest(data), data },
      }
    }
    case 'CONSULTATION_CONFIRMED_PATIENT': {
      // Phase 6.6: a fresh secure eTabeeb video link (older links are revoked);
      // falls back to a doctor-supplied external link when there is no session.
      const video = await mintPatientJoinLink(c.id)
      const link = video?.url ?? c.consultationLink
      const helpUrl = representativeHelpUrl()
      return {
        // approved etabib_consultation_confirmed_ps: {{1}} name, {{2}} date/time, {{3}} consultation link
        templateValues: [
          c.patientName ?? '-',
          // {{2}} "نېټه او وخت": both countries on one line (template parameters cannot contain newlines)
          c.doctorApprovedTime ? consultationTimeLinePs(c.doctorApprovedTime) : '-',
          link ?? 'وروسته به درته ولېږل شي',
        ],
        payload: {
        ...base,
        ...(to ? { to } : {}),
        text: PATIENT_MESSAGES_PS.consultationConfirmed(
          c.doctorApprovedTime ? consultationTimeBlockPs(c.doctorApprovedTime) : '',
          link,
          helpUrl,
        ),
        data: { approvedTime: iso(c.doctorApprovedTime), hasVideoLink: Boolean(video) },
        },
      }
    }
    case 'CONSULTATION_CONFIRMED_DOCTOR': {
      const data = { consultationId: c.id, patientName: c.patientName, approvedTime: iso(c.doctorApprovedTime), caseUrl: doctorCaseUrl(c.id) }
      return {
        templateValues: [c.patientName, clinicTime(data.approvedTime), data.caseUrl],
        payload: { ...base, ...(to ? { to } : {}), text: STAFF_MESSAGES.doctorConfirmed(data), data },
      }
    }
    case 'CONSULTATION_CANCELLED_PATIENT': {
      if (c.status !== 'CANCELLED') return null
      const reason = CANCELLATION_REASON_PS[c.cancellationReason ?? 'OTHER'] ?? 'اداري لامل'
      const helpUrl = representativeHelpUrl()
      return {
        templateValues: [c.patientName ?? '-', reason, helpUrl],
        payload: {
          ...base,
          ...(to ? { to } : {}),
          text: PATIENT_MESSAGES_PS.consultationCancelled({ name: c.patientName, sex: c.sex, reason, helpUrl }),
          data: { reason: c.cancellationReason },
        },
      }
    }
    case 'CONSULTATION_CANCELLED_ADMIN':
    case 'CONSULTATION_CANCELLED_DOCTOR': {
      if (c.status !== 'CANCELLED') return null
      // The time the patient was booked for, if any
      const scheduled = iso(c.doctorApprovedTime ?? c.proposedConsultationTime)
      if (type === 'CONSULTATION_CANCELLED_ADMIN') {
        const reason = cancellationReasonLabel(c.cancellationReason)
        const caseUrl = adminCaseUrl(c.id)
        return {
          templateValues: ['by the doctor', c.patientName, clinicTime(scheduled), reason, caseUrl],
          payload: {
            ...base,
            ...(to ? { to } : {}),
            text: STAFF_MESSAGES.adminCancelledByDoctor({ patientName: c.patientName, scheduledTime: scheduled, reason, caseUrl }),
            data: { reason: c.cancellationReason },
          },
        }
      }
      const caseUrl = doctorCaseUrl(c.id)
      return {
        templateValues: ['by the admin', c.patientName, clinicTime(scheduled), cancellationReasonLabel(c.cancellationReason), caseUrl],
        payload: {
          ...base,
          ...(to ? { to } : {}),
          text: STAFF_MESSAGES.doctorCancelled({ patientName: c.patientName, scheduledTime: scheduled, caseUrl }),
          data: { reason: c.cancellationReason },
        },
      }
    }
    case 'PRESCRIPTION_IMAGE': {
      const rxId = refs.prescriptionId
      const page = refs.page ?? 1
      if (!rxId) return null
      const link = signedMediaUrl({ kind: 'rx-image', id: rxId, page })
      if (!link) return null
      const pages = refs.pages ?? 1
      const caption = page === 1 ? PATIENT_MESSAGES_PS.prescriptionImageCaption({ withVoice: Boolean(refs.withVoice), pages, helpUrl: representativeHelpUrl() }) : `(${page}/${pages})`
      return {
        templateValues: page === 1 ? [c.patientName ?? '-'] : null,
        payload: { ...base, ...(to ? { to } : {}), messageKind: 'image', media: { link, caption }, data: { prescriptionId: rxId, page, pages } },
      }
    }
    case 'PRESCRIPTION_VOICE': {
      if (!refs.voiceNoteId) return null
      const link = signedMediaUrl({ kind: 'voice', id: refs.voiceNoteId })
      if (!link) return null
      return {
        templateValues: null,
        payload: { ...base, ...(to ? { to } : {}), messageKind: 'audio', media: { link, voice: true }, data: { voiceNoteId: refs.voiceNoteId } },
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
        items: items.map((i) => ({ ...i, dose: i.dose ?? '', frequency: i.frequency ?? '' })),
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

/** Last time the patient's WhatsApp number wrote to eTabeeb (opens Meta's 24-hour window). */
export async function lastPatientMessageAt(caseId: string): Promise<Date | null> {
  const [c] = await db.select({ phone: consultationCases.whatsappPhone }).from(consultationCases).where(eq(consultationCases.id, caseId)).limit(1)
  if (!c?.phone) return null
  const [row] = await db.select({ last: max(whatsappEvents.createdAt) }).from(whatsappEvents).where(eq(whatsappEvents.senderPhone, c.phone))
  return row?.last ? new Date(row.last) : null
}

const WINDOW_MS = 23.5 * 3600_000

/** Why a media job must wait (null = send now). */
/** The recipient (patient or staff) wrote to eTabeeb within Meta's 24-hour window. */
async function recipientWindowOpen(phone: string): Promise<boolean> {
  const e164 = phone.startsWith('+') ? phone : `+${phone.replace(/\D/g, '')}`
  const [row] = await db.select({ last: max(whatsappEvents.createdAt) }).from(whatsappEvents).where(eq(whatsappEvents.senderPhone, e164))
  return Boolean(row?.last && Date.now() - new Date(row.last).getTime() <= WINDOW_MS)
}

async function windowOpen(caseId: string): Promise<boolean> {
  const last = await lastPatientMessageAt(caseId)
  return Boolean(last && Date.now() - last.getTime() <= WINDOW_MS)
}

async function mediaHoldReason(job: { createdAt: Date; templateKey: string }, refs: OutboundJobRefs): Promise<string | null> {
  if (Date.now() - job.createdAt.getTime() > WINDOW_WAIT_MAX_MS) return 'expired'
  if (refs.dependsOn?.length) {
    const deps = await db.select({ status: notificationOutbox.status }).from(notificationOutbox).where(inArray(notificationOutbox.id, refs.dependsOn))
    if (deps.some((d) => d.status === 'pending' || d.status === 'processing')) return 'waiting_for_previous_message: the prescription image is sent first'
  }
  if (!(await windowOpen(refs.consultationId))) {
    if (job.templateKey === 'PRESCRIPTION_IMAGE' && (refs.page ?? 1) === 1 && getApprovedTemplates().PATIENT_PRESCRIPTION_IMAGE) return null
    return 'waiting_for_patient_reply: WhatsApp 24-hour window is closed; sent automatically when the patient writes to eTabeeb'
  }
  return null
}

/** Pending media jobs of the case that were held (window / ordering) — dispatched when the patient writes. */
export async function heldMediaJobsForCase(caseId: string): Promise<string[]> {
  const rows = await db
    .select({ id: notificationOutbox.id })
    .from(notificationOutbox)
    .where(
      and(
        eq(notificationOutbox.status, 'pending'),
        inArray(notificationOutbox.templateKey, [...WINDOW_BOUND_TYPES]),
        sql`(${notificationOutbox.templateVariables}::jsonb ->> 'consultationId') = ${caseId}`,
      ),
    )
    .orderBy(asc(notificationOutbox.createdAt))
  return rows.map((r) => r.id)
}

/** Pending jobs that were waiting on `jobId` (message order) — dispatched once it was handed to WhatsApp. */
export async function dependentJobs(jobId: string): Promise<string[]> {
  const rows = await db
    .select({ id: notificationOutbox.id })
    .from(notificationOutbox)
    .where(and(eq(notificationOutbox.status, 'pending'), sql`(${notificationOutbox.templateVariables}::jsonb -> 'dependsOn') ? ${jobId}`))
  return rows.map((r) => r.id)
}

async function isCaseCancelled(caseId: string): Promise<boolean> {
  const [row] = await db.select({ status: consultationCases.status }).from(consultationCases).where(eq(consultationCases.id, caseId)).limit(1)
  return row?.status === 'CANCELLED'
}

async function withdrawJob(jobId: string): Promise<void> {
  await db
    .update(notificationOutbox)
    .set({ status: 'cancelled', lastError: 'superseded: case cancelled', processedAt: new Date() })
    .where(eq(notificationOutbox.id, jobId))
}

/**
 * Inside the cancellation transaction: withdraw every not-yet-sent job of the
 * case (kept as `cancelled` for audit). Jobs already handed to n8n
 * (`processing`) or sent cannot be recalled. Returns the number withdrawn.
 */
export async function withdrawPendingJobsTx(tx: Tx, caseId: string): Promise<number> {
  const rows = await tx
    .update(notificationOutbox)
    .set({ status: 'cancelled', lastError: 'superseded: case cancelled', processedAt: new Date() })
    .where(
      and(
        eq(notificationOutbox.status, 'pending'),
        sql`${notificationOutbox.idempotencyKey} LIKE ${KEY_PREFIX + '%'}`,
        sql`(${notificationOutbox.templateVariables}::jsonb ->> 'consultationId') = ${caseId}`,
      ),
    )
    .returning({ id: notificationOutbox.id })
  return rows.length
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
      if (refs && WINDOW_BOUND_TYPES.has(claimed.templateKey)) {
        const hold = await mediaHoldReason(claimed, refs)
        if (hold === 'expired') {
          await db.update(notificationOutbox).set({ status: 'failed', lastError: 'window_closed: the patient did not message eTabeeb within 7 days', processedAt: new Date() }).where(eq(notificationOutbox.id, jobId))
          results.push({ jobId, dispatched: false, reason: 'window_closed_expired' })
          continue
        }
        if (hold) {
          // Not an attempt: stays pending (the scheduler and the next patient message re-try it)
          await db.update(notificationOutbox).set({ status: 'pending', lastError: hold }).where(and(eq(notificationOutbox.id, jobId), eq(notificationOutbox.status, 'processing')))
          results.push({ jobId, dispatched: false, reason: hold.split(':')[0]! })
          continue
        }
      }
      if (refs && !CANCELLATION_JOB_TYPES.has(claimed.templateKey) && (await isCaseCancelled(refs.consultationId))) {
        // Race with cancellation: never send an obsolete message for a cancelled case
        await withdrawJob(jobId)
        results.push({ jobId, dispatched: false, reason: 'case_cancelled' })
        continue
      }
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
