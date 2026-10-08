import { pgTable, uuid, text, timestamp, integer, boolean, jsonb, pgEnum, index, uniqueIndex, primaryKey, check } from 'drizzle-orm/pg-core'
import { sql } from 'drizzle-orm'
import { users } from './identity'
import { consultationCases } from './etabib'
import { notificationOutbox } from './notification'

// ============================================================
// eTABIB V1 — SHARED WHATSAPP INBOX (feature flag ETABIB_INBOX_ENABLED)
// One conversation per WhatsApp contact (a number may book for several family
// members, so conversation ≠ patient ≠ case). Chat ownership (BOT/ADMIN/DOCTOR)
// is kept here and never encoded into the consultation status.
// ============================================================

export const conversationOwnerValues = ['BOT', 'ADMIN', 'DOCTOR'] as const
export const conversationOwnerEnum = pgEnum('wa_conversation_owner', conversationOwnerValues)

export const waConversations = pgTable(
  'wa_conversations',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    // WhatsApp contact (wa_id as E.164)
    contactPhone: text('contact_phone').notNull(),
    // WhatsApp profile name as sent by Meta (display only; not an identity)
    profileName: text('profile_name'),
    owner: conversationOwnerEnum('owner').notNull().default('BOT'),
    // Human owner (null for BOT, or ADMIN queue waiting to be claimed)
    ownerUserId: uuid('owner_user_id').references(() => users.id),
    // Incremented on every ownership change; stale screens/jobs are rejected
    ownerVersion: integer('owner_version').notNull().default(1),
    // Provider timestamp of the last patient message (Meta customer-service window)
    lastPatientMessageAt: timestamp('last_patient_message_at', { withTimezone: true }),
    lastMessageAt: timestamp('last_message_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    contactUq: uniqueIndex('wa_conversations_contact_uq').on(t.contactPhone),
    lastMessageIdx: index('wa_conversations_last_message_idx').on(t.lastMessageAt),
    ownerCheck: check('wa_conversations_owner_check', sql`owner <> 'DOCTOR' OR owner_user_id IS NOT NULL`),
  }),
)

export const waMessageDirectionEnum = pgEnum('wa_message_direction', ['IN', 'OUT'])
export const waSenderRoleEnum = pgEnum('wa_sender_role', ['PATIENT', 'BOT', 'SYSTEM', 'ADMIN', 'DOCTOR'])
// AUTO: linked to the contact's only open case; MANUAL: linked by staff;
// NEEDED: ambiguous — shown as "Case association needed", never guessed.
export const waCaseLinkEnum = pgEnum('wa_case_link', ['AUTO', 'MANUAL', 'NEEDED'])

export const waMessages = pgTable(
  'wa_messages',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    conversationId: uuid('conversation_id')
      .notNull()
      .references(() => waConversations.id, { onDelete: 'restrict' }),
    direction: waMessageDirectionEnum('direction').notNull(),
    senderRole: waSenderRoleEnum('sender_role').notNull(),
    senderUserId: uuid('sender_user_id').references(() => users.id),
    // text | image | document | audio | video | sticker | location | contacts | template | unsupported | ...
    kind: text('kind').notNull(),
    body: text('body'),
    // Inbound: Meta wamid. Outbound: the outbox job carries the provider id.
    providerMessageId: text('provider_message_id'),
    // Outbound staff commands: client-generated key (double tap / retry safe)
    clientRequestKey: text('client_request_key'),
    replyToProviderId: text('reply_to_provider_id'),
    // Outbound: delivery status lives on the outbox job (single source of truth)
    outboxJobId: uuid('outbox_job_id').references(() => notificationOutbox.id, { onDelete: 'restrict' }),
    // Outbound staff message: ownership version at send time (re-checked at dispatch)
    ownerVersion: integer('owner_version'),
    caseId: uuid('case_id').references(() => consultationCases.id, { onDelete: 'restrict' }),
    caseLink: waCaseLinkEnum('case_link').notNull().default('NEEDED'),
    // Local status for rows without an outbox job (received, imported, cancelled)
    localStatus: text('local_status'),
    // Imported from records that pre-date the inbox (no content was stored then)
    historical: boolean('historical').notNull().default(false),
    providerTimestamp: timestamp('provider_timestamp', { withTimezone: true }),
    // Meta business phone number id the message arrived on (inbound)
    businessPhoneNumberId: text('business_phone_number_id'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    conversationIdx: index('wa_messages_conversation_idx').on(t.conversationId, t.createdAt),
    providerUq: uniqueIndex('wa_messages_provider_uq').on(t.providerMessageId).where(sql`provider_message_id IS NOT NULL`),
    clientKeyUq: uniqueIndex('wa_messages_client_key_uq').on(t.clientRequestKey).where(sql`client_request_key IS NOT NULL`),
    outboxUq: uniqueIndex('wa_messages_outbox_uq').on(t.outboxJobId).where(sql`outbox_job_id IS NOT NULL`),
    caseIdx: index('wa_messages_case_idx').on(t.caseId),
  }),
)

export const waAttachmentFetchEnum = pgEnum('wa_attachment_fetch', ['PENDING', 'REQUESTED', 'STORED', 'FAILED', 'UNSUPPORTED'])

export const waAttachments = pgTable(
  'wa_attachments',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    conversationId: uuid('conversation_id')
      .notNull()
      .references(() => waConversations.id, { onDelete: 'restrict' }),
    messageId: uuid('message_id').references(() => waMessages.id, { onDelete: 'restrict' }),
    caseId: uuid('case_id').references(() => consultationCases.id, { onDelete: 'restrict' }),
    // PATIENT (WhatsApp inbound) | ADMIN | DOCTOR (staff upload / recording)
    source: text('source').notNull(),
    // Meta media id (inbound) — the temporary download URL is never stored
    providerMediaId: text('provider_media_id'),
    declaredMimeType: text('declared_mime_type'),
    mimeType: text('mime_type'),
    sizeBytes: integer('size_bytes'),
    sha256: text('sha256'),
    // Private storage key of the original (never public)
    storageKey: text('storage_key'),
    // Staff audio: WhatsApp voice rendition (OGG/Opus)
    deliveryKey: text('delivery_key'),
    durationMs: integer('duration_ms'),
    // Sanitized original filename (internal display only; never in URLs/logs)
    filename: text('filename'),
    fetchStatus: waAttachmentFetchEnum('fetch_status').notNull().default('PENDING'),
    fetchAttempts: integer('fetch_attempts').notNull().default(0),
    fetchError: text('fetch_error'),
    fetchRequestedAt: timestamp('fetch_requested_at', { withTimezone: true }),
    label: text('label'),
    flaggedAt: timestamp('flagged_at', { withTimezone: true }),
    flaggedBy: uuid('flagged_by').references(() => users.id),
    reviewedAt: timestamp('reviewed_at', { withTimezone: true }),
    reviewedBy: uuid('reviewed_by').references(() => users.id),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    conversationIdx: index('wa_attachments_conversation_idx').on(t.conversationId, t.createdAt),
    // One logical attachment per Meta media id
    mediaUq: uniqueIndex('wa_attachments_media_uq').on(t.providerMediaId).where(sql`provider_media_id IS NOT NULL`),
    fetchIdx: index('wa_attachments_fetch_idx').on(t.fetchStatus),
  }),
)

export const waHandoverStatusEnum = pgEnum('wa_handover_status', ['PENDING', 'ACCEPTED', 'DECLINED', 'CANCELLED'])

export const waHandoverRequests = pgTable(
  'wa_handover_requests',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    conversationId: uuid('conversation_id')
      .notNull()
      .references(() => waConversations.id, { onDelete: 'restrict' }),
    requestedBy: uuid('requested_by')
      .notNull()
      .references(() => users.id),
    toUserId: uuid('to_user_id')
      .notNull()
      .references(() => users.id),
    status: waHandoverStatusEnum('status').notNull().default('PENDING'),
    // Internal only — never sent to the patient
    summary: text('summary'),
    attachmentIds: jsonb('attachment_ids').$type<string[]>().notNull().default([]),
    resolvedBy: uuid('resolved_by').references(() => users.id),
    resolvedAt: timestamp('resolved_at', { withTimezone: true }),
    declineReason: text('decline_reason'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    onePendingUq: uniqueIndex('wa_handover_one_pending_uq').on(t.conversationId).where(sql`status = 'PENDING'`),
    toUserIdx: index('wa_handover_to_user_idx').on(t.toUserId, t.status),
  }),
)

// Internal staff notes — a separate table so a note can never enter the outbox.
export const waInternalNotes = pgTable(
  'wa_internal_notes',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    conversationId: uuid('conversation_id')
      .notNull()
      .references(() => waConversations.id, { onDelete: 'restrict' }),
    authorId: uuid('author_id')
      .notNull()
      .references(() => users.id),
    authorRole: text('author_role').notNull(), // ADMIN | DOCTOR
    body: text('body').notNull(),
    caseId: uuid('case_id').references(() => consultationCases.id, { onDelete: 'restrict' }),
    // SYSTEM-style notes for handover events (request summary, decline reason, …)
    kind: text('kind').notNull().default('NOTE'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    conversationIdx: index('wa_internal_notes_conversation_idx').on(t.conversationId, t.createdAt),
  }),
)

export const waConversationReads = pgTable(
  'wa_conversation_reads',
  {
    conversationId: uuid('conversation_id')
      .notNull()
      .references(() => waConversations.id, { onDelete: 'cascade' }),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    lastReadAt: timestamp('last_read_at', { withTimezone: true }).notNull(),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.conversationId, t.userId] }),
  }),
)
