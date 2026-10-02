import { describe, it, expect } from 'vitest'
import {
  assertTransitionAllowed,
  CONSULTATION_STATUSES,
  NEXT_STATUS,
  type CaseSnapshot,
  type ConsultationStatus,
} from '../transitions'
import { TransitionError } from '../errors'

const base: CaseSnapshot = {
  status: 'NEW',
  patientName: null,
  patientPhone: null,
  age: null,
  sex: null,
  consultationFor: null,
  location: null,
  mainComplaint: null,
  paymentReceived: false,
  paymentConfirmedAt: null,
  paymentConfirmedBy: null,
  proposedConsultationTime: null,
  doctorDecision: null,
  doctorApprovedTime: null,
  prescriptionId: null,
  prescriptionSentAt: null,
}

const complete: Omit<CaseSnapshot, 'status'> = {
  patientName: 'Test Patient',
  patientPhone: '+923001234567',
  age: 40,
  sex: 'MALE',
  consultationFor: 'SELF',
  location: 'Test Town',
  mainComplaint: 'Synthetic complaint',
  paymentReceived: true,
  paymentConfirmedAt: new Date(),
  paymentConfirmedBy: '00000000-0000-0000-0000-000000000001',
  proposedConsultationTime: new Date(),
  doctorDecision: 'APPROVED',
  doctorApprovedTime: new Date(),
  prescriptionId: '00000000-0000-0000-0000-000000000002',
  prescriptionSentAt: new Date(),
}

const at = (status: ConsultationStatus, over: Partial<CaseSnapshot> = {}): CaseSnapshot => ({
  ...complete,
  ...over,
  status,
})

function expectFail(fn: () => void, code: string) {
  try {
    fn()
  } catch (e) {
    expect(e).toBeInstanceOf(TransitionError)
    expect((e as TransitionError).code).toBe(code)
    return
  }
  throw new Error('expected transition to fail')
}

describe('state machine: allowed transitions', () => {
  it('is a strictly linear lifecycle ending at COMPLETED', () => {
    expect(CONSULTATION_STATUSES).toHaveLength(10)
    for (let i = 0; i < CONSULTATION_STATUSES.length - 1; i++) {
      expect(NEXT_STATUS[CONSULTATION_STATUSES[i]!]).toBe(CONSULTATION_STATUSES[i + 1])
    }
    expect(NEXT_STATUS.COMPLETED).toBeNull()
  })

  it('accepts every forward step when guards are satisfied', () => {
    for (const from of CONSULTATION_STATUSES) {
      const to = NEXT_STATUS[from]
      if (!to) continue
      expect(() =>
        assertTransitionAllowed(at(from), to, { prescriptionDeliveryJobId: 'job' }),
      ).not.toThrow()
    }
  })

  it.each<[ConsultationStatus, ConsultationStatus]>([
    ['NEW', 'CONFIRMED'],
    ['ADMIN_INTAKE', 'PAYMENT_RECEIVED'],
    ['AWAITING_PAYMENT', 'CONFIRMED'],
    ['CONFIRMED', 'PAYMENT_RECEIVED'],
    ['COMPLETED', 'IN_CONSULTATION'],
    ['NEW', 'NEW'],
    ['IN_CONSULTATION', 'COMPLETED'],
  ])('rejects illegal transition %s → %s even with all fields set', (from, to) => {
    expectFail(() => assertTransitionAllowed(at(from), to, { prescriptionDeliveryJobId: 'j' }), 'illegal_transition')
  })
})

describe('state machine: guards', () => {
  it('ADMIN_INTAKE requires name and phone', () => {
    expectFail(() => assertTransitionAllowed({ ...base, patientName: 'A' }, 'ADMIN_INTAKE'), 'guard_patient_phone')
    expectFail(() => assertTransitionAllowed({ ...base, patientPhone: '+923001234567' }, 'ADMIN_INTAKE'), 'guard_patient_name')
  })

  it('INTAKE_COMPLETE requires the admin clinical intake fields', () => {
    expectFail(() => assertTransitionAllowed(at('ADMIN_INTAKE', { mainComplaint: null }), 'INTAKE_COMPLETE'), 'guard_intake')
    expectFail(() => assertTransitionAllowed(at('ADMIN_INTAKE', { age: null }), 'INTAKE_COMPLETE'), 'guard_intake')
  })

  it('PAYMENT_RECEIVED requires paymentReceived, confirmedAt and confirmedBy', () => {
    expectFail(() => assertTransitionAllowed(at('AWAITING_PAYMENT', { paymentReceived: false }), 'PAYMENT_RECEIVED'), 'guard_payment')
    expectFail(() => assertTransitionAllowed(at('AWAITING_PAYMENT', { paymentConfirmedAt: null }), 'PAYMENT_RECEIVED'), 'guard_payment')
    expectFail(() => assertTransitionAllowed(at('AWAITING_PAYMENT', { paymentConfirmedBy: null }), 'PAYMENT_RECEIVED'), 'guard_payment')
  })

  it('AWAITING_DOCTOR_APPROVAL requires payment', () => {
    expectFail(
      () => assertTransitionAllowed(at('PAYMENT_RECEIVED', { paymentReceived: false }), 'AWAITING_DOCTOR_APPROVAL'),
      'guard_payment',
    )
  })

  it('CONFIRMED requires payment, APPROVED decision and approved time', () => {
    expectFail(() => assertTransitionAllowed(at('AWAITING_DOCTOR_APPROVAL', { paymentReceived: false }), 'CONFIRMED'), 'guard_payment')
    expectFail(() => assertTransitionAllowed(at('AWAITING_DOCTOR_APPROVAL', { paymentConfirmedAt: null }), 'CONFIRMED'), 'guard_payment')
    for (const decision of ['PENDING', 'PROPOSE_NEW_TIME', 'POSTPONED', 'REJECTED', null] as const) {
      expectFail(
        () => assertTransitionAllowed(at('AWAITING_DOCTOR_APPROVAL', { doctorDecision: decision }), 'CONFIRMED'),
        'guard_doctor_approval',
      )
    }
    expectFail(
      () => assertTransitionAllowed(at('AWAITING_DOCTOR_APPROVAL', { doctorApprovedTime: null }), 'CONFIRMED'),
      'guard_approved_time',
    )
  })

  it('PRESCRIPTION_SENT requires a prescription and delivery evidence', () => {
    expectFail(
      () => assertTransitionAllowed(at('IN_CONSULTATION', { prescriptionId: null }), 'PRESCRIPTION_SENT', { prescriptionDeliveryJobId: 'j' }),
      'guard_prescription',
    )
    expectFail(() => assertTransitionAllowed(at('IN_CONSULTATION'), 'PRESCRIPTION_SENT'), 'guard_prescription_delivery')
    expectFail(
      () => assertTransitionAllowed(at('IN_CONSULTATION', { prescriptionSentAt: null }), 'PRESCRIPTION_SENT', { prescriptionDeliveryJobId: 'j' }),
      'guard_prescription_delivery',
    )
  })
})
