import {
  pgTable,
  uuid,
  text,
  timestamp,
  boolean,
} from 'drizzle-orm/pg-core'

// ============================================================
// ORGANIZATION
// ============================================================

export const organizations = pgTable('organizations', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull().default('Kozhak Specialist Clinic'),
  nameUrdu: text('name_urdu').default('کوژک اسپیشلسٹ کلینک'),
  namePashto: text('name_pashto'),
  address: text('address'),
  addressUrdu: text('address_urdu'),
  whatsappNumber: text('whatsapp_number'),
  landlineNumber: text('landline_number'),
  website: text('website'),
  isActive: boolean('is_active').notNull().default(true),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
})
