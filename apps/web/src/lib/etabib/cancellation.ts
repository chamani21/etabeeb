/**
 * eTabib V1 — cancellation rules shared by the server and the staff UI
 * (no imports: safe for client components).
 */

export type CancelActorRole = 'ADMIN' | 'DOCTOR'

/**
 * Who may cancel from which status. Never after the consultation has started
 * (IN_CONSULTATION onwards) — the clinical workflow completes those cases.
 */
export const CANCELLABLE_FROM: Readonly<Record<CancelActorRole, readonly string[]>> = {
  ADMIN: ['ADMIN_INTAKE', 'INTAKE_COMPLETE', 'AWAITING_PAYMENT', 'PAYMENT_RECEIVED', 'AWAITING_DOCTOR_APPROVAL', 'CONFIRMED'],
  DOCTOR: ['AWAITING_DOCTOR_APPROVAL', 'CONFIRMED'],
}

export const CANCELLATION_REASONS = [
  'PATIENT_REQUESTED',
  'DOCTOR_UNAVAILABLE',
  'PATIENT_UNREACHABLE',
  'PAYMENT_ISSUE',
  'SCHEDULING_PROBLEM',
  'DUPLICATE_REQUEST',
  'TEST_CASE',
  'OTHER',
] as const
export type CancellationReason = (typeof CANCELLATION_REASONS)[number]

/** Staff-facing label for each cancellation reason code. */
export const CANCELLATION_REASON_LABELS: Readonly<Record<CancellationReason, string>> = {
  PATIENT_REQUESTED: 'Patient requested cancellation',
  DOCTOR_UNAVAILABLE: 'Doctor unavailable',
  PATIENT_UNREACHABLE: 'Patient unreachable',
  PAYMENT_ISSUE: 'Payment issue',
  SCHEDULING_PROBLEM: 'Scheduling problem',
  DUPLICATE_REQUEST: 'Duplicate request',
  TEST_CASE: 'Test consultation cancelled after validation',
  OTHER: 'Other',
}

export function canCancel(role: CancelActorRole, status: string): boolean {
  return CANCELLABLE_FROM[role].includes(status)
}

export function cancellationReasonLabel(code: string | null | undefined): string {
  return code && code in CANCELLATION_REASON_LABELS ? CANCELLATION_REASON_LABELS[code as CancellationReason] : 'Other'
}
