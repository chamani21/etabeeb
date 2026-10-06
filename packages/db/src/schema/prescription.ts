import {
  pgTable,
  uuid,
  text,
  timestamp,
  boolean,
  integer,
  pgEnum,
  index,
  jsonb,
  uniqueIndex,
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
    // Nullable since eTabib V1: V1 consultation cases (consultation_cases.prescription_id)
    // have no appointment/encounter and the WhatsApp patient has no user account.
    // The legacy appointment flow still always supplies all three (validated in the API).
    encounterId: uuid('encounter_id')
      .references(() => encounters.id, { onDelete: 'restrict' }),
    appointmentId: uuid('appointment_id')
      .references(() => appointments.id, { onDelete: 'restrict' }),
    prescribedBy: uuid('prescribed_by')
      .notNull()
      .references(() => users.id),
    prescribedForUserId: uuid('prescribed_for_user_id')
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
    // eTabib V1 clinical sections (all optional; legacy flow leaves them null)
    diagnosis: text('diagnosis'), // diagnosis / assessment
    investigations: text('investigations'),
    advice: text('advice'),
    followUp: text('follow_up'),
    notes: text('notes'), // free-text doctor notes
    // ---- eTabib V1 prescription stage (draft → finalized/locked → rendered → delivered) ----
    // consultation_cases.id (FK added in migration 0005; no Drizzle reference to avoid an import cycle)
    consultationId: uuid('consultation_id'),
    rxNumber: text('rx_number'), // human-readable ETB-RX-YYYYMMDD-NNNNN, shared by all revisions
    // Short universal prescription ID (MR-number style, e.g. K7Q4M): printed, searchable,
    // shared by all revisions, never changes. Unambiguous alphabet (no 0/O, 1/I/L).
    rxCode: text('rx_code'),
    revision: integer('revision').notNull().default(1),
    amendedFromId: uuid('amended_from_id'), // previous revision (never overwritten)
    // DRAFT (editable) | FINALIZED (locked, immutable clinical content) | SUPERSEDED (an amendment replaced it)
    workflowStatus: text('workflow_status').notNull().default('FINALIZED'),
    finalizedAt: timestamp('finalized_at', { withTimezone: true }),
    lockedAt: timestamp('locked_at', { withTimezone: true }),
    freeText: text('free_text'), // free-text prescribing in addition to / instead of structured items
    redFlags: text('red_flags'), // optional urgent-care instructions (doctor-written)
    followUpInterval: text('follow_up_interval'), // e.g. "7 days"
    vitals: jsonb('vitals').$type<Record<string, string>>(), // doctor-entered; never invented
    // Rendered artefacts (private storage keys) — derived from the canonical data above
    imageKeys: jsonb('image_keys').$type<string[]>(),
    renderedAt: timestamp('rendered_at', { withTimezone: true }),
    renderError: text('render_error'),
    deliveryRequestedAt: timestamp('delivery_requested_at', { withTimezone: true }),
    // Audit
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    encounterIdx: index('prescriptions_encounter_idx').on(t.encounterId),
    tokenIdx: index('prescriptions_token_idx').on(t.verificationToken),
    statusIdx: index('prescriptions_status_idx').on(t.status),
    consultationIdx: index('prescriptions_consultation_idx').on(t.consultationId),
    rxRevisionUq: uniqueIndex('prescriptions_rx_revision_uq').on(t.rxNumber, t.revision),
    rxCodeRevisionUq: uniqueIndex('prescriptions_rx_code_revision_uq').on(t.rxCode, t.revision),
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
  dose: text('dose'), // e.g. "1 tablet" (optional: quick prescribing)
  frequency: text('frequency'), // e.g. "twice daily"
  timing: text('timing'), // e.g. "after meals"
  durationDays: integer('duration_days'),
  duration: text('duration'), // free text, e.g. "5 days", "2 weeks"
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

// Doctor's optional voice explanation for a prescription (eTabib V1).
// Audio lives in private storage; only metadata is stored here.
export const prescriptionVoiceNotes = pgTable(
  'prescription_voice_notes',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    prescriptionId: uuid('prescription_id')
      .notNull()
      .references(() => prescriptions.id, { onDelete: 'restrict' }),
    originalKey: text('original_key').notNull(), // as recorded by the browser
    originalMimeType: text('original_mime_type').notNull(),
    audioKey: text('audio_key').notNull(), // WhatsApp-ready OGG/Opus mono
    mimeType: text('mime_type').notNull().default('audio/ogg'),
    sizeBytes: integer('size_bytes').notNull(),
    durationMs: integer('duration_ms').notNull(),
    includeInDelivery: boolean('include_in_delivery').notNull().default(true),
    createdBy: uuid('created_by').notNull().references(() => users.id),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
  },
  (t) => ({
    prescriptionIdx: index('prescription_voice_notes_prescription_idx').on(t.prescriptionId),
  }),
)
