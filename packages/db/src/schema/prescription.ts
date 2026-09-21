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
import { encounters } from './clinical'
import { appointments } from './booking'

// ============================================================
// PRESCRIPTIONS (E-PRESCRIPTION MODULE)
// ============================================================

export const prescriptionStatusEnum = pgEnum('prescription_status', [
  'active',
  'replaced',
  'revoked',
  'expired',
  'entered_in_error',
])

export const prescriptions = pgTable(
  'prescriptions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    publicId: uuid('public_id').notNull().unique().defaultRandom(),
    // High-entropy QR verification token (never the public ID)
    verificationToken: text('verification_token').notNull().unique(),
    encounterId: uuid('encounter_id')
      .notNull()
      .references(() => encounters.id, { onDelete: 'restrict' }),
    appointmentId: uuid('appointment_id')
      .notNull()
      .references(() => appointments.id, { onDelete: 'restrict' }),
    prescribedBy: uuid('prescribed_by')
      .notNull()
      .references(() => users.id),
    prescribedForUserId: uuid('prescribed_for_user_id')
      .notNull()
      .references(() => users.id),
    // Status
    status: prescriptionStatusEnum('status').notNull().default('active'),
    replacedById: uuid('replaced_by_id'), // references another prescription
    revokedReason: text('revoked_reason'),
    revokedAt: timestamp('revoked_at', { withTimezone: true }),
    revokedBy: uuid('revoked_by').references(() => users.id),
    expiresAt: timestamp('expires_at', { withTimezone: true }),
    // Signing (immutable once signed)
    signedAt: timestamp('signed_at', { withTimezone: true }),
    signedBy: uuid('signed_by').references(() => users.id),
    // PDF
    pdfKey: text('pdf_key'), // storage key for signed PDF
    documentHash: text('document_hash'), // SHA-256 of canonical document bytes
    // Audit
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    encounterIdx: index('prescriptions_encounter_idx').on(t.encounterId),
    tokenIdx: index('prescriptions_token_idx').on(t.verificationToken),
    statusIdx: index('prescriptions_status_idx').on(t.status),
  }),
)

export const prescriptionItems = pgTable('prescription_items', {
  id: uuid('id').primaryKey().defaultRandom(),
  prescriptionId: uuid('prescription_id')
    .notNull()
    .references(() => prescriptions.id, { onDelete: 'restrict' }),
  // Generic medicine (no brand names required)
  genericName: text('generic_name').notNull(),
  strength: text('strength'), // e.g. "500mg"
  formulation: text('formulation'), // tablet | capsule | syrup | injection | cream | drops
  route: text('route'), // oral | topical | IV | IM | inhaled
  dose: text('dose').notNull(), // e.g. "1 tablet"
  frequency: text('frequency').notNull(), // e.g. "twice daily"
  timing: text('timing'), // e.g. "after meals"
  durationDays: integer('duration_days'),
  quantity: text('quantity'), // e.g. "30 tablets"
  refills: integer('refills').notNull().default(0),
  indication: text('indication'),
  substitutionAllowed: boolean('substitution_allowed').notNull().default(true),
  patientInstructions: text('patient_instructions'),
  // Controlled drug: disabled by default per LEGAL-04
  isControlled: boolean('is_controlled').notNull().default(false),
  sortOrder: integer('sort_order').notNull().default(0),
})

export const prescriptionVerifications = pgTable('prescription_verifications', {
  id: uuid('id').primaryKey().defaultRandom(),
  prescriptionId: uuid('prescription_id')
    .notNull()
    .references(() => prescriptions.id),
  verifiedAt: timestamp('verified_at', { withTimezone: true }).notNull().defaultNow(),
  ipAddress: text('ip_address'),
  userAgent: text('user_agent'),
  // Rate limiting: track accesses without exposing clinical data
})
