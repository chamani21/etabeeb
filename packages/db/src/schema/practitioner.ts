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
} from 'drizzle-orm/pg-core'
import { users } from './identity'

// ============================================================
// PRACTITIONERS (DOCTORS)
// ============================================================

export const credentialStatusEnum = pgEnum('credential_status', [
  'pending_review',
  'verified',
  'suspended',
  'rejected',
])

export const practitioners = pgTable(
  'practitioners',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    publicId: uuid('public_id').notNull().unique().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),
    // Verified display data (admin must verify before publishing)
    displayName: text('display_name').notNull(), // e.g. Dr Jalaluddin
    displayNameUrdu: text('display_name_urdu'), // e.g. ڈاکٹر جلال الدین
    displayNamePashto: text('display_name_pashto'), // e.g. ډاکټر جلال الدین
    specialty: text('specialty').notNull(), // e.g. General/Internal Medicine
    specialtyUrdu: text('specialty_urdu'),
    specialtyPashto: text('specialty_pashto'),
    qualifications: text('qualifications').notNull(), // e.g. MBBS, FCPS — as verified
    licenceNumber: text('licence_number'), // PMDC/AFMC number
    licenceJurisdiction: text('licence_jurisdiction'), // Pakistan | Afghanistan
    telemedicineEligible: boolean('telemedicine_eligible').notNull().default(false),
    // Profile
    photoKey: text('photo_key'), // storage key (never public URL directly)
    bio: text('bio'),
    consultationFeeDefaultPkr: integer('consultation_fee_default_pkr'),
    // Publishing
    isPublished: boolean('is_published').notNull().default(false), // admin must explicitly set true
    publishedAt: timestamp('published_at', { withTimezone: true }),
    publishedBy: uuid('published_by').references(() => users.id),
    // Status
    credentialStatus: credentialStatusEnum('credential_status').notNull().default('pending_review'),
    credentialVerifiedAt: timestamp('credential_verified_at', { withTimezone: true }),
    credentialVerifiedBy: uuid('credential_verified_by').references(() => users.id),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    createdBy: uuid('created_by').references(() => users.id),
    updatedBy: uuid('updated_by').references(() => users.id),
  },
  (t) => ({
    userIdx: index('practitioners_user_idx').on(t.userId),
    publicIdx: index('practitioners_public_idx').on(t.publicId),
  }),
)

export const availabilityRules = pgTable('availability_rules', {
  id: uuid('id').primaryKey().defaultRandom(),
  practitionerId: uuid('practitioner_id')
    .notNull()
    .references(() => practitioners.id, { onDelete: 'cascade' }),
  // Recurrence
  dayOfWeek: integer('day_of_week'), // 0=Sun..6=Sat; null = one-off
  startDate: timestamp('start_date', { withTimezone: true }),
  endDate: timestamp('end_date', { withTimezone: true }),
  // Times stored as HH:MM in the practitioner's timezone
  slotStartTime: text('slot_start_time').notNull(), // e.g. "09:00"
  slotEndTime: text('slot_end_time').notNull(), // e.g. "13:00"
  slotDurationMinutes: integer('slot_duration_minutes').notNull().default(20),
  bufferMinutes: integer('buffer_minutes').notNull().default(5),
  timezone: text('timezone').notNull().default('Asia/Karachi'),
  consultationType: text('consultation_type').notNull().default('video'), // video | audio | chat
  isActive: boolean('is_active').notNull().default(true),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
})

export const availabilityExceptions = pgTable('availability_exceptions', {
  id: uuid('id').primaryKey().defaultRandom(),
  practitionerId: uuid('practitioner_id')
    .notNull()
    .references(() => practitioners.id, { onDelete: 'cascade' }),
  exceptionDate: timestamp('exception_date', { withTimezone: true }).notNull(),
  reason: text('reason'), // holiday, leave, emergency
  isAvailable: boolean('is_available').notNull().default(false), // false = blocked, true = override available
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
})
