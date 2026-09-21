import {
  pgTable,
  uuid,
  text,
  timestamp,
  boolean,
  date,
  pgEnum,
  index,
} from 'drizzle-orm/pg-core'
import { users } from './identity'

// ============================================================
// PATIENT & DEPENDANTS
// ============================================================

export const biologicalSexEnum = pgEnum('biological_sex', [
  'male',
  'female',
  'not_stated',
])

export const patients = pgTable(
  'patients',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    publicId: uuid('public_id').notNull().unique().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),
    // Minimum necessary identity
    givenName: text('given_name').notNull(),
    familyName: text('family_name'),
    dateOfBirth: date('date_of_birth'), // nullable — not always known
    biologicalSex: biologicalSexEnum('biological_sex').default('not_stated'),
    // Clinical — encrypted at rest
    allergiesSummary: text('allergies_summary'), // encrypted
    // NOT storing CNIC/Tazkira unless policy requires it
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    createdBy: uuid('created_by').references(() => users.id),
    updatedBy: uuid('updated_by').references(() => users.id),
  },
  (t) => ({
    userIdx: index('patients_user_idx').on(t.userId),
    publicIdx: index('patients_public_idx').on(t.publicId),
  }),
)

export const dependants = pgTable('dependants', {
  id: uuid('id').primaryKey().defaultRandom(),
  publicId: uuid('public_id').notNull().unique().defaultRandom(),
  guardianUserId: uuid('guardian_user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'restrict' }),
  givenName: text('given_name').notNull(),
  familyName: text('family_name'),
  dateOfBirth: date('date_of_birth'),
  biologicalSex: biologicalSexEnum('biological_sex').default('not_stated'),
  relationshipToGuardian: text('relationship_to_guardian').notNull(), // child, spouse, parent, other
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
})

export const guardianConsents = pgTable('guardian_consents', {
  id: uuid('id').primaryKey().defaultRandom(),
  guardianUserId: uuid('guardian_user_id')
    .notNull()
    .references(() => users.id),
  dependantId: uuid('dependant_id')
    .notNull()
    .references(() => dependants.id),
  consentText: text('consent_text').notNull(), // versioned consent text shown
  consentVersion: text('consent_version').notNull(),
  consentedAt: timestamp('consented_at', { withTimezone: true }).notNull().defaultNow(),
  ipAddress: text('ip_address'),
})
