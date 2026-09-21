import {
  pgTable,
  uuid,
  text,
  timestamp,
  pgEnum,
  index,
} from 'drizzle-orm/pg-core'
import { users } from './identity'

// ============================================================
// AUDIT & SECURITY EVENTS (append-only — no UPDATE or DELETE)
// ============================================================

export const auditActionEnum = pgEnum('audit_action', [
  'login', 'logout', 'session_revoked',
  'otp_requested', 'otp_verified', 'otp_failed',
  'mfa_enrolled', 'mfa_verified', 'mfa_failed',
  'appointment_created', 'appointment_status_changed', 'appointment_cancelled',
  'intake_submitted', 'red_flag_triggered',
  'encounter_created', 'encounter_signed', 'encounter_addendum',
  'prescription_created', 'prescription_signed', 'prescription_revoked',
  'document_uploaded', 'document_downloaded', 'document_scanned',
  'payment_created', 'payment_verified', 'payment_bypassed', 'refund_issued',
  'whatsapp_sent', 'whatsapp_failed', 'whatsapp_opted_out',
  'practitioner_published', 'practitioner_unpublished',
  'role_granted', 'role_revoked',
  'admin_action',
  'security_event',
  'data_access', // staff accessed patient record
  'integration_replay',
])

export const auditEvents = pgTable(
  'audit_events',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    action: auditActionEnum('action').notNull(),
    actorId: uuid('actor_id').references(() => users.id),
    actorRole: text('actor_role'),
    targetType: text('target_type'), // appointment | encounter | prescription | user...
    targetId: uuid('target_id'),
    // Context — NO PHI in this table
    ipAddress: text('ip_address'),
    userAgent: text('user_agent'),
    traceId: text('trace_id'),
    outcome: text('outcome').notNull().default('success'), // success | failure | partial
    notes: text('notes'), // non-clinical context only
    occurredAt: timestamp('occurred_at', { withTimezone: true }).notNull().defaultNow(),
    // NOTE: This table is append-only.
    // Enforce via PostgreSQL ROW SECURITY POLICY or trigger that blocks UPDATE/DELETE.
  },
  (t) => ({
    actorIdx: index('audit_actor_idx').on(t.actorId),
    actionIdx: index('audit_action_idx').on(t.action),
    targetIdx: index('audit_target_idx').on(t.targetType, t.targetId),
    timeIdx: index('audit_time_idx').on(t.occurredAt),
  }),
)
