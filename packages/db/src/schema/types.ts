import type { InferSelectModel, InferInsertModel } from 'drizzle-orm'
import type {
  users, sessions, mfaFactors, otpRequests,
  patients, dependants, guardianConsents,
  practitioners, availabilityRules,
  appointments, appointmentHolds, appointmentStatusHistory,
  intakes, encounters, clinicalAddenda,
  prescriptions, prescriptionItems, prescriptionVerifications,
  consultationRooms, roomParticipants, uploads,
  payments, notificationOutbox, consentPreferences,
  auditEvents, organizations,
} from './index'

export type User = InferSelectModel<typeof users>
export type NewUser = InferInsertModel<typeof users>
export type Patient = InferSelectModel<typeof patients>
export type NewPatient = InferInsertModel<typeof patients>
export type Practitioner = InferSelectModel<typeof practitioners>
export type Appointment = InferSelectModel<typeof appointments>
export type NewAppointment = InferInsertModel<typeof appointments>
export type Encounter = InferSelectModel<typeof encounters>
export type Prescription = InferSelectModel<typeof prescriptions>
export type PrescriptionItem = InferSelectModel<typeof prescriptionItems>
export type Upload = InferSelectModel<typeof uploads>
export type Payment = InferSelectModel<typeof payments>
export type AuditEvent = InferSelectModel<typeof auditEvents>
export type NotificationOutbox = InferSelectModel<typeof notificationOutbox>
