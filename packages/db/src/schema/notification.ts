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

// ============================================================
// NOTIFICATIONS & WHATSAPP OUTBOX
// ============================================================

export const notificationChannelEnum = pgEnum('notification_channel', [
  'whatsapp',
  'email',
  'sms',
  'in_app',
])

export const notificationStatusEnum = pgEnum('notification_status', [
  'pending',
  'processing',
  'sent',
  'delivered',
  'read',
  'failed',
  'dead_lettered',
  'opted_out',
])

// Transactional outbox — committed in same transaction as domain event
export const notificationOutbox = pgTable(
  'notification_outbox',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    idempotencyKey: text('idempotency_key').notNull().unique(), // prevents duplicate sends
    channel: notificationChannelEnum('channel').notNull(),
    recipientUserId: uuid('recipient_user_id').references(() => users.id),
    recipientPhone: text('recipient_phone'), // E.164
    recipientEmail: text('recipient_email'),
    templateKey: text('template_key').notNull(), // e.g. booking_confirmed
    locale: text('locale').notNull().default('ps'),
    // Variables for template (NO PHI in plain text — use secure portal links)
    templateVariables: text('template_variables'), // JSON, encrypted if sensitive
    // Processing
    status: notificationStatusEnum('status').notNull().default('pending'),
    attempts: integer('attempts').notNull().default(0),
    maxAttempts: integer('max_attempts').notNull().default(5),
    nextRetryAt: timestamp('next_retry_at', { withTimezone: true }),
    lastError: text('last_error'),
    processedAt: timestamp('processed_at', { withTimezone: true }),
    deadLetteredAt: timestamp('dead_lettered_at', { withTimezone: true }),
    // Provider response
    providerMessageId: text('provider_message_id'),
    deliveredAt: timestamp('delivered_at', { withTimezone: true }),
    readAt: timestamp('read_at', { withTimezone: true }),
    // Opt-out tracking
    optedOutAt: timestamp('opted_out_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    statusIdx: index('outbox_status_idx').on(t.status),
    retryIdx: index('outbox_retry_idx').on(t.nextRetryAt),
    idempotencyIdx: index('outbox_idempotency_idx').on(t.idempotencyKey),
  }),
)

export const consentPreferences = pgTable('consent_preferences', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  channel: notificationChannelEnum('channel').notNull(),
  optedIn: boolean('opted_in').notNull().default(true),
  optInSource: text('opt_in_source'), // booking_flow | manual
  optInAt: timestamp('opt_in_at', { withTimezone: true }),
  optOutAt: timestamp('opt_out_at', { withTimezone: true }),
  optOutReason: text('opt_out_reason'),
})
