import {
  pgTable,
  uuid,
  text,
  timestamp,
  boolean,
  integer,
  pgEnum,
  index,
  real,
  date,
} from 'drizzle-orm/pg-core'
import { users } from './identity'
import { patients } from './patient'
import { appointments } from './booking'
import { encounters } from './clinical'
import { practitioners } from './practitioner'

// ============================================================
// VITALS
// ============================================================

export const vitalSourceEnum = pgEnum('vital_source', [
  'patient_reported',
  'clinician_observed',
  'clinic_device',
])

export const vitals = pgTable(
  'vitals',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    patientId: uuid('patient_id')
      .notNull()
      .references(() => patients.id, { onDelete: 'restrict' }),
    appointmentId: uuid('appointment_id')
      .references(() => appointments.id),
    encounterId: uuid('encounter_id')
      .references(() => encounters.id),
    // Measurements
    systolicBp: integer('systolic_bp'),
    diastolicBp: integer('diastolic_bp'),
    heartRate: integer('heart_rate'),
    respiratoryRate: integer('respiratory_rate'),
    temperatureCelsius: real('temperature_celsius'),
    oxygenSaturation: real('oxygen_saturation'),
    weightKg: real('weight_kg'),
    heightCm: real('height_cm'),
    bmi: real('bmi'), // calculated
    bloodGlucose: real('blood_glucose_mg_dl'),
    // Metadata
    source: vitalSourceEnum('source').notNull().default('patient_reported'),
    notes: text('notes'),
    takenAt: timestamp('taken_at', { withTimezone: true }).notNull().defaultNow(),
    recordedBy: uuid('recorded_by').references(() => users.id),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    patientIdx: index('vitals_patient_idx').on(t.patientId),
    appointmentIdx: index('vitals_appointment_idx').on(t.appointmentId),
    takenAtIdx: index('vitals_taken_at_idx').on(t.takenAt),
  }),
)

// ============================================================
// PATIENT ALLERGIES (structured)
// ============================================================

export const allergySeverityEnum = pgEnum('allergy_severity', [
  'mild',
  'moderate',
  'severe',
  'anaphylaxis',
])

export const allergyTypeEnum = pgEnum('allergy_type', [
  'drug',
  'food',
  'environmental',
  'other',
])

export const patientAllergies = pgTable(
  'patient_allergies',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    patientId: uuid('patient_id')
      .notNull()
      .references(() => patients.id, { onDelete: 'restrict' }),
    allergen: text('allergen').notNull(),
    type: allergyTypeEnum('type').notNull().default('other'),
    severity: allergySeverityEnum('severity'),
    reaction: text('reaction'),
    onsetDate: date('onset_date'),
    isVerified: boolean('is_verified').notNull().default(false),
    verifiedBy: uuid('verified_by').references(() => users.id),
    isActive: boolean('is_active').notNull().default(true),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    createdBy: uuid('created_by').references(() => users.id),
  },
  (t) => ({
    patientIdx: index('allergies_patient_idx').on(t.patientId),
  }),
)

// ============================================================
// PATIENT MEDICAL HISTORY
// ============================================================

export const conditionStatusEnum = pgEnum('condition_status', [
  'active',
  'resolved',
  'recurrent',
  'chronic',
])

export const patientConditions = pgTable(
  'patient_conditions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    patientId: uuid('patient_id')
      .notNull()
      .references(() => patients.id, { onDelete: 'restrict' }),
    conditionName: text('condition_name').notNull(),
    icdCode: text('icd_code'), // ICD-10
    diagnosisDate: date('diagnosis_date'),
    status: conditionStatusEnum('status').notNull().default('active'),
    notes: text('notes'), // encrypted
    recordedBy: uuid('recorded_by').references(() => users.id),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    patientIdx: index('conditions_patient_idx').on(t.patientId),
  }),
)

// ============================================================
// PATIENT SURGICAL HISTORY
// ============================================================

export const patientSurgeries = pgTable(
  'patient_surgeries',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    patientId: uuid('patient_id')
      .notNull()
      .references(() => patients.id, { onDelete: 'restrict' }),
    procedureName: text('procedure_name').notNull(),
    surgeryDate: date('surgery_date'),
    hospital: text('hospital'),
    notes: text('notes'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    createdBy: uuid('created_by').references(() => users.id),
  },
  (t) => ({
    patientIdx: index('surgeries_patient_idx').on(t.patientId),
  }),
)

// ============================================================
// PATIENT CURRENT MEDICATIONS
// ============================================================

export const patientMedications = pgTable(
  'patient_medications',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    patientId: uuid('patient_id')
      .notNull()
      .references(() => patients.id, { onDelete: 'restrict' }),
    medicationName: text('medication_name').notNull(),
    strength: text('strength'),
    frequency: text('frequency'),
    route: text('route'),
    startDate: date('start_date'),
    endDate: date('end_date'),
    prescribedBy: text('prescribed_by'), // free text (may be external doctor)
    isActive: boolean('is_active').notNull().default(true),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    createdBy: uuid('created_by').references(() => users.id),
  },
  (t) => ({
    patientIdx: index('medications_patient_idx').on(t.patientId),
  }),
)

// ============================================================
// PATIENT FAMILY HISTORY
// ============================================================

export const patientFamilyHistory = pgTable(
  'patient_family_history',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    patientId: uuid('patient_id')
      .notNull()
      .references(() => patients.id, { onDelete: 'restrict' }),
    relationship: text('relationship').notNull(), // father, mother, sibling, etc.
    condition: text('condition').notNull(),
    ageAtOnset: integer('age_at_onset'),
    notes: text('notes'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    createdBy: uuid('created_by').references(() => users.id),
  },
  (t) => ({
    patientIdx: index('family_history_patient_idx').on(t.patientId),
  }),
)

// ============================================================
// ENCOUNTER DIAGNOSES (structured)
// ============================================================

export const diagnosisTypeEnum = pgEnum('diagnosis_type', [
  'primary',
  'secondary',
  'differential',
])

export const diagnosisCertaintyEnum = pgEnum('diagnosis_certainty', [
  'suspected',
  'confirmed',
])

export const encounterDiagnoses = pgTable(
  'encounter_diagnoses',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    encounterId: uuid('encounter_id')
      .notNull()
      .references(() => encounters.id, { onDelete: 'restrict' }),
    diagnosisName: text('diagnosis_name').notNull(),
    icdCode: text('icd_code'),
    type: diagnosisTypeEnum('type').notNull().default('primary'),
    certainty: diagnosisCertaintyEnum('certainty').notNull().default('suspected'),
    notes: text('notes'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    encounterIdx: index('diagnoses_encounter_idx').on(t.encounterId),
  }),
)

// ============================================================
// CONSULTATION NOTES (auto-save drafts)
// ============================================================

export const consultationNotes = pgTable(
  'consultation_notes',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    encounterId: uuid('encounter_id')
      .notNull()
      .references(() => encounters.id, { onDelete: 'restrict' }),
    practitionerId: uuid('practitioner_id')
      .notNull()
      .references(() => practitioners.id),
    // Structured fields for auto-save
    chiefComplaint: text('chief_complaint'),
    historyOfPresentIllness: text('history_of_present_illness'),
    pastHistory: text('past_history'),
    currentMedications: text('current_medications'),
    examination: text('examination'),
    assessment: text('assessment'),
    plan: text('plan'),
    investigationsAdvised: text('investigations_advised'),
    clinicalAdvice: text('clinical_advice'),
    privateNotes: text('private_notes'), // NOT shown to patient
    followUpInstructions: text('follow_up_instructions'),
    // Auto-save support
    isDraft: boolean('is_draft').notNull().default(true),
    lastSavedAt: timestamp('last_saved_at', { withTimezone: true }).notNull().defaultNow(),
    version: integer('version').notNull().default(1),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    encounterIdx: index('notes_encounter_idx').on(t.encounterId),
    practIdx: index('notes_practitioner_idx').on(t.practitionerId),
  }),
)

// ============================================================
// INVESTIGATION ORDERS
// ============================================================

export const investigationCategoryEnum = pgEnum('investigation_category', [
  'hematology',
  'biochemistry',
  'radiology',
  'pathology',
  'microbiology',
  'immunology',
  'endocrinology',
  'cardiology',
  'other',
])

export const investigationStatusEnum = pgEnum('investigation_status', [
  'ordered',
  'sample_collected',
  'processing',
  'resulted',
  'reviewed',
  'cancelled',
])

export const investigationUrgencyEnum = pgEnum('investigation_urgency', [
  'routine',
  'urgent',
  'stat',
])

export const investigationOrders = pgTable(
  'investigation_orders',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    publicId: uuid('public_id').notNull().unique().defaultRandom(),
    encounterId: uuid('encounter_id')
      .notNull()
      .references(() => encounters.id, { onDelete: 'restrict' }),
    patientId: uuid('patient_id')
      .notNull()
      .references(() => patients.id),
    practitionerId: uuid('practitioner_id')
      .notNull()
      .references(() => practitioners.id),
    testName: text('test_name').notNull(),
    testCode: text('test_code'), // LOINC where available
    category: investigationCategoryEnum('category').notNull().default('other'),
    urgency: investigationUrgencyEnum('urgency').notNull().default('routine'),
    clinicalIndication: text('clinical_indication'),
    specialInstructions: text('special_instructions'),
    status: investigationStatusEnum('status').notNull().default('ordered'),
    resultSummary: text('result_summary'),
    resultUploadId: uuid('result_upload_id'), // references uploads table
    reviewedBy: uuid('reviewed_by').references(() => users.id),
    reviewedAt: timestamp('reviewed_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    encounterIdx: index('investigations_encounter_idx').on(t.encounterId),
    patientIdx: index('investigations_patient_idx').on(t.patientId),
    statusIdx: index('investigations_status_idx').on(t.status),
  }),
)

// ============================================================
// FOLLOW-UPS
// ============================================================

export const followupStatusEnum = pgEnum('followup_status', [
  'pending',
  'booked',
  'completed',
  'missed',
  'overdue',
  'cancelled',
])

export const followupTypeEnum = pgEnum('followup_type', [
  'routine_check',
  'lab_review',
  'medication_adjustment',
  'post_procedure',
  'chronic_monitoring',
  'other',
])

export const followups = pgTable(
  'followups',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    encounterId: uuid('encounter_id')
      .notNull()
      .references(() => encounters.id, { onDelete: 'restrict' }),
    patientUserId: uuid('patient_user_id')
      .notNull()
      .references(() => users.id),
    practitionerId: uuid('practitioner_id')
      .notNull()
      .references(() => practitioners.id),
    dueDate: date('due_date').notNull(),
    type: followupTypeEnum('type').notNull().default('routine_check'),
    status: followupStatusEnum('status').notNull().default('pending'),
    reason: text('reason'),
    instructions: text('instructions'),
    // Link to booked appointment if patient books followup
    appointmentId: uuid('appointment_id')
      .references(() => appointments.id),
    // Reminders
    reminderSentAt: timestamp('reminder_sent_at', { withTimezone: true }),
    autoReminderDaysBefore: integer('auto_reminder_days_before').notNull().default(3),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    patientIdx: index('followups_patient_idx').on(t.patientUserId),
    practIdx: index('followups_practitioner_idx').on(t.practitionerId),
    dueDateIdx: index('followups_due_date_idx').on(t.dueDate),
    statusIdx: index('followups_status_idx').on(t.status),
  }),
)

// ============================================================
// SPECIALTIES (master table)
// ============================================================

export const specialties = pgTable('specialties', {
  id: uuid('id').primaryKey().defaultRandom(),
  code: text('code').notNull().unique(), // e.g. 'internal_medicine'
  nameEn: text('name_en').notNull(),
  nameUrdu: text('name_urdu'),
  namePashto: text('name_pashto'),
  iconKey: text('icon_key'),
  sortOrder: integer('sort_order').notNull().default(0),
  isActive: boolean('is_active').notNull().default(true),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
})

// Junction: doctor ↔ specialty (many-to-many)
export const practitionerSpecialties = pgTable(
  'practitioner_specialties',
  {
    practitionerId: uuid('practitioner_id')
      .notNull()
      .references(() => practitioners.id, { onDelete: 'cascade' }),
    specialtyId: uuid('specialty_id')
      .notNull()
      .references(() => specialties.id, { onDelete: 'cascade' }),
    isPrimary: boolean('is_primary').notNull().default(false),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    practIdx: index('pract_specialties_pract_idx').on(t.practitionerId),
    specIdx: index('pract_specialties_spec_idx').on(t.specialtyId),
  }),
)

// ============================================================
// PATIENT EMERGENCY CONTACTS
// ============================================================

export const patientEmergencyContacts = pgTable(
  'patient_emergency_contacts',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    patientId: uuid('patient_id')
      .notNull()
      .references(() => patients.id, { onDelete: 'cascade' }),
    contactName: text('contact_name').notNull(),
    relationship: text('relationship').notNull(),
    phoneE164: text('phone_e164').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    patientIdx: index('emergency_contacts_patient_idx').on(t.patientId),
  }),
)

// ============================================================
// IN-APP NOTIFICATIONS
// ============================================================

export const inAppNotifications = pgTable(
  'in_app_notifications',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    title: text('title').notNull(),
    body: text('body').notNull(),
    type: text('type').notNull(), // e.g. 'appointment', 'prescription', 'followup'
    actionUrl: text('action_url'),
    isRead: boolean('is_read').notNull().default(false),
    readAt: timestamp('read_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    userIdx: index('in_app_notif_user_idx').on(t.userId),
    unreadIdx: index('in_app_notif_unread_idx').on(t.userId, t.isRead),
  }),
)

// ============================================================
// VIDEO SESSION METRICS
// ============================================================

export const videoSessionMetrics = pgTable(
  'video_session_metrics',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    roomId: uuid('room_id').notNull(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id),
    joinedAt: timestamp('joined_at', { withTimezone: true }),
    leftAt: timestamp('left_at', { withTimezone: true }),
    durationSeconds: integer('duration_seconds'),
    avgBitrateKbps: integer('avg_bitrate_kbps'),
    disconnectCount: integer('disconnect_count').notNull().default(0),
    qualityScore: real('quality_score'), // 0-5
    userAgent: text('user_agent'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    roomIdx: index('video_metrics_room_idx').on(t.roomId),
    userIdx: index('video_metrics_user_idx').on(t.userId),
  }),
)
