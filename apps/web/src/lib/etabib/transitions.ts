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
] as const

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
      guard(
        evidence.prescriptionDeliveryJobId,
        'guard_prescription_delivery',
        'Prescription delivery evidence is required',
      )
      return
    case 'COMPLETED':
      return
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
