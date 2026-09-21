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
import { patients, dependants } from './patient'

// ============================================================
// CLINICAL RECORDS
// ============================================================

export const encounterStatusEnum = pgEnum('encounter_status', [
  'in_progress',
  'signed',
  'amended', // addendum added after signing
])

export const intakes = pgTable('intakes', {
  id: uuid('id').primaryKey().defaultRandom(),
  appointmentId: uuid('appointment_id')
    .notNull()
    .references(() => appointments.id, { onDelete: 'restrict' }),
  // Structured intake fields
  chiefComplaint: text('chief_complaint').notNull(),
  complaintDurationDays: integer('complaint_duration_days'),
  allergies: text('allergies'), // encrypted at rest
  currentMedications: text('current_medications'), // encrypted at rest
  chronicConditions: text('chronic_conditions'), // encrypted at rest
  relevantHistory: text('relevant_history'), // encrypted at rest
  // Clinical flags
  isPregnant: boolean('is_pregnant'),
  isBreastfeeding: boolean('is_breastfeeding'),
  // Triage
  redFlagTriggered: boolean('red_flag_triggered').notNull().default(false),
  redFlagRuleVersion: text('red_flag_rule_version'), // version of rule set used
  redFlagAnswers: text('red_flag_answers'), // JSON — encrypted
  redFlagResult: text('red_flag_result'), // safe | warning | stop
  redFlagAcknowledgedAt: timestamp('red_flag_acknowledged_at', { withTimezone: true }),
  // Metadata
  submittedAt: timestamp('submitted_at', { withTimezone: true }).notNull().defaultNow(),
  createdBy: uuid('created_by').references(() => users.id),
})

export const encounters = pgTable(
  'encounters',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    publicId: uuid('public_id').notNull().unique().defaultRandom(),
    appointmentId: uuid('appointment_id')
      .notNull()
      .references(() => appointments.id, { onDelete: 'restrict' }),
    practitionerId: uuid('practitioner_id')
      .notNull()
      .references(() => users.id),
    // Clinical note (structured)
    subjective: text('subjective'), // encrypted — patient's story
    objective: text('objective'), // encrypted — exam findings
    assessment: text('assessment'), // encrypted — diagnosis / impression
    plan: text('plan'), // encrypted — treatment plan
    safetyNet: text('safety_net'), // encrypted — warning signs to watch for
    followUpDays: integer('follow_up_days'),
    // Signing (immutable once signed)
    status: encounterStatusEnum('status').notNull().default('in_progress'),
    signedAt: timestamp('signed_at', { withTimezone: true }),
    signedBy: uuid('signed_by').references(() => users.id),
    signatureEvidence: text('signature_evidence'), // method used (step-up token hash)
    // Optimistic concurrency
    version: integer('version').notNull().default(1),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    createdBy: uuid('created_by').references(() => users.id),
    updatedBy: uuid('updated_by').references(() => users.id),
  },
  (t) => ({
    apptIdx: index('encounters_appt_idx').on(t.appointmentId),
    practIdx: index('encounters_pract_idx').on(t.practitionerId),
  }),
)

export const clinicalAddenda = pgTable('clinical_addenda', {
  id: uuid('id').primaryKey().defaultRandom(),
  encounterId: uuid('encounter_id')
    .notNull()
    .references(() => encounters.id, { onDelete: 'restrict' }),
  addendumText: text('addendum_text').notNull(), // encrypted
  reason: text('reason').notNull(),
  author: uuid('author').notNull().references(() => users.id),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
})
