import {
  pgTable,
  uuid,
  text,
  timestamp,
  boolean,
  pgEnum,
  unique,
  index,
} from 'drizzle-orm/pg-core'
import { relations } from 'drizzle-orm'

// ============================================================
// IDENTITY & ACCESS CONTROL
// ============================================================

export const userRoleEnum = pgEnum('user_role', [
  'patient',
  'guardian',
  'practitioner',
  'support',
  'scheduler',
  'finance',
  'partner',
  'clinical_auditor',
  'administrator',
])

export const users = pgTable(
  'users',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    // Stable opaque public ID (exposed in URLs/APIs)
    publicId: uuid('public_id').notNull().unique().defaultRandom(),
    phoneE164: text('phone_e164').notNull().unique(), // +92... or +93... normalized
    phoneVerifiedAt: timestamp('phone_verified_at', { withTimezone: true }),
    email: text('email').unique(),
    emailVerifiedAt: timestamp('email_verified_at', { withTimezone: true }),
    displayName: text('display_name'),
    preferredLocale: text('preferred_locale').default('ps'),
    preferredTimezone: text('preferred_timezone').default('Asia/Kabul'),
    isActive: boolean('is_active').notNull().default(true),
    deletedAt: timestamp('deleted_at', { withTimezone: true }), // soft delete
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    phoneIdx: index('users_phone_idx').on(t.phoneE164),
    publicIdIdx: index('users_public_id_idx').on(t.publicId),
  }),
)

export const roles = pgTable('roles', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: userRoleEnum('name').notNull().unique(),
  description: text('description'),
})

export const userRoles = pgTable(
  'user_roles',
  {
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    roleId: uuid('role_id')
      .notNull()
      .references(() => roles.id, { onDelete: 'cascade' }),
    grantedBy: uuid('granted_by').references(() => users.id),
    grantedAt: timestamp('granted_at', { withTimezone: true }).notNull().defaultNow(),
    revokedAt: timestamp('revoked_at', { withTimezone: true }),
  },
  (t) => ({
    pk: unique('user_roles_pk').on(t.userId, t.roleId),
  }),
)

export const sessions = pgTable(
  'sessions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    tokenHash: text('token_hash').notNull().unique(), // SHA-256 of JWT jti
    deviceInfo: text('device_info'), // e.g. "iPhone 15, Safari 17"
    ipAddress: text('ip_address'),
    userAgent: text('user_agent'),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    revokedAt: timestamp('revoked_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    userIdx: index('sessions_user_idx').on(t.userId),
    tokenIdx: index('sessions_token_idx').on(t.tokenHash),
  }),
)

export const mfaFactors = pgTable('mfa_factors', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  type: text('type').notNull().default('totp'), // totp | sms
  secret: text('secret').notNull(), // encrypted
  isVerified: boolean('is_verified').notNull().default(false),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
})

export const otpRequests = pgTable(
  'otp_requests',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    phoneE164: text('phone_e164').notNull(),
    otpHash: text('otp_hash').notNull(), // bcrypt hash
    purpose: text('purpose').notNull().default('login'), // login | verify | step_up
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    attempts: text('attempts').notNull().default('0'),
    usedAt: timestamp('used_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    phoneIdx: index('otp_phone_idx').on(t.phoneE164),
  }),
)
