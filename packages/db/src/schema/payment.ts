import {
  pgTable,
  uuid,
  text,
  timestamp,
  boolean,
  integer,
  pgEnum,
  index,
} from 'drizzle-orm/pg-core'
import { users } from './identity'
import { appointments } from './booking'

// ============================================================
// PAYMENTS (Manual pilot + future gateway)
// ============================================================

export const paymentStatusEnum = pgEnum('payment_status', [
  'pending',
  'processing',
  'completed',
  'failed',
  'refunded',
  'partially_refunded',
  'bypassed_by_admin', // admin-approved free/deferred consultation
])

export const currencyEnum = pgEnum('currency', ['PKR', 'AFN', 'USD'])

export const payments = pgTable(
  'payments',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    publicId: uuid('public_id').notNull().unique().defaultRandom(),
    appointmentId: uuid('appointment_id')
      .notNull()
      .references(() => appointments.id, { onDelete: 'restrict' }),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id),
    // Money — store as integer minor units (e.g. paisa for PKR)
    // NEVER use floating-point for money
    amountMinor: integer('amount_minor').notNull(), // e.g. 50000 = PKR 500.00
    currency: currencyEnum('currency').notNull().default('PKR'),
    status: paymentStatusEnum('status').notNull().default('pending'),
    // Manual payment fields
    isManual: boolean('is_manual').notNull().default(true),
    manualReference: text('manual_reference'), // transfer ID, slip number etc.
    manualNotes: text('manual_notes'),
    verifiedBy: uuid('verified_by').references(() => users.id),
    verifiedAt: timestamp('verified_at', { withTimezone: true }),
    bypassedByAdmin: boolean('bypassed_by_admin').notNull().default(false),
    bypassedBy: uuid('bypassed_by').references(() => users.id),
    bypassReason: text('bypass_reason'),
    bypassedAt: timestamp('bypassed_at', { withTimezone: true }),
    // Idempotency
    idempotencyKey: text('idempotency_key').notNull().unique(),
    // Audit
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    createdBy: uuid('created_by').references(() => users.id),
  },
  (t) => ({
    apptIdx: index('payments_appt_idx').on(t.appointmentId),
    statusIdx: index('payments_status_idx').on(t.status),
  }),
)
