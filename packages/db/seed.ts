/**
 * eTabeeb Database Seed Script
 * Creates test accounts: admin, doctor, patient
 * 
 * Run: npx tsx packages/db/seed.ts
 */

import { drizzle } from 'drizzle-orm/postgres-js'
import postgres from 'postgres'
import { hash } from 'bcryptjs'
import * as schema from './src/schema'

const DATABASE_URL = process.env.DATABASE_URL

if (!DATABASE_URL) {
  console.error('DATABASE_URL environment variable is required')
  process.exit(1)
}

const pool = postgres(DATABASE_URL, { max: 1 })
const db = drizzle(pool, { schema })

async function seed() {
  console.log('🌱 Seeding eTabeeb database...\n')

  const passwordHash = await hash('etabeeb123', 12)

  // ============================================================
  // 1. Create roles
  // ============================================================
  console.log('📋 Creating roles...')
  const roleNames: Array<typeof schema.userRoleEnum.enumValues[number]> = [
    'patient', 'guardian', 'practitioner', 'support',
    'scheduler', 'finance', 'partner', 'clinical_auditor', 'administrator',
  ]

  const roleRecords = []
  for (const name of roleNames) {
    const [role] = await db
      .insert(schema.roles)
      .values({ name })
      .onConflictDoNothing()
      .returning()
    if (role) roleRecords.push(role)
  }
  console.log(`  ✅ ${roleRecords.length} roles created\n`)

  // Helper to find role by name
  const { eq } = await import('drizzle-orm')
  const findRole = async (name: string) => {
    const [role] = await db
      .select()
      .from(schema.roles)
      .where(eq(schema.roles.name, name as any))
      .limit(1)
    return role
  }

  // ============================================================
  // 2. Create organization
  // ============================================================
  console.log('🏥 Creating organization...')
  await db.insert(schema.organizations).values({
    name: 'Kozhak Specialist Clinic',
    nameUrdu: 'کوژک اسپیشلسٹ کلینک',
    address: 'College Road, Opposite Degree College, Chaman',
    addressUrdu: 'کالج روڈ، ڈگری کالج کے سامنے، چمن',
    whatsappNumber: '+923332357055',
    landlineNumber: '+920826613154',
    website: 'kozhakclinic.com',
  }).onConflictDoNothing()
  console.log('  ✅ Organization created\n')

  // ============================================================
  // 3. Create Admin user
  // ============================================================
  console.log('👤 Creating admin user...')
  const [adminUser] = await db
    .insert(schema.users)
    .values({
      phoneE164: '+920000000001',
      email: 'admin@etabeeb.online',
      displayName: 'Admin',
      passwordHash,
      preferredLocale: 'en',
      preferredTimezone: 'Asia/Karachi',
    })
    .onConflictDoNothing()
    .returning()

  if (adminUser) {
    const adminRole = await findRole('administrator')
    if (adminRole) {
      await db.insert(schema.userRoles).values({
        userId: adminUser.id,
        roleId: adminRole.id,
      }).onConflictDoNothing()
    }
    console.log(`  ✅ Admin: phone=+920000000001, password=etabeeb123\n`)
  }

  // ============================================================
  // 4. Create Test Doctor (Dr. Jalaluddin)
  // ============================================================
  console.log('🩺 Creating test doctor...')
  const [doctorUser] = await db
    .insert(schema.users)
    .values({
      phoneE164: '+923332357055',
      email: 'dr.jalaluddin@etabeeb.online',
      displayName: 'Dr. Jalaluddin',
      passwordHash,
      preferredLocale: 'ps',
      preferredTimezone: 'Asia/Karachi',
    })
    .onConflictDoNothing()
    .returning()

  if (doctorUser) {
    const practRole = await findRole('practitioner')
    if (practRole) {
      await db.insert(schema.userRoles).values({
        userId: doctorUser.id,
        roleId: practRole.id,
      }).onConflictDoNothing()
    }

    // Create practitioner record
    const [practitioner] = await db
      .insert(schema.practitioners)
      .values({
        userId: doctorUser.id,
        displayName: 'Dr. Jalaluddin',
        displayNameUrdu: 'ڈاکٹر جلال الدین',
        displayNamePashto: 'ډاکټر جلال الدین',
        specialty: 'General Medicine',
        specialtyUrdu: 'عمومی طب',
        specialtyPashto: 'عمومي طب',
        qualifications: 'MBBS, FCPS',
        telemedicineEligible: true,
        isPublished: true,
        publishedAt: new Date(),
        credentialStatus: 'verified',
        credentialVerifiedAt: new Date(),
        consultationFeeDefaultPkr: 100000, // 1000 PKR in paisa
      })
      .onConflictDoNothing()
      .returning()

    // Create availability rules (Mon-Fri, 9:00-13:00, 14:00-17:00)
    if (practitioner) {
      for (let day = 1; day <= 5; day++) { // Mon=1 to Fri=5
        // Morning session
        await db.insert(schema.availabilityRules).values({
          practitionerId: practitioner.id,
          dayOfWeek: day,
          slotStartTime: '09:00',
          slotEndTime: '13:00',
          slotDurationMinutes: 20,
          bufferMinutes: 5,
          consultationType: 'video',
        }).onConflictDoNothing()

        // Afternoon session
        await db.insert(schema.availabilityRules).values({
          practitionerId: practitioner.id,
          dayOfWeek: day,
          slotStartTime: '14:00',
          slotEndTime: '17:00',
          slotDurationMinutes: 20,
          bufferMinutes: 5,
          consultationType: 'video',
        }).onConflictDoNothing()
      }
    }

    console.log(`  ✅ Doctor: phone=+923332357055, password=etabeeb123\n`)
  }

  // ============================================================
  // 5. Create Test Patient
  // ============================================================
  console.log('🧑 Creating test patient...')
  const [patientUser] = await db
    .insert(schema.users)
    .values({
      phoneE164: '+920000000002',
      email: 'patient@etabeeb.online',
      displayName: 'Test Patient',
      passwordHash,
      preferredLocale: 'ps',
      preferredTimezone: 'Asia/Kabul',
    })
    .onConflictDoNothing()
    .returning()

  if (patientUser) {
    const patientRole = await findRole('patient')
    if (patientRole) {
      await db.insert(schema.userRoles).values({
        userId: patientUser.id,
        roleId: patientRole.id,
      }).onConflictDoNothing()
    }

    await db.insert(schema.patients).values({
      userId: patientUser.id,
      givenName: 'Test',
      familyName: 'Patient',
      dateOfBirth: '1990-01-15',
      biologicalSex: 'male',
    }).onConflictDoNothing()

    console.log(`  ✅ Patient: phone=+920000000002, password=etabeeb123\n`)
  }

  // ============================================================
  // 6. Create specialties
  // ============================================================
  console.log('🏷️  Creating specialties...')
  const specialtiesData = [
    { code: 'general_medicine', nameEn: 'General Medicine', nameUrdu: 'عمومی طب', namePashto: 'عمومي طب' },
    { code: 'pediatrics', nameEn: 'Pediatrics', nameUrdu: 'اطفال', namePashto: 'اطفال' },
    { code: 'gynecology', nameEn: 'Gynecology', nameUrdu: 'امراض نسواں', namePashto: 'ښځینه ناروغۍ' },
    { code: 'cardiology', nameEn: 'Cardiology', nameUrdu: 'امراض قلب', namePashto: 'زړه ناروغۍ' },
    { code: 'dermatology', nameEn: 'Dermatology', nameUrdu: 'امراض جلد', namePashto: 'پوستکي ناروغۍ' },
    { code: 'psychiatry', nameEn: 'Psychiatry', nameUrdu: 'نفسیات', namePashto: 'رواني ناروغۍ' },
    { code: 'orthopedics', nameEn: 'Orthopedics', nameUrdu: 'ہڈیوں کا علاج', namePashto: 'هډوکو ناروغۍ' },
    { code: 'ent', nameEn: 'ENT', nameUrdu: 'ناک کان گلا', namePashto: 'غوږ پوزه ستونی' },
  ]

  for (let i = 0; i < specialtiesData.length; i++) {
    await db.insert(schema.specialties).values({
      ...specialtiesData[i],
      sortOrder: i,
    }).onConflictDoNothing()
  }
  console.log(`  ✅ ${specialtiesData.length} specialties created\n`)

  console.log('=' .repeat(50))
  console.log('🎉 Seed complete!')
  console.log('')
  console.log('TEST ACCOUNTS:')
  console.log('  Admin:   phone=+920000000001  pass=etabeeb123')
  console.log('  Doctor:  phone=+923332357055   pass=etabeeb123')
  console.log('  Patient: phone=+920000000002  pass=etabeeb123')
  console.log('=' .repeat(50))

  await pool.end()
}

seed().catch(err => {
  console.error('Seed failed:', err)
  process.exit(1)
})
