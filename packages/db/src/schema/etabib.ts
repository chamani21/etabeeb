import {
  pgTable,
  uuid,
  text,
  timestamp,
  boolean,
  integer,
  jsonb,
  pgEnum,
  index,
  uniqueIndex,
  check,
} from 'drizzle-orm/pg-core'
import { sql } from 'drizzle-orm'
import { users } from './identity'
import { prescriptions } from './prescription'

// ============================================================
// eTABIB V1 — SIMPLIFIED CONSULTATION WORKFLOW
// Single fixed doctor (Dr. Jalaluddin), WhatsApp intake (name + phone only),
// admin-owned clinical intake, manual payment verification, manual doctor
// time approval. Deliberately separate from the appointment/slot model.
//
// Status changes MUST go through apps/web/src/lib/etabib/transitions.ts.
// ============================================================

export const consultationStatusValues = [
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
  // Terminal, explicit cancellation (never deleted; never COMPLETED)
  'CANCELLED',
] as const

export const consultationStatusEnum = pgEnum('consultation_status', consultationStatusValues)

export const consultationForEnum = pgEnum('consultation_for', ['SELF', 'OTHER'])

export const consultationSexEnum = pgEnum('consultation_patient_sex', ['MALE', 'FEMALE'])

export const consultationPaymentSourceEnum = pgEnum('consultation_payment_source', [
  'EASYPAISA',
  'OTHER',
])

export const doctorDecisionEnum = pgEnum('doctor_decision', [
  'PENDING',
  'APPROVED',
  'PROPOSE_NEW_TIME',
  'POSTPONED',
  'REJECTED',
])

export const caseActorTypeEnum = pgEnum('case_actor_type', [
  'SYSTEM',
  'PATIENT',
  'ADMIN',
  'DOCTOR',
  'N8N',
])

export const consultationCases = pgTable(
  'consultation_cases',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    status: consultationStatusEnum('status').notNull().default('NEW'),
    // WhatsApp sender (wa_id, E.164) that opened the case. Used to find the
    // active case for an inbound message; may differ from patientPhone.
    whatsappPhone: text('whatsapp_phone'),
    // Patient — collected by the WhatsApp bot (name, phone) or by admin (rest)
    patientName: text('patient_name'),
    patientPhone: text('patient_phone'), // E.164
    age: integer('age'),
    sex: consultationSexEnum('sex'),
    consultationFor: consultationForEnum('consultation_for'),
    location: text('location'),
    mainComplaint: text('main_complaint'),
    medicalHistory: text('medical_history'),
    // Payment — manually verified by admin; never gateway-driven in V1
    paymentReceived: boolean('payment_received').notNull().default(false),
    paymentSource: consultationPaymentSourceEnum('payment_source'),
    paymentReference: text('payment_reference'),
    paymentAmount: integer('payment_amount'), // whole PKR (no floats for money)
    paymentConfirmedBy: uuid('payment_confirmed_by').references(() => users.id),
    paymentConfirmedAt: timestamp('payment_confirmed_at', { withTimezone: true }),
    // Doctor decision — fixed V1 doctor, no doctor selection
    proposedConsultationTime: timestamp('proposed_consultation_time', { withTimezone: true }),
    doctorDecision: doctorDecisionEnum('doctor_decision'),
    doctorApprovedTime: timestamp('doctor_approved_time', { withTimezone: true }),
    doctorDecisionAt: timestamp('doctor_decision_at', { withTimezone: true }),
    // Consultation
    consultationLink: text('consultation_link'),
    // Free-text operational notes by the admin (not sent to WhatsApp)
    adminNotes: text('admin_notes'),
    // Prescription — reuses the existing prescriptions table
    prescriptionId: uuid('prescription_id').references(() => prescriptions.id, {
      onDelete: 'restrict',
    }),
    prescriptionSentAt: timestamp('prescription_sent_at', { withTimezone: true }),
    // Cancellation (fast-query mirror; case_events stays the authoritative audit)
    cancelledAt: timestamp('cancelled_at', { withTimezone: true }),
    cancelledBy: uuid('cancelled_by').references(() => users.id),
    cancelledByRole: text('cancelled_by_role'), // ADMIN | DOCTOR
    cancellationReason: text('cancellation_reason'), // reason code (validated in app code)
    cancellationNote: text('cancellation_note'), // short note, only for reason OTHER
    cancelledFromStatus: consultationStatusEnum('cancelled_from_status'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    statusIdx: index('consultation_cases_status_idx').on(t.status),
    patientPhoneIdx: index('consultation_cases_patient_phone_idx').on(t.patientPhone),
    createdAtIdx: index('consultation_cases_created_at_idx').on(t.createdAt),
    // At most one open case per WhatsApp sender — makes concurrent first
    // messages from the same sender converge on one case.
    activeSenderUq: uniqueIndex('consultation_cases_active_sender_uq')
      .on(t.whatsappPhone)
      // CANCELLED cases always carry cancelled_at (see cancelledCheck)
      .where(sql`status <> 'COMPLETED' AND cancelled_at IS NULL AND whatsapp_phone IS NOT NULL`),
    prescriptionUq: uniqueIndex('consultation_cases_prescription_uq').on(t.prescriptionId),
    ageCheck: check('consultation_cases_age_check', sql`age IS NULL OR (age >= 0 AND age <= 130)`),
    // DB backstop for the CONFIRMED guard (see transitions.ts)
    confirmedGuardCheck: check(
      'consultation_cases_confirmed_guard_check',
      sql`status NOT IN ('CONFIRMED', 'IN_CONSULTATION', 'PRESCRIPTION_SENT', 'COMPLETED') OR (payment_received = true AND payment_confirmed_at IS NOT NULL AND payment_confirmed_by IS NOT NULL AND doctor_decision = 'APPROVED' AND doctor_approved_time IS NOT NULL)`,
    ),
    cancelledCheck: check(
      'consultation_cases_cancelled_check',
      sql`status::text <> 'CANCELLED' OR (cancelled_at IS NOT NULL AND cancellation_reason IS NOT NULL AND cancelled_from_status IS NOT NULL)`,
    ),
    amountCheck: check(
      'consultation_cases_payment_amount_check',
      sql`payment_amount IS NULL OR payment_amount >= 0`,
    ),
  }),
)

// Immutable audit history of the consultation lifecycle (append-only; a
// trigger in the migration rejects UPDATE/DELETE). NO secrets or PHI in
// metadata — identifiers and non-clinical facts only.
export const caseEvents = pgTable(
  'case_events',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    consultationId: uuid('consultation_id')
      .notNull()
      .references(() => consultationCases.id, { onDelete: 'restrict' }),
    // Flexible text (validated in app code) so new event types need no migration
    eventType: text('event_type').notNull(),
    oldStatus: consultationStatusEnum('old_status'),
    newStatus: consultationStatusEnum('new_status'),
    actorType: caseActorTypeEnum('actor_type').notNull(),
    actorId: text('actor_id'), // user id for ADMIN/DOCTOR, null/system id otherwise
    metadata: jsonb('metadata').$type<Record<string, unknown>>(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    consultationIdx: index('case_events_consultation_idx').on(t.consultationId, t.createdAt),
  }),
)

// Inbound WhatsApp idempotency ledger. The UNIQUE wamid constraint is the
// concurrency guard: the row is inserted in the same transaction as the
// message's processing, so a duplicate Meta delivery blocks on / conflicts
// with the first and is never processed twice.
export const whatsappEvents = pgTable('whatsapp_events', {
  id: uuid('id').primaryKey().defaultRandom(),
  wamid: text('wamid').notNull().unique('whatsapp_events_wamid_uq'),
  senderPhone: text('sender_phone').notNull(),
  eventType: text('event_type').notNull(), // Meta message type: text, image, ...
  consultationId: uuid('consultation_id').references(() => consultationCases.id, {
    onDelete: 'restrict',
  }),
  processedAt: timestamp('processed_at', { withTimezone: true }),
  // Inbound gate outcome: processed | ignored_disabled | ignored_not_allowed |
  // ignored_blocked | ignored_staff (see lib/etabib/inbound-policy.ts)
  disposition: text('disposition'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
})

// Sanitized operational errors reported by n8n workflows. Never raw payloads,
// tokens, credentials or clinical content.
export const integrationErrors = pgTable(
  'integration_errors',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    source: text('source').notNull().default('n8n'),
    workflowName: text('workflow_name').notNull(),
    workflowId: text('workflow_id'),
    node: text('node'),
    executionId: text('execution_id'),
    errorMessage: text('error_message'), // truncated + redacted
    occurredAt: timestamp('occurred_at', { withTimezone: true }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    // Retried error callbacks for the same execution/node are stored once
    executionNodeUq: uniqueIndex('integration_errors_execution_node_uq').on(
      t.source,
      t.executionId,
      t.node,
    ),
    occurredIdx: index('integration_errors_occurred_idx').on(t.occurredAt),
  }),
)

// ============================================================
// eTABIB V1 — P1 HARDENING
// ============================================================

export const whatsappSenderPurposeValues = ['PATIENT_TEST', 'STAFF', 'PILOT_PATIENT', 'BLOCKED'] as const
export const whatsappSenderPurposeEnum = pgEnum('whatsapp_sender_purpose', whatsappSenderPurposeValues)

// Inbound sender policy list. In `allowlist` mode only active PATIENT_TEST /
// PILOT_PATIENT numbers may start or continue a consultation; STAFF and
// BLOCKED numbers never enter the patient flow in any mode. Rows are soft-
// deactivated (active = false), never hard-deleted.
export const whatsappAllowedSenders = pgTable(
  'whatsapp_allowed_senders',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    phoneE164: text('phone_e164').notNull(),
    label: text('label').notNull(),
    purpose: whatsappSenderPurposeEnum('purpose').notNull(),
    active: boolean('active').notNull().default(true),
    notes: text('notes'),
    createdBy: uuid('created_by').references(() => users.id),
    updatedBy: uuid('updated_by').references(() => users.id),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    phoneUq: uniqueIndex('whatsapp_allowed_senders_phone_uq').on(t.phoneE164),
  }),
)

// Append-only audit of staff actions that are not tied to one consultation case
// (password changes/resets, allow-list changes). A trigger in the migration
// rejects UPDATE/DELETE. Never passwords, tokens or secrets in metadata.
export const staffAuditEvents = pgTable(
  'staff_audit_events',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    action: text('action').notNull(),
    actorType: text('actor_type').notNull(), // ADMIN | DOCTOR | SYSTEM | ANONYMOUS
    actorId: uuid('actor_id').references(() => users.id),
    targetType: text('target_type'),
    targetId: text('target_id'),
    metadata: jsonb('metadata').$type<Record<string, unknown>>(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    createdIdx: index('staff_audit_events_created_idx').on(t.createdAt),
  }),
)

// One-time staff password reset tokens. Only the SHA-256 of the token is stored.
export const passwordResetTokens = pgTable(
  'password_reset_tokens',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    tokenHash: text('token_hash').notNull(),
    createdBy: uuid('created_by').references(() => users.id),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    usedAt: timestamp('used_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    tokenUq: uniqueIndex('password_reset_tokens_hash_uq').on(t.tokenHash),
    userIdx: index('password_reset_tokens_user_idx').on(t.userId),
  }),
)

// Small operational key/value store (e.g. last Scheduler dispatch time).
// Non-secret, non-clinical values only.
export const etabibRuntimeStatus = pgTable('etabib_runtime_status', {
  key: text('key').primaryKey(),
  value: jsonb('value').$type<Record<string, unknown>>().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
})

// ============================================================
// eTABIB V1 — VIDEO CONSULTATION (Phase 6.6)
// One LiveKit room per consultation case. The session is created inside the
// transaction that moves the case to CONFIRMED (never before payment + doctor
// approval). The consultation case stays the clinical state machine; the
// session only tracks the video room's operational lifecycle.
// ============================================================

export const videoSessionStatusValues = ['CREATED', 'OPEN', 'IN_PROGRESS', 'ENDED', 'EXPIRED'] as const
export const videoSessionStatusEnum = pgEnum('video_session_status', videoSessionStatusValues)

export const consultationVideoSessions = pgTable(
  'consultation_video_sessions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    consultationId: uuid('consultation_id')
      .notNull()
      .references(() => consultationCases.id, { onDelete: 'restrict' }),
    // Random, opaque (no case id, name or phone); never accepted from clients
    roomName: text('room_name').notNull(),
    status: videoSessionStatusEnum('status').notNull().default('CREATED'),
    scheduledAt: timestamp('scheduled_at', { withTimezone: true }).notNull(),
    openedAt: timestamp('opened_at', { withTimezone: true }),
    startedAt: timestamp('started_at', { withTimezone: true }),
    endedAt: timestamp('ended_at', { withTimezone: true }),
    patientJoinedAt: timestamp('patient_joined_at', { withTimezone: true }),
    doctorJoinedAt: timestamp('doctor_joined_at', { withTimezone: true }),
    lastActivityAt: timestamp('last_activity_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    // One video session per consultation case; one case per room
    consultationUq: uniqueIndex('consultation_video_sessions_case_uq').on(t.consultationId),
    roomUq: uniqueIndex('consultation_video_sessions_room_uq').on(t.roomName),
  }),
)

// Public join links (patient). Only the SHA-256 of the token is stored; the raw
// token exists only in the outgoing WhatsApp message. Expiring + revocable.
export const consultationJoinTokens = pgTable(
  'consultation_join_tokens',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    sessionId: uuid('session_id')
      .notNull()
      .references(() => consultationVideoSessions.id, { onDelete: 'restrict' }),
    role: text('role').notNull().default('PATIENT'),
    tokenHash: text('token_hash').notNull(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    revokedAt: timestamp('revoked_at', { withTimezone: true }),
    lastUsedAt: timestamp('last_used_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    tokenUq: uniqueIndex('consultation_join_tokens_hash_uq').on(t.tokenHash),
    sessionIdx: index('consultation_join_tokens_session_idx').on(t.sessionId),
  }),
)
