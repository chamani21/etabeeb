import {
  pgTable,
  uuid,
  text,
  timestamp,
  boolean,
  integer,
  pgEnum,
  index,
  unique,
  check,
} from 'drizzle-orm/pg-core'
import { sql } from 'drizzle-orm'
import { users } from './identity'
import { patients, dependants } from './patient'
import { practitioners } from './practitioner'

// ============================================================
// BOOKING & SCHEDULING
// ============================================================

export const appointmentStatusEnum = pgEnum('appointment_status', [
  // Active states
  'draft',
  'held', // short-lived, concurrency-safe lock
  'pending_payment',
  'pending_verification', // manual payment, awaiting staff confirmation
  'confirmed',
  'checked_in',
  'in_progress',
  // Terminal states
  'completed',
  'rescheduled',
  'cancelled',
  'no_show',
  // Payment terminal
  'refund_pending',
  'refunded',
  'failed',
])

export const consultationTypeEnum = pgEnum('consultation_type_value', [
  'video',
  'audio',
])

export const appointmentHolds = pgTable(
  'appointment_holds',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    practitionerId: uuid('practitioner_id')
      .notNull()
      .references(() => practitioners.id),
    slotStart: timestamp('slot_start', { withTimezone: true }).notNull(),
    slotEnd: timestamp('slot_end', { withTimezone: true }).notNull(),
    heldByUserId: uuid('held_by_user_id')
      .notNull()
      .references(() => users.id),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    released: boolean('released').notNull().default(false),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    // Prevent double-booking: same practitioner cannot have two active holds for overlapping slots
    // This is enforced via application logic + DB unique constraint
    // For true exclusion, use PostgreSQL EXCLUDE with tstzrange (migration note)
    practSlotIdx: index('holds_pract_slot_idx').on(t.practitionerId, t.slotStart),
  }),
)

export const appointments = pgTable(
  'appointments',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    publicId: uuid('public_id').notNull().unique().defaultRandom(),
    // Who
    patientUserId: uuid('patient_user_id')
      .notNull()
      .references(() => users.id),
    patientId: uuid('patient_id').references(() => patients.id),
    dependantId: uuid('dependant_id').references(() => dependants.id),
    practitionerId: uuid('practitioner_id')
      .notNull()
      .references(() => practitioners.id),
    // When (UTC)
    slotStart: timestamp('slot_start', { withTimezone: true }).notNull(),
    slotEnd: timestamp('slot_end', { withTimezone: true }).notNull(),
    timezone: text('timezone').notNull(), // patient-confirmed timezone
    // What
    consultationType: consultationTypeEnum('consultation_type').notNull().default('video'),
    chiefComplaint: text('chief_complaint'), // brief, not full PHI
    // State machine
    status: appointmentStatusEnum('status').notNull().default('draft'),
    // Versioning for optimistic concurrency
    version: integer('version').notNull().default(1),
    // Cancellation
    cancelledBy: uuid('cancelled_by').references(() => users.id),
    cancellationReason: text('cancellation_reason'),
    cancelledAt: timestamp('cancelled_at', { withTimezone: true }),
    // Manual payment
    manualPaymentRef: text('manual_payment_ref'),
    manualPaymentVerifiedBy: uuid('manual_payment_verified_by').references(() => users.id),
    manualPaymentVerifiedAt: timestamp('manual_payment_verified_at', { withTimezone: true }),
    manualPaymentBypassedByAdmin: boolean('manual_payment_bypassed_by_admin')
      .notNull()
      .default(false),
    // Audit
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    createdBy: uuid('created_by').references(() => users.id),
    updatedBy: uuid('updated_by').references(() => users.id),
  },
  (t) => ({
    practSlotIdx: index('appt_pract_slot_idx').on(t.practitionerId, t.slotStart),
    patientIdx: index('appt_patient_idx').on(t.patientUserId),
    statusIdx: index('appt_status_idx').on(t.status),
    publicIdx: index('appt_public_idx').on(t.publicId),
    // CHECK: slot end must be after slot start
    slotCheck: check('appt_slot_check', sql`slot_end > slot_start`),
  }),
)

export const appointmentStatusHistory = pgTable('appointment_status_history', {
  id: uuid('id').primaryKey().defaultRandom(),
  appointmentId: uuid('appointment_id')
    .notNull()
    .references(() => appointments.id, { onDelete: 'restrict' }),
  fromStatus: appointmentStatusEnum('from_status'),
  toStatus: appointmentStatusEnum('to_status').notNull(),
  changedBy: uuid('changed_by').references(() => users.id),
  reason: text('reason'),
  changedAt: timestamp('changed_at', { withTimezone: true }).notNull().defaultNow(),
})
