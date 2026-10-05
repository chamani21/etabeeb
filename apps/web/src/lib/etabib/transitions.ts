/**
 * eTabib V1 — central consultation state machine.
 *
 * THIS IS THE ONLY MODULE ALLOWED TO CHANGE consultation_cases.status.
 *
 * Every transition runs inside a caller-supplied database transaction and:
 *   1. locks the case row (SELECT … FOR UPDATE)
 *   2. verifies the current state (and optional expected source state)
 *   3. verifies the target is the single allowed next state
 *   4. verifies all guards against the case *after* applying the patch
 *   5. updates the case (WHERE id AND status = <locked status>)
 *   6. appends a case_events row
 * If any step throws, the surrounding transaction rolls back, so a status
 * change can never be committed without its event.
 *
 * Concurrency: pessimistic row lock (FOR UPDATE) serialises concurrent writers
 * on the same case; the status predicate on the UPDATE is a second, optimistic
 * guard. The database CHECK constraint `consultation_cases_confirmed_guard_check`
 * is a final backstop for the CONFIRMED prerequisites.
 */
import { db } from '@etabeeb/db'
import { consultationCases, caseEvents } from '@etabeeb/db/schema'
import type { ConsultationCase, NewConsultationCase } from '@etabeeb/db'
import { and, eq } from 'drizzle-orm'
import { EtabibError, TransitionError } from './errors'
import { CANCELLABLE_FROM, CANCELLATION_REASONS, canCancel, type CancelActorRole, type CancellationReason } from './cancellation'

export type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0]

export type ConsultationStatus = ConsultationCase['status']

export const CONSULTATION_STATUSES: readonly ConsultationStatus[] = [
  'NEW',
  'ADMIN_INTAKE',
  'INTAKE_COMPLETE',
  'AWAITING_PAYMENT',
  'PAYMENT_RECEIVED',
  'AWAITING_DOCTOR_APPROVAL',
  'CONFIRMED',
  'IN_CONSULTATION',
  'PRESCRIPTION_SENT',
  'COMPLETED',
  'CANCELLED',
] as const

/** Terminal statuses: the case is closed (a new WhatsApp message opens a new case). */
export const CLOSED_STATUSES: readonly ConsultationStatus[] = ['COMPLETED', 'CANCELLED']

/** The V1 lifecycle is strictly linear: each status has exactly one successor. */
export const NEXT_STATUS: Readonly<Record<ConsultationStatus, ConsultationStatus | null>> = {
  NEW: 'ADMIN_INTAKE',
  ADMIN_INTAKE: 'INTAKE_COMPLETE',
  INTAKE_COMPLETE: 'AWAITING_PAYMENT',
  AWAITING_PAYMENT: 'PAYMENT_RECEIVED',
  PAYMENT_RECEIVED: 'AWAITING_DOCTOR_APPROVAL',
  AWAITING_DOCTOR_APPROVAL: 'CONFIRMED',
  CONFIRMED: 'IN_CONSULTATION',
  IN_CONSULTATION: 'PRESCRIPTION_SENT',
  PRESCRIPTION_SENT: 'COMPLETED',
  COMPLETED: null,
  CANCELLED: null,
}

export const CASE_EVENT_TYPES = [
  'CASE_CREATED',
  'PATIENT_NAME_RECEIVED',
  'PATIENT_PHONE_RECEIVED',
  'ADMIN_INTAKE_REQUESTED',
  'ADMIN_INTAKE_COMPLETED',
  'ADMIN_INTAKE_UPDATED',
  'PAYMENT_REQUESTED',
  'PAYMENT_CONFIRMED',
  'DOCTOR_APPROVAL_REQUESTED',
  'DOCTOR_APPROVED',
  'DOCTOR_PROPOSED_NEW_TIME',
  'DOCTOR_POSTPONED',
  'DOCTOR_REJECTED',
  'CONSULTATION_CONFIRMED',
  'CONSULTATION_STARTED',
  'PRESCRIPTION_CREATED',
  'PRESCRIPTION_SENT',
  'PRESCRIPTION_DELIVERY_FAILED',
  'CASE_COMPLETED',
  // P1: operational staff actions (no status change)
  'ADMIN_NOTES_UPDATED',
  'OUTBOX_RETRY_REQUESTED',
  // Phase 6.6: video consultation (operational; never changes case status)
  'VIDEO_SESSION_CREATED',
  'VIDEO_LINK_CREATED',
  'VIDEO_LINK_REVOKED',
  'PATIENT_VIDEO_JOINED',
  'PATIENT_VIDEO_LEFT',
  'DOCTOR_VIDEO_JOINED',
  'DOCTOR_VIDEO_LEFT',
  'VIDEO_SESSION_ENDED',
  // Explicit terminal cancellation (cancelCase only)
  'CONSULTATION_CANCELLED',
  // Prescription stage (rx/service): drafting, locking, rendering, delivery — never change status by themselves
  'PRESCRIPTION_DRAFT_CREATED',
  'PRESCRIPTION_UPDATED',
  'PRESCRIPTION_PREVIEWED',
  'PRESCRIPTION_FINALIZED',
  'PRESCRIPTION_RENDERED',
  'PRESCRIPTION_RENDER_FAILED',
  'PRESCRIPTION_AMENDMENT_CREATED',
  'PRESCRIPTION_VOICE_RECORDED',
  'PRESCRIPTION_VOICE_DELETED',
  'PRESCRIPTION_DELIVERY_REQUESTED',
  'PRESCRIPTION_RESEND_REQUESTED',
  'PRESCRIPTION_IMAGE_SENT',
  'PRESCRIPTION_VOICE_SENT',
] as const
export type CaseEventType = (typeof CASE_EVENT_TYPES)[number]

/** Event recorded for each status transition (keyed by target status). */
export const TRANSITION_EVENT: Readonly<Record<Exclude<ConsultationStatus, 'NEW'>, CaseEventType>> = {
  ADMIN_INTAKE: 'ADMIN_INTAKE_REQUESTED',
  INTAKE_COMPLETE: 'ADMIN_INTAKE_COMPLETED',
  AWAITING_PAYMENT: 'PAYMENT_REQUESTED',
  PAYMENT_RECEIVED: 'PAYMENT_CONFIRMED',
  AWAITING_DOCTOR_APPROVAL: 'DOCTOR_APPROVAL_REQUESTED',
  CONFIRMED: 'CONSULTATION_CONFIRMED',
  IN_CONSULTATION: 'CONSULTATION_STARTED',
  PRESCRIPTION_SENT: 'PRESCRIPTION_SENT',
  COMPLETED: 'CASE_COMPLETED',
  CANCELLED: 'CONSULTATION_CANCELLED',
}

export type ActorType = 'SYSTEM' | 'PATIENT' | 'ADMIN' | 'DOCTOR' | 'N8N'
export interface Actor {
  type: ActorType
  id?: string | null
}

/** Non-clinical, non-secret metadata only (ids, flags, enums). */
export type EventMetadata = Record<string, string | number | boolean | null>

/** Fields a caller may change. Status is excluded — use transitionCase. */
export type CasePatch = Partial<
  Omit<NewConsultationCase, 'id' | 'status' | 'createdAt' | 'updatedAt'>
>

/** Out-of-band proof required by some transitions. */
export interface TransitionEvidence {
  /** notification_outbox id of a PRESCRIPTION_READY job confirmed delivered by n8n. */
  prescriptionDeliveryJobId?: string
}

export type CaseSnapshot = Pick<
  ConsultationCase,
  | 'status'
  | 'patientName'
  | 'patientPhone'
  | 'age'
  | 'sex'
  | 'consultationFor'
  | 'location'
  | 'mainComplaint'
  | 'paymentReceived'
  | 'paymentConfirmedAt'
  | 'paymentConfirmedBy'
  | 'proposedConsultationTime'
  | 'doctorDecision'
  | 'doctorApprovedTime'
  | 'prescriptionId'
  | 'prescriptionSentAt'
>

function guard(condition: unknown, code: string, message: string): void {
  if (!condition) throw new TransitionError(code, message)
}

/**
 * Pure validation of a transition. `next` is the case as it would be after the
 * patch is applied (status is still the current status). Throws TransitionError.
 */
export function assertTransitionAllowed(
  next: CaseSnapshot,
  to: ConsultationStatus,
  evidence: TransitionEvidence = {},
): void {
  const from = next.status
  if (NEXT_STATUS[from] !== to) {
    throw new TransitionError('illegal_transition', `Illegal transition ${from} → ${to}`)
  }

  switch (to) {
    case 'ADMIN_INTAKE':
      guard(next.patientName, 'guard_patient_name', 'Patient name is required')
      guard(next.patientPhone, 'guard_patient_phone', 'Patient phone is required')
      return
    case 'INTAKE_COMPLETE':
    case 'AWAITING_PAYMENT':
      guard(next.age !== null && next.age !== undefined, 'guard_intake', 'Age is required')
      guard(next.sex, 'guard_intake', 'Sex is required')
      guard(next.consultationFor, 'guard_intake', 'Consultation-for is required')
      guard(next.location, 'guard_intake', 'Location is required')
      guard(next.mainComplaint, 'guard_intake', 'Main complaint is required')
      return
    case 'PAYMENT_RECEIVED':
      guard(next.paymentReceived === true, 'guard_payment', 'Payment has not been received')
      guard(next.paymentConfirmedAt, 'guard_payment', 'Payment confirmation time is missing')
      guard(next.paymentConfirmedBy, 'guard_payment', 'Payment confirmer is missing')
      return
    case 'AWAITING_DOCTOR_APPROVAL':
      guard(next.paymentReceived === true, 'guard_payment', 'Payment has not been received')
      guard(next.proposedConsultationTime, 'guard_proposed_time', 'Proposed consultation time is required')
      return
    case 'CONFIRMED':
      guard(next.paymentReceived === true, 'guard_payment', 'Payment has not been received')
      guard(next.paymentConfirmedAt, 'guard_payment', 'Payment confirmation time is missing')
      guard(next.doctorDecision === 'APPROVED', 'guard_doctor_approval', 'Doctor has not approved')
      guard(next.doctorApprovedTime, 'guard_approved_time', 'Doctor-approved time is required')
      return
    case 'IN_CONSULTATION':
      // Adjacency already guarantees current status = CONFIRMED
      return
    case 'PRESCRIPTION_SENT':
      guard(next.prescriptionId, 'guard_prescription', 'No prescription exists for this case')
      guard(next.prescriptionSentAt, 'guard_prescription_delivery', 'Prescription delivery not confirmed')
      // evidence = the queued WhatsApp delivery job of the finalized prescription
      // (delivery is tracked per message; completion is the doctor's explicit action)
      guard(
        evidence.prescriptionDeliveryJobId,
        'guard_prescription_delivery',
        'Prescription delivery evidence is required',
      )
      return
    case 'COMPLETED':
      return
    case 'CANCELLED':
      // Unreachable (NEXT_STATUS never yields CANCELLED) — cancellation uses cancelCase
      throw new TransitionError('illegal_transition', 'Use cancelCase to cancel a consultation')
    case 'NEW':
      throw new TransitionError('illegal_transition', 'Cannot transition into NEW')
  }
}

/** Lock and return a case row for the rest of the transaction. */
export async function lockCase(tx: Tx, caseId: string): Promise<ConsultationCase> {
  const rows = await tx
    .select()
    .from(consultationCases)
    .where(eq(consultationCases.id, caseId))
    .for('update')
  const row = rows[0]
  if (!row) throw new EtabibError('not_found', 'Consultation case not found', 404)
  return row
}

export async function recordCaseEvent(
  tx: Tx,
  input: {
    caseId: string
    eventType: CaseEventType
    oldStatus: ConsultationStatus | null
    newStatus: ConsultationStatus | null
    actor: Actor
    metadata?: EventMetadata
  },
): Promise<void> {
  await tx.insert(caseEvents).values({
    consultationId: input.caseId,
    eventType: input.eventType,
    oldStatus: input.oldStatus,
    newStatus: input.newStatus,
    actorType: input.actor.type,
    actorId: input.actor.id ?? null,
    metadata: input.metadata ?? null,
  })
}

function assertNoStatus(patch: CasePatch): void {
  if (patch && Object.prototype.hasOwnProperty.call(patch, 'status')) {
    throw new EtabibError('internal_error', 'Status must be changed via transitionCase', 500)
  }
}

/** Create a case in NEW and record CASE_CREATED. */
export async function createCase(
  tx: Tx,
  values: CasePatch,
  actor: Actor,
  metadata?: EventMetadata,
): Promise<ConsultationCase> {
  assertNoStatus(values)
  const [created] = await tx.insert(consultationCases).values({ ...values, status: 'NEW' }).returning()
  if (!created) throw new EtabibError('internal_error', 'Failed to create case', 500)
  await recordCaseEvent(tx, {
    caseId: created.id,
    eventType: 'CASE_CREATED',
    oldStatus: null,
    newStatus: 'NEW',
    actor,
    ...(metadata ? { metadata } : {}),
  })
  return created
}

/**
 * Perform one guarded status transition. Must be called inside db.transaction.
 */
export async function transitionCase(
  tx: Tx,
  input: {
    caseId: string
    to: ConsultationStatus
    actor: Actor
    patch?: CasePatch
    expectedFrom?: ConsultationStatus
    evidence?: TransitionEvidence
    metadata?: EventMetadata
  },
): Promise<ConsultationCase> {
  const patch = input.patch ?? {}
  assertNoStatus(patch)
  const current = await lockCase(tx, input.caseId)

  if (input.expectedFrom && current.status !== input.expectedFrom) {
    throw new TransitionError(
      'unexpected_status',
      `Case is ${current.status}, expected ${input.expectedFrom}`,
    )
  }

  const next = { ...current, ...patch, status: current.status } as CaseSnapshot
  assertTransitionAllowed(next, input.to, input.evidence)

  const [updated] = await tx
    .update(consultationCases)
    .set({ ...patch, status: input.to, updatedAt: new Date() })
    .where(and(eq(consultationCases.id, current.id), eq(consultationCases.status, current.status)))
    .returning()
  if (!updated) throw new TransitionError('concurrent_modification', 'Case was modified concurrently')

  await recordCaseEvent(tx, {
    caseId: current.id,
    eventType: TRANSITION_EVENT[input.to as Exclude<ConsultationStatus, 'NEW'>],
    oldStatus: current.status,
    newStatus: input.to,
    actor: input.actor,
    ...(input.metadata ? { metadata: input.metadata } : {}),
  })
  return updated
}

/**
 * Update non-status fields of an (already locked or lockable) case and record
 * an event. Never changes status.
 */
export async function updateCaseFields(
  tx: Tx,
  input: {
    caseId: string
    patch: CasePatch
    eventType: CaseEventType
    actor: Actor
    metadata?: EventMetadata
  },
): Promise<ConsultationCase> {
  assertNoStatus(input.patch)
  const current = await lockCase(tx, input.caseId)
  const [updated] = await tx
    .update(consultationCases)
    .set({ ...input.patch, updatedAt: new Date() })
    .where(eq(consultationCases.id, current.id))
    .returning()
  if (!updated) throw new EtabibError('internal_error', 'Failed to update case', 500)
  await recordCaseEvent(tx, {
    caseId: current.id,
    eventType: input.eventType,
    oldStatus: current.status,
    newStatus: current.status,
    actor: input.actor,
    ...(input.metadata ? { metadata: input.metadata } : {}),
  })
  return updated
}

// ------------------------------------------------------------------
// Cancellation: the only non-linear transition (any allowed open state → CANCELLED)
// ------------------------------------------------------------------

export { CANCELLABLE_FROM, CANCELLATION_REASONS, canCancel, type CancelActorRole, type CancellationReason }

/**
 * Cancel a case (caller holds the transaction). Locks the row, checks the role
 * may cancel from the current status, records cancellation facts and the
 * CONSULTATION_CANCELLED event (reason code only — never the free-text note).
 */
export async function cancelCase(
  tx: Tx,
  input: {
    caseId: string
    actor: Actor & { type: CancelActorRole; id: string }
    reason: CancellationReason
    note?: string | null
  },
): Promise<{ before: ConsultationCase; after: ConsultationCase }> {
  const current = await lockCase(tx, input.caseId)
  if (!canCancel(input.actor.type, current.status)) {
    throw new TransitionError(
      'cancel_not_allowed',
      `${input.actor.type === 'DOCTOR' ? 'Doctor' : 'Admin'} cannot cancel a consultation that is ${current.status}`,
    )
  }
  const now = new Date()
  const [updated] = await tx
    .update(consultationCases)
    .set({
      status: 'CANCELLED',
      cancelledAt: now,
      cancelledBy: input.actor.id,
      cancelledByRole: input.actor.type,
      cancellationReason: input.reason,
      cancellationNote: input.reason === 'OTHER' ? (input.note ?? null) : null,
      cancelledFromStatus: current.status,
      updatedAt: now,
    })
    .where(and(eq(consultationCases.id, current.id), eq(consultationCases.status, current.status)))
    .returning()
  if (!updated) throw new TransitionError('concurrent_modification', 'Case was modified concurrently')
  await recordCaseEvent(tx, {
    caseId: current.id,
    eventType: 'CONSULTATION_CANCELLED',
    oldStatus: current.status,
    newStatus: 'CANCELLED',
    actor: input.actor,
    metadata: { actorRole: input.actor.type, reason: input.reason, hasNote: Boolean(input.reason === 'OTHER' && input.note) },
  })
  return { before: current, after: updated }
}
