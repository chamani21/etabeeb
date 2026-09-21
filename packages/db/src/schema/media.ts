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
// CONSULTATION ROOMS & MEDIA
// ============================================================

export const roomStatusEnum = pgEnum('room_status', [
  'waiting',
  'active',
  'ended',
  'failed',
])

export const consultationRooms = pgTable('consultation_rooms', {
  id: uuid('id').primaryKey().defaultRandom(),
  appointmentId: uuid('appointment_id')
    .notNull()
    .unique()
    .references(() => appointments.id, { onDelete: 'restrict' }),
  // LiveKit room name — opaque, never contains PHI
  livekitRoomName: text('livekit_room_name').notNull().unique(),
  status: roomStatusEnum('status').notNull().default('waiting'),
  startedAt: timestamp('started_at', { withTimezone: true }),
  endedAt: timestamp('ended_at', { withTimezone: true }),
  // Recording: OFF by default. LEGAL-GATE before enabling.
  recordingEnabled: boolean('recording_enabled').notNull().default(false),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
})

export const roomParticipants = pgTable('room_participants', {
  id: uuid('id').primaryKey().defaultRandom(),
  roomId: uuid('room_id')
    .notNull()
    .references(() => consultationRooms.id, { onDelete: 'restrict' }),
  userId: uuid('user_id')
    .notNull()
    .references(() => users.id),
  role: text('role').notNull(), // patient | practitioner | support
  joinedAt: timestamp('joined_at', { withTimezone: true }),
  leftAt: timestamp('left_at', { withTimezone: true }),
  fallbackCallInitiated: boolean('fallback_call_initiated').notNull().default(false),
})

// ============================================================
// UPLOADS & DOCUMENTS
// ============================================================

export const uploadStatusEnum = pgEnum('upload_status', [
  'pending',
  'scanning',
  'quarantined',
  'clean',
  'failed',
])

export const uploads = pgTable(
  'uploads',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    publicId: uuid('public_id').notNull().unique().defaultRandom(),
    uploadedBy: uuid('uploaded_by')
      .notNull()
      .references(() => users.id),
    appointmentId: uuid('appointment_id').references(() => appointments.id),
    // Storage — private key, never expose directly
    storageKey: text('storage_key').notNull().unique(),
    originalFilename: text('original_filename').notNull(), // sanitized
    mimeType: text('mime_type').notNull(),
    sizeBytes: integer('size_bytes').notNull(),
    checksum: text('checksum').notNull(), // SHA-256
    // Malware scanning
    scanStatus: uploadStatusEnum('scan_status').notNull().default('pending'),
    scanResult: text('scan_result'),
    scannedAt: timestamp('scanned_at', { withTimezone: true }),
    // Access control
    deletedAt: timestamp('deleted_at', { withTimezone: true }), // soft delete
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    uploaderIdx: index('uploads_uploader_idx').on(t.uploadedBy),
    statusIdx: index('uploads_status_idx').on(t.scanStatus),
    apptIdx: index('uploads_appt_idx').on(t.appointmentId),
  }),
)
