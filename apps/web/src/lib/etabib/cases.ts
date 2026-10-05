/**
 * eTabib V1 — admin, doctor and integration actions on consultation cases.
 *
 * Each action runs in ONE database transaction and changes status only through
 * transitions.ts. Outbound jobs are enqueued in the same transaction and
 * dispatched by the caller after commit. Every action is idempotent: a repeated
 * identical request returns the current case with `changed: false` and causes
 * no new events or jobs.
 */
import { db } from '@etabeeb/db'
import { consultationCases, notificationOutbox, prescriptions } from '@etabeeb/db/schema'
import type { ConsultationCase, Prescription } from '@etabeeb/db'
import { desc, eq, sql } from 'drizzle-orm'
import { EtabibError, TransitionError } from './errors'
import {
  cancelCase,
  lockCase,
  recordCaseEvent,
  transitionCase,
  updateCaseFields,
  type Actor,
  type CancelActorRole,
  type CancellationReason,
  type CasePatch,
  type ConsultationStatus,
} from './transitions'
import { enqueueOutboundJob, isOutboundJobType, parseJobRefs, withdrawPendingJobsTx, type EnqueuedJob } from './outbound'
import { sanitizeErrorText } from './sanitize'
import { createVideoSessionTx, endVideoSessionTx, revokePatientLinksTx } from './video'
import type { PrescriptionItemInput } from '@/lib/prescriptions'

export interface CaseActionResult {
  case: ConsultationCase
  changed: boolean
  jobs: EnqueuedJob[]
}

const sameInstant = (a: Date | null, b: Date | null) =>
  (a === null && b === null) || (a !== null && b !== null && a.getTime() === b.getTime())

function patientRecipient(c: ConsultationCase): string | null {
  return c.whatsappPhone ?? c.patientPhone ?? null
}

// ------------------------------------------------------------------
// Admin intake: ADMIN_INTAKE → INTAKE_COMPLETE → AWAITING_PAYMENT
// ------------------------------------------------------------------

/** Statuses in which a completed intake may still be corrected (before the consultation starts). */
export const INTAKE_EDITABLE: readonly ConsultationStatus[] = [
  'AWAITING_PAYMENT',
  'PAYMENT_RECEIVED',
  'AWAITING_DOCTOR_APPROVAL',
  'CONFIRMED',
]

export interface IntakeInput {
  age: number
  sex: 'MALE' | 'FEMALE'
  consultationFor: 'SELF' | 'OTHER'
  location: string
  mainComplaint: string
  medicalHistory?: string | null
  patientName?: string
  patientPhone?: string
}

export async function submitAdminIntake(
  caseId: string,
  input: IntakeInput,
  admin: Actor,
): Promise<CaseActionResult> {
  return db.transaction(async (tx) => {
    const current = await lockCase(tx, caseId)
    const patch: CasePatch = {
      age: input.age,
      sex: input.sex,
      consultationFor: input.consultationFor,
      location: input.location,
      mainComplaint: input.mainComplaint,
      medicalHistory: input.medicalHistory ?? null,
      // Corrections only when explicitly supplied
      ...(input.patientName ? { patientName: input.patientName } : {}),
      ...(input.patientPhone ? { patientPhone: input.patientPhone } : {}),
    }
    const corrected = {
      patientNameCorrected: Boolean(input.patientName && input.patientName !== current.patientName),
      patientPhoneCorrected: Boolean(input.patientPhone && input.patientPhone !== current.patientPhone),
    }

    if (current.status === 'ADMIN_INTAKE') {
      await transitionCase(tx, { caseId, to: 'INTAKE_COMPLETE', expectedFrom: 'ADMIN_INTAKE', actor: admin, patch, metadata: corrected })
      const updated = await transitionCase(tx, { caseId, to: 'AWAITING_PAYMENT', expectedFrom: 'INTAKE_COMPLETE', actor: admin })
      return { case: updated, changed: true, jobs: [] }
    }
    if (current.status === 'INTAKE_COMPLETE') {
      const updated = await transitionCase(tx, { caseId, to: 'AWAITING_PAYMENT', expectedFrom: 'INTAKE_COMPLETE', actor: admin, patch, metadata: corrected })
      return { case: updated, changed: true, jobs: [] }
    }
    // Corrections are allowed until the consultation starts (P1: was AWAITING_PAYMENT only)
    if (INTAKE_EDITABLE.includes(current.status)) {
      const unchanged =
        current.age === input.age &&
        current.sex === input.sex &&
        current.consultationFor === input.consultationFor &&
        current.location === input.location &&
        current.mainComplaint === input.mainComplaint &&
        current.medicalHistory === (input.medicalHistory ?? null) &&
        !corrected.patientNameCorrected &&
        !corrected.patientPhoneCorrected
      if (unchanged) return { case: current, changed: false, jobs: [] }
      const updated = await updateCaseFields(tx, { caseId, patch, eventType: 'ADMIN_INTAKE_UPDATED', actor: admin, metadata: corrected })
      return { case: updated, changed: true, jobs: [] }
    }
    throw new TransitionError('invalid_status', `Intake cannot be submitted while case is ${current.status}`)
  })
}

// ------------------------------------------------------------------
// Payment (manual verification): AWAITING_PAYMENT → PAYMENT_RECEIVED
// ------------------------------------------------------------------

export interface PaymentInput {
  received: boolean
  source: 'EASYPAISA' | 'OTHER'
  reference?: string | null
  amount?: number | null
}

const AFTER_PAYMENT: readonly ConsultationStatus[] = [
  'PAYMENT_RECEIVED',
  'AWAITING_DOCTOR_APPROVAL',
  'CONFIRMED',
  'IN_CONSULTATION',
  'PRESCRIPTION_SENT',
  'COMPLETED',
]

export async function confirmPayment(caseId: string, input: PaymentInput, admin: Actor): Promise<CaseActionResult> {
  const adminId = admin.id
  if (!adminId) throw new EtabibError('forbidden', 'Admin identity required', 403)
  return db.transaction(async (tx) => {
    const current = await lockCase(tx, caseId)

    if (current.paymentReceived && AFTER_PAYMENT.includes(current.status)) {
      // Already confirmed (double click / retry): never overwrite who/when
      return { case: current, changed: false, jobs: [] }
    }
    if (!input.received) {
      // Nothing to confirm; payment remains outstanding
      return { case: current, changed: false, jobs: [] }
    }
    if (current.status !== 'AWAITING_PAYMENT') {
      throw new TransitionError('invalid_status', `Payment cannot be confirmed while case is ${current.status}`)
    }

    const updated = await transitionCase(tx, {
      caseId,
      to: 'PAYMENT_RECEIVED',
      expectedFrom: 'AWAITING_PAYMENT',
      actor: admin,
      patch: {
        paymentReceived: true,
        paymentSource: input.source,
        paymentReference: input.reference ?? null,
        paymentAmount: input.amount ?? null,
        paymentConfirmedBy: adminId, // from the authenticated session, never the client
        paymentConfirmedAt: new Date(), // server time
      },
      metadata: {
        source: input.source,
        amount: input.amount ?? null,
        hasReference: Boolean(input.reference),
      },
    })
    return { case: updated, changed: true, jobs: [] }
  })
}

// ------------------------------------------------------------------
// Doctor approval request: PAYMENT_RECEIVED → AWAITING_DOCTOR_APPROVAL
// ------------------------------------------------------------------

export async function requestDoctorApproval(
  caseId: string,
  proposedTime: Date,
  admin: Actor,
): Promise<CaseActionResult> {
  return db.transaction(async (tx) => {
    const current = await lockCase(tx, caseId)
    const dedupeKey = `${caseId}:${proposedTime.toISOString()}`
    const patch: CasePatch = {
      proposedConsultationTime: proposedTime,
      doctorDecision: 'PENDING',
      doctorApprovedTime: null,
      doctorDecisionAt: null,
    }
    const metadata = { proposedConsultationTime: proposedTime.toISOString() }

    if (current.status === 'PAYMENT_RECEIVED') {
      const updated = await transitionCase(tx, {
        caseId,
        to: 'AWAITING_DOCTOR_APPROVAL',
        expectedFrom: 'PAYMENT_RECEIVED',
        actor: admin,
        patch,
        metadata,
      })
      const job = await enqueueOutboundJob(tx, { type: 'DOCTOR_APPROVAL_REQUEST', consultationId: caseId, dedupeKey })
      return { case: updated, changed: true, jobs: [job] }
    }

    if (current.status === 'AWAITING_DOCTOR_APPROVAL') {
      if (current.doctorDecision === 'PENDING' && sameInstant(current.proposedConsultationTime, proposedTime)) {
        return { case: current, changed: false, jobs: [] } // retried request
      }
      // Re-request with a new time (e.g. after PROPOSE_NEW_TIME / POSTPONED)
      const updated = await updateCaseFields(tx, {
        caseId,
        patch,
        eventType: 'DOCTOR_APPROVAL_REQUESTED',
        actor: admin,
        metadata,
      })
      const job = await enqueueOutboundJob(tx, { type: 'DOCTOR_APPROVAL_REQUEST', consultationId: caseId, dedupeKey })
      return { case: updated, changed: true, jobs: [job] }
    }

    if (!current.paymentReceived) {
      throw new TransitionError('payment_required', 'Payment must be confirmed before requesting doctor approval')
    }
    throw new TransitionError('invalid_status', `Doctor approval cannot be requested while case is ${current.status}`)
  })
}

// ------------------------------------------------------------------
// Doctor decision
// ------------------------------------------------------------------

export type DoctorDecisionInput =
  | { decision: 'APPROVED'; approvedTime: Date; consultationLink?: string | null }
  | { decision: 'PROPOSE_NEW_TIME'; proposedTime: Date }
  | { decision: 'POSTPONED' }
  | { decision: 'REJECTED' }

const DECISION_EVENT = {
  PROPOSE_NEW_TIME: 'DOCTOR_PROPOSED_NEW_TIME',
  POSTPONED: 'DOCTOR_POSTPONED',
  REJECTED: 'DOCTOR_REJECTED',
} as const

export async function applyDoctorDecision(
  caseId: string,
  input: DoctorDecisionInput,
  doctor: Actor,
): Promise<CaseActionResult> {
  return db.transaction(async (tx) => {
    const current = await lockCase(tx, caseId)

    if (input.decision === 'APPROVED') {
      if (current.status !== 'AWAITING_DOCTOR_APPROVAL') {
        // APPROVED is only ever persisted together with → CONFIRMED (same
        // transaction), so a matching approval means this is a retry.
        const alreadyApproved =
          current.doctorDecision === 'APPROVED' && sameInstant(current.doctorApprovedTime, input.approvedTime)
        if (alreadyApproved) return { case: current, changed: false, jobs: [] }
        throw new TransitionError('invalid_status', `Doctor cannot approve while case is ${current.status}`)
      }
      const now = new Date()
      await updateCaseFields(tx, {
        caseId,
        patch: {
          doctorDecision: 'APPROVED',
          doctorApprovedTime: input.approvedTime,
          doctorDecisionAt: now,
          ...(input.consultationLink ? { consultationLink: input.consultationLink } : {}),
        },
        eventType: 'DOCTOR_APPROVED',
        actor: doctor,
        metadata: { approvedTime: input.approvedTime.toISOString() },
      })
      const confirmed = await transitionCase(tx, {
        caseId,
        to: 'CONFIRMED',
        expectedFrom: 'AWAITING_DOCTOR_APPROVAL',
        actor: doctor,
        metadata: { hasConsultationLink: Boolean(input.consultationLink ?? current.consultationLink) },
      })
      // Phase 6.6: the case-bound video room exists only from CONFIRMED on
      await createVideoSessionTx(tx, confirmed, doctor)
      const jobs = [
        await enqueueOutboundJob(tx, {
          type: 'CONSULTATION_CONFIRMED_PATIENT',
          consultationId: caseId,
          dedupeKey: caseId,
          recipientPhone: patientRecipient(confirmed),
        }),
        await enqueueOutboundJob(tx, { type: 'CONSULTATION_CONFIRMED_DOCTOR', consultationId: caseId, dedupeKey: caseId }),
      ]
      return { case: confirmed, changed: true, jobs }
    }

    if (current.status !== 'AWAITING_DOCTOR_APPROVAL') {
      throw new TransitionError('invalid_status', `Doctor decision not allowed while case is ${current.status}`)
    }

    if (input.decision === 'PROPOSE_NEW_TIME') {
      if (current.doctorDecision === 'PROPOSE_NEW_TIME' && sameInstant(current.proposedConsultationTime, input.proposedTime)) {
        return { case: current, changed: false, jobs: [] }
      }
      const updated = await updateCaseFields(tx, {
        caseId,
        // The doctor's counter-proposal becomes the proposed time; NOT confirmed
        patch: { doctorDecision: 'PROPOSE_NEW_TIME', proposedConsultationTime: input.proposedTime, doctorDecisionAt: new Date() },
        eventType: DECISION_EVENT.PROPOSE_NEW_TIME,
        actor: doctor,
        metadata: { proposedConsultationTime: input.proposedTime.toISOString() },
      })
      return { case: updated, changed: true, jobs: [] }
    }

    if (current.doctorDecision === input.decision) return { case: current, changed: false, jobs: [] }
    const updated = await updateCaseFields(tx, {
      caseId,
      patch: { doctorDecision: input.decision, doctorDecisionAt: new Date() },
      eventType: DECISION_EVENT[input.decision],
      actor: doctor,
    })
    return { case: updated, changed: true, jobs: [] }
  })
}

// ------------------------------------------------------------------
// Consultation start: CONFIRMED → IN_CONSULTATION
// ------------------------------------------------------------------

export async function startConsultation(caseId: string, doctor: Actor): Promise<CaseActionResult> {
  return db.transaction(async (tx) => {
    const current = await lockCase(tx, caseId)
    if (current.status === 'IN_CONSULTATION') return { case: current, changed: false, jobs: [] }
    const updated = await transitionCase(tx, { caseId, to: 'IN_CONSULTATION', expectedFrom: 'CONFIRMED', actor: doctor })
    return { case: updated, changed: true, jobs: [] }
  })
}

// ------------------------------------------------------------------
// Prescription (reuses the existing prescriptions module)
// ------------------------------------------------------------------

export interface PrescriptionDetails {
  diagnosis?: string | null
  investigations?: string | null
  advice?: string | null
  followUp?: string | null
  notes?: string | null
}

/**
 * One-step convenience (used by older callers/tests): save a draft, finalize
 * (lock + render) and queue WhatsApp delivery. Never completes the case — the
 * doctor completes the consultation explicitly (rx/service completeConsultation).
 */
export async function createCasePrescription(
  caseId: string,
  items: PrescriptionItemInput[],
  doctor: Actor & { id: string },
  details: PrescriptionDetails = {},
): Promise<CaseActionResult & { prescription: Prescription }> {
  const { saveDraft, finalizePrescription, sendPrescription } = await import('./rx/service')
  const d = { type: 'DOCTOR' as const, id: doctor.id }
  const current = await db.select({ status: consultationCases.status }).from(consultationCases).where(eq(consultationCases.id, caseId)).limit(1)
  if (current[0] && current[0].status !== 'IN_CONSULTATION') {
    throw new TransitionError('invalid_status', `Prescription cannot be created while case is ${current[0].status}`)
  }
  const existing = await db.select({ id: prescriptions.id, status: prescriptions.workflowStatus }).from(prescriptions).where(eq(prescriptions.consultationId, caseId)).limit(1)
  if (existing[0] && existing[0].status !== 'DRAFT') throw new EtabibError('prescription_exists', 'A prescription already exists for this case', 409)
  await saveDraft(
    caseId,
    {
      diagnosis: details.diagnosis ?? null,
      investigations: details.investigations ?? null,
      advice: details.advice ?? null,
      followUp: details.followUp ?? null,
      freeText: details.notes ?? null,
      medicines: items.map((i) => ({ name: i.genericName, strength: i.strength ?? null, formulation: i.formulation ?? null, route: i.route ?? null, dose: i.dose ?? null, frequency: i.frequency ?? null, timing: i.timing ?? null, duration: i.durationDays ? `${i.durationDays} days` : null, instructions: i.patientInstructions ?? null })),
    },
    d,
  )
  await finalizePrescription(caseId, d)
  const sent = await sendPrescription(caseId, d).catch(async (error) => {
    // Rendering unavailable: the finalized prescription stays valid; delivery can be retried
    if (error instanceof EtabibError && error.code === 'render_failed') return null
    throw error
  })
  const [rx] = await db.select().from(prescriptions).where(eq(prescriptions.consultationId, caseId)).orderBy(desc(prescriptions.revision)).limit(1)
  const [c] = await db.select().from(consultationCases).where(eq(consultationCases.id, caseId)).limit(1)
  return { case: c!, changed: true, jobs: sent?.jobs ?? [], prescription: rx! }
}

// ------------------------------------------------------------------
// Outbound delivery result (n8n Outbound Sender callback)
// ------------------------------------------------------------------

export interface OutboundResultInput {
  jobId?: string
  idempotencyKey?: string
  consultationId?: string
  success: boolean
  status?: 'sent' | 'delivered' | 'read' | 'failed'
  wamid?: string
  error?: { code?: string | number; message?: string }
}

const SUCCESS_RANK = { sent: 1, delivered: 2, read: 3 } as const
type SuccessStatus = keyof typeof SUCCESS_RANK

export interface OutboundResultOutcome {
  jobId: string
  type: string
  changed: boolean
  jobStatus: string
  consultationId: string | null
  consultationStatus: ConsultationStatus | null
  /** Internal: LiveKit room to close after commit (case completed). Never returned to clients. */
  videoRoomToClose?: string
}

const N8N: Actor = { type: 'N8N', id: null }

export async function applyOutboundResult(input: OutboundResultInput): Promise<OutboundResultOutcome> {
  return db.transaction(async (tx) => {
    const where = input.jobId
      ? eq(notificationOutbox.id, input.jobId)
      : eq(notificationOutbox.idempotencyKey, input.idempotencyKey ?? '')
    const [job] = await tx.select().from(notificationOutbox).where(where).limit(1).for('update')
    const refs = job ? parseJobRefs(job.templateVariables) : null
    if (!job || !refs || !isOutboundJobType(job.templateKey) || !job.idempotencyKey.startsWith('etabib:')) {
      throw new EtabibError('not_found', 'Outbound job not found', 404)
    }
    if (input.consultationId && input.consultationId !== refs.consultationId) {
      throw new EtabibError('consultation_mismatch', 'Consultation does not match job', 400)
    }

    const success = input.success && input.status !== 'failed'
    const previous = job.status
    const prevRank = previous in SUCCESS_RANK ? SUCCESS_RANK[previous as SuccessStatus] : 0
    let changed = false

    if (success) {
      const reported: SuccessStatus = input.status && input.status !== 'failed' ? input.status : 'sent'
      if (SUCCESS_RANK[reported] > prevRank) {
        const now = new Date()
        await tx
          .update(notificationOutbox)
          .set({
            status: reported,
            providerMessageId: input.wamid ?? job.providerMessageId,
            processedAt: job.processedAt ?? now,
            lastError: null,
            ...(reported === 'delivered' || reported === 'read' ? { deliveredAt: job.deliveredAt ?? now } : {}),
            ...(reported === 'read' ? { readAt: now } : {}),
          })
          .where(eq(notificationOutbox.id, job.id))
        changed = true
      }
    } else if (prevRank === 0 && previous !== 'failed') {
      // Never regress a job that already succeeded; record the first failure only
      await tx
        .update(notificationOutbox)
        .set({
          status: 'failed',
          attempts: job.attempts + 1,
          processedAt: new Date(),
          lastError: sanitizeErrorText(
            [input.error?.code, input.error?.message].filter((v) => v !== undefined).join(': ') || 'delivery_failed',
            300,
          ),
        })
        .where(eq(notificationOutbox.id, job.id))
      changed = true
      if (job.templateKey === 'PRESCRIPTION_READY') {
        const c = await lockCase(tx, refs.consultationId)
        await recordCaseEvent(tx, {
          caseId: c.id,
          eventType: 'PRESCRIPTION_DELIVERY_FAILED',
          oldStatus: c.status,
          newStatus: c.status,
          actor: N8N,
          metadata: { outboundJobId: job.id },
        })
      }
    }

    // Prescription delivery is tracked per message; it never changes the case
    // status (the doctor completes the consultation explicitly).
    if (changed && (job.templateKey === 'PRESCRIPTION_IMAGE' || job.templateKey === 'PRESCRIPTION_VOICE')) {
      const c = await lockCase(tx, refs.consultationId)
      const ok = success && previous !== 'failed'
      if (ok && prevRank === 0) {
        await recordCaseEvent(tx, {
          caseId: c.id,
          eventType: job.templateKey === 'PRESCRIPTION_IMAGE' ? 'PRESCRIPTION_IMAGE_SENT' : 'PRESCRIPTION_VOICE_SENT',
          oldStatus: c.status,
          newStatus: c.status,
          actor: N8N,
          metadata: { outboundJobId: job.id, prescriptionId: refs.prescriptionId ?? null, ...(refs.page ? { page: refs.page } : {}) },
        })
      } else if (!ok) {
        await recordCaseEvent(tx, {
          caseId: c.id,
          eventType: 'PRESCRIPTION_DELIVERY_FAILED',
          oldStatus: c.status,
          newStatus: c.status,
          actor: N8N,
          metadata: { outboundJobId: job.id, kind: job.templateKey === 'PRESCRIPTION_IMAGE' ? 'image' : 'voice' },
        })
      }
    }
    const [current] = await tx.select({ status: consultationCases.status }).from(consultationCases).where(eq(consultationCases.id, refs.consultationId)).limit(1)
    const consultationStatus: ConsultationStatus | null = current?.status ?? null
    const videoRoomToClose: string | undefined = undefined

    const [after] = await tx
      .select({ status: notificationOutbox.status })
      .from(notificationOutbox)
      .where(eq(notificationOutbox.id, job.id))
    return {
      jobId: job.id,
      type: job.templateKey,
      changed,
      jobStatus: after?.status ?? job.status,
      consultationId: refs.consultationId,
      consultationStatus,
      ...(videoRoomToClose ? { videoRoomToClose } : {}),
    }
  })
}

// ------------------------------------------------------------------
// P1: admin notes and outbound retry
// ------------------------------------------------------------------

export async function updateAdminNotes(caseId: string, notes: string | null, admin: Actor): Promise<CaseActionResult> {
  return db.transaction(async (tx) => {
    const current = await lockCase(tx, caseId)
    if ((current.adminNotes ?? null) === notes) return { case: current, changed: false, jobs: [] }
    const updated = await updateCaseFields(tx, {
      caseId,
      patch: { adminNotes: notes },
      eventType: 'ADMIN_NOTES_UPDATED',
      actor: admin,
      metadata: { length: notes?.length ?? 0 }, // never the note text itself
    })
    return { case: updated, changed: true, jobs: [] }
  })
}

/**
 * Re-queue an eTabib outbound job that FAILED (or exhausted its dispatch
 * attempts while pending). Successful, in-flight (`processing`) or other
 * cases' jobs are never re-sent. The same idempotency key is kept, so n8n and
 * the callback still treat it as the same message. The caller dispatches the
 * returned job after commit.
 */
export async function retryOutboundJob(caseId: string, jobId: string, admin: Actor, onlyTypes?: readonly string[]): Promise<CaseActionResult> {
  return db.transaction(async (tx) => {
    const [job] = await tx.select().from(notificationOutbox).where(eq(notificationOutbox.id, jobId)).limit(1).for('update')
    const refs = job ? parseJobRefs(job.templateVariables) : null
    if (!job || !refs || refs.consultationId !== caseId || !job.idempotencyKey.startsWith('etabib:')) {
      throw new EtabibError('not_found', 'Outbound job not found for this case', 404)
    }
    if (onlyTypes && !onlyTypes.includes(job.templateKey)) throw new EtabibError('not_found', 'Outbound job not found for this case', 404)
    const exhaustedPending = job.status === 'pending' && job.attempts >= job.maxAttempts
    if (job.status !== 'failed' && !exhaustedPending) {
      throw new EtabibError('retry_not_allowed', `A ${job.status} message cannot be retried`, 409)
    }
    await tx
      .update(notificationOutbox)
      .set({ status: 'pending', attempts: 0, lastError: `retry_requested (was: ${(job.lastError ?? job.status).slice(0, 120)})` })
      .where(eq(notificationOutbox.id, job.id))
    const c = await lockCase(tx, caseId)
    await recordCaseEvent(tx, {
      caseId,
      eventType: 'OUTBOX_RETRY_REQUESTED',
      oldStatus: c.status,
      newStatus: c.status,
      actor: admin,
      metadata: { outboundJobId: job.id, jobType: job.templateKey },
    })
    return {
      case: c,
      changed: true,
      jobs: [{ id: job.id, type: job.templateKey as EnqueuedJob['type'], idempotencyKey: job.idempotencyKey, created: false }],
    }
  })
}

// ------------------------------------------------------------------
// Phase 6.6: revoke the patient's video link and send a new one
// ------------------------------------------------------------------

const LINK_RESEND_COOLDOWN_MS = 60_000

/**
 * Admin action (audited): revoke every active patient join link and queue a new
 * confirmation message; the new link is minted when that message is dispatched.
 * A repeat within the cooldown (double click) is a no-op.
 */
export async function regeneratePatientVideoLink(caseId: string, admin: Actor): Promise<CaseActionResult> {
  return db.transaction(async (tx) => {
    const current = await lockCase(tx, caseId)
    if (current.status !== 'CONFIRMED' && current.status !== 'IN_CONSULTATION') {
      throw new TransitionError('invalid_status', `Video link cannot be changed while case is ${current.status}`)
    }
    const [recent] = await tx
      .select({ id: notificationOutbox.id })
      .from(notificationOutbox)
      .where(
        // only earlier rotations count (not the original confirmation message)
        sql`${notificationOutbox.idempotencyKey} LIKE ${'etabib:CONSULTATION_CONFIRMED_PATIENT:' + caseId + ':link:%'}
          AND ${notificationOutbox.createdAt} > now() - make_interval(secs => ${LINK_RESEND_COOLDOWN_MS / 1000})
          AND ${notificationOutbox.status} <> 'failed'`,
      )
      .limit(1)
    if (recent) return { case: current, changed: false, jobs: [] }
    await revokePatientLinksTx(tx, current, admin)
    const job = await enqueueOutboundJob(tx, {
      type: 'CONSULTATION_CONFIRMED_PATIENT',
      consultationId: caseId,
      dedupeKey: `${caseId}:link:${Date.now()}`,
      recipientPhone: patientRecipient(current),
    })
    return { case: current, changed: true, jobs: [job] }
  })
}

// ------------------------------------------------------------------
// Cancellation (admin or doctor; explicit terminal state)
// ------------------------------------------------------------------

export interface CancelInput {
  reason: CancellationReason
  /** Short note, only kept for reason OTHER; never sent to WhatsApp. */
  note?: string | null
}

export interface CancelResult extends CaseActionResult {
  /** Internal: LiveKit room to close after commit. Never returned to clients. */
  videoRoomToClose?: string
  withdrawnJobs: number
}

/** Statuses in which the doctor had already been involved (doctor is told about an admin cancellation). */
const DOCTOR_INVOLVED: readonly ConsultationStatus[] = ['AWAITING_DOCTOR_APPROVAL', 'CONFIRMED']

/**
 * Cancel a consultation: CANCELLED + audit event, video access closed, obsolete
 * outbox jobs withdrawn, and notifications queued exactly once (dedupe by case).
 * Repeating the request on a CANCELLED case is a no-op (no events, no messages).
 */
export async function cancelConsultation(
  caseId: string,
  input: CancelInput,
  actor: Actor & { type: CancelActorRole; id: string },
): Promise<CancelResult> {
  return db.transaction(async (tx) => {
    const current = await lockCase(tx, caseId)
    if (current.status === 'CANCELLED') return { case: current, changed: false, jobs: [], withdrawnJobs: 0 }

    const { before, after } = await cancelCase(tx, { caseId, actor, reason: input.reason, note: input.note ?? null })
    const ended = await endVideoSessionTx(tx, after, actor, 'case_cancelled')
    const withdrawnJobs = await withdrawPendingJobsTx(tx, caseId)

    const jobs: EnqueuedJob[] = []
    const recipient = patientRecipient(after)
    if (recipient) {
      jobs.push(await enqueueOutboundJob(tx, { type: 'CONSULTATION_CANCELLED_PATIENT', consultationId: caseId, dedupeKey: caseId, recipientPhone: recipient }))
    }
    if (actor.type === 'DOCTOR') {
      jobs.push(await enqueueOutboundJob(tx, { type: 'CONSULTATION_CANCELLED_ADMIN', consultationId: caseId, dedupeKey: caseId }))
    } else if (DOCTOR_INVOLVED.includes(before.status)) {
      jobs.push(await enqueueOutboundJob(tx, { type: 'CONSULTATION_CANCELLED_DOCTOR', consultationId: caseId, dedupeKey: caseId }))
    }
    return {
      case: after,
      changed: true,
      jobs,
      withdrawnJobs,
      ...(ended && ended.status === 'ENDED' ? { videoRoomToClose: ended.roomName } : {}),
    }
  })
}
