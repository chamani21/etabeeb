/**
 * POST /api/bootstrap-doctors — Idempotent production doctor seeding
 *
 * Creates the 6 approved eTabeeb doctors with correct credentials, photos,
 * fees, and availability rules. Safe to run multiple times (onConflictDoNothing).
 *
 * Security: requires BOOTSTRAP_SECRET header or admin session.
 */
import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { db } from '@etabeeb/db'
import { users, userRoles, roles, practitioners, availabilityRules } from '@etabeeb/db/schema'
import { eq, and } from 'drizzle-orm'
import bcrypt from 'bcrypt'

// Approved doctor seed data
const APPROVED_DOCTORS = [
  {
    phone: '+93799001001',
    email: 'dr.jalaluddin@etabeeb.online',
    displayName: 'Dr. Jalaluddin',
    displayNameUrdu: 'ڈاکٹر جلال الدین',
    displayNamePashto: 'ډاکټر جلال الدین',
    specialty: 'General Medicine',
    specialtyUrdu: 'عمومی طب',
    specialtyPashto: 'عمومي طب',
    qualifications: 'MD, Senior Consultant Internal Medicine',
    licenceNumber: 'AF-84920',
    licenceJurisdiction: 'Afghanistan',
    bio: 'Senior specialist in internal and general medicine with 10+ years experience. Expertise in diabetes, hypertension, and digestive disorders.',
    // Photo key points to the local public file (served by Next.js static)
    photoKey: '/etabeeb/doctors/dr-jalaluddin/dr-jalaluddin__headshot-white-coat-01.png',
    consultationFeeDefaultPkr: 100000, // 1000 PKR in paisa
    telemedicineEligible: true,
    // Schedule: Mon-Fri 09:00-13:00 and 14:00-17:00
    schedule: [
      { days: [1, 2, 3, 4, 5], start: '09:00', end: '13:00', duration: 20 },
      { days: [1, 2, 3, 4, 5], start: '14:00', end: '17:00', duration: 20 },
    ],
  },
  {
    phone: '+93799001002',
    email: 'dr.shah.fahad@etabeeb.online',
    displayName: 'Dr. Shah Fahad',
    displayNameUrdu: 'ڈاکٹر شاہ فہد',
    displayNamePashto: 'ډاکټر شاه فهاد',
    specialty: 'Paediatrics',
    specialtyUrdu: 'اطفال',
    specialtyPashto: 'د ماشومانو روغتیا',
    qualifications: 'MBBS, DCH, Consultant Paediatrician',
    licenceNumber: 'AF-91234',
    licenceJurisdiction: 'Afghanistan',
    bio: 'Specialist in child health and paediatrics. Providing compassionate care for children from newborn to adolescence.',
    photoKey: '/etabeeb/doctors/dr-shah-fahad-photo-pack/dr-shah-fahad__paediatric-headshot-01.png',
    consultationFeeDefaultPkr: 120000, // 1200 PKR
    telemedicineEligible: true,
    schedule: [
      { days: [0, 1, 2, 3, 4], start: '10:00', end: '14:00', duration: 15 },
    ],
  },
  {
    phone: '+93799001003',
    email: 'dr.rasool.khilji@etabeeb.online',
    displayName: 'Dr. Muhammad Rasool Khilji',
    displayNameUrdu: 'ڈاکٹر محمد رسول خلجی',
    displayNamePashto: 'ډاکټر محمد رسول خلجي',
    specialty: 'Interventional Cardiology',
    specialtyUrdu: 'مداخلتی قلبیات',
    specialtyPashto: 'د زړه د ناروغیو تخصص',
    qualifications: 'MBBS, FCPS (Cardiology), Fellowship Interventional Cardiology',
    licenceNumber: 'PK-PMDC-12345',
    licenceJurisdiction: 'Pakistan',
    bio: 'Interventional cardiologist with expertise in cardiac catheterization, angioplasty, and complex coronary interventions.',
    photoKey: '/etabeeb/doctors/dr-muhammad-rasool-khilji/dr-muhammad-rasool-khilji__studio-formal-01.png',
    consultationFeeDefaultPkr: 250000, // 2500 PKR
    telemedicineEligible: true,
    schedule: [
      { days: [1, 3, 5], start: '15:00', end: '18:00', duration: 30 },
    ],
  },
  {
    phone: '+93799001004',
    email: 'dr.ulus.yar@etabeeb.online',
    displayName: 'Dr. Ulus Yar',
    displayNameUrdu: 'ڈاکٹر الوس یار',
    displayNamePashto: 'ډاکټر اولس یار',
    specialty: 'Orthopaedic Surgery',
    specialtyUrdu: 'آرتھوپیڈک سرجری',
    specialtyPashto: 'د هډوکو جراحي',
    qualifications: 'MBBS, FCPS (Orthopaedics), MS Orthopaedic Surgery',
    licenceNumber: 'AF-73451',
    licenceJurisdiction: 'Afghanistan',
    bio: 'Specialist in orthopaedic surgery including joint replacement, sports injuries, and spine disorders.',
    photoKey: '/etabeeb/doctors/dr-ulus-yar-photo-pack/dr-ulus-yar__black-kurta-portrait-01.png',
    consultationFeeDefaultPkr: 150000, // 1500 PKR
    telemedicineEligible: true,
    schedule: [
      { days: [0, 2, 4], start: '09:00', end: '13:00', duration: 25 },
    ],
  },
  {
    phone: '+93799001005',
    email: 'dr.raheem.achakzai@etabeeb.online',
    displayName: 'Dr. Muhammad Raheem Achakzai',
    displayNameUrdu: 'ڈاکٹر محمد رحیم اچکزئی',
    displayNamePashto: 'ډاکټر محمد رحیم اڅکزی',
    specialty: 'Dermatology',
    specialtyUrdu: 'امراض جلد',
    specialtyPashto: 'د پوستکي ناروغۍ',
    qualifications: 'MBBS, DDV, Consultant Dermatologist',
    licenceNumber: 'AF-66789',
    licenceJurisdiction: 'Afghanistan',
    bio: 'Specialist in skin diseases, dermatology and aesthetic treatments. Expert in treating eczema, psoriasis, and skin infections.',
    photoKey: '/etabeeb/doctors/dr-muhammad-raheem-achakzai/dr-muhammad-raheem-achakzai__studio-office-01.png',
    consultationFeeDefaultPkr: 130000, // 1300 PKR
    telemedicineEligible: true,
    schedule: [
      { days: [1, 2, 3, 4], start: '11:00', end: '15:00', duration: 20 },
    ],
  },
  {
    phone: '+93799001006',
    email: 'dr.malka.achakzai@etabeeb.online',
    displayName: 'Dr. Malka Achakzai',
    displayNameUrdu: 'ڈاکٹر ملکہ اچکزئی',
    displayNamePashto: 'ډاکټره ملکه اڅکزی',
    specialty: 'Physiotherapy',
    specialtyUrdu: 'فزیوتھراپی',
    specialtyPashto: 'فزیوتراپي',
    qualifications: 'BPT, MPT (Musculoskeletal), Certified Physiotherapist',
    licenceNumber: 'AF-55102',
    licenceJurisdiction: 'Afghanistan',
    bio: 'Licensed physiotherapist specializing in musculoskeletal rehabilitation, post-surgical recovery, and chronic pain management.',
    photoKey: '/etabeeb/doctors/dr-malka-achakzai-masked/dr-malka-achakzai__masked-headshot-studio-01.png',
    consultationFeeDefaultPkr: 80000, // 800 PKR
    telemedicineEligible: true,
    schedule: [
      { days: [0, 1, 2, 3, 4, 6], start: '08:00', end: '12:00', duration: 30 },
    ],
  },
]

export async function POST(req: NextRequest) {
  try {
    // Auth: require admin session OR bootstrap secret header
    const bootstrapSecret = process.env.BOOTSTRAP_SECRET
    const providedSecret = req.headers.get('x-bootstrap-secret')

    const session = await getServerSession(authOptions)
    const isAdmin = session?.user?.role === 'administrator'
    const hasSecret = bootstrapSecret && providedSecret === bootstrapSecret

    if (!isAdmin && !hasSecret) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const results: string[] = []
    const defaultPassword = 'Etabeeb@2025!'
    const passwordHash = await bcrypt.hash(defaultPassword, 10)

    // Get practitioner role
    const [practRole] = await db.select().from(roles).where(eq(roles.name, 'practitioner')).limit(1)
    if (!practRole) {
      return NextResponse.json({ error: 'Practitioner role not found. Run /api/bootstrap-admin first.' }, { status: 400 })
    }

    for (const doctor of APPROVED_DOCTORS) {
      // Create or find user account
      let [existingUser] = await db.select({ id: users.id }).from(users)
        .where(eq(users.phoneE164, doctor.phone)).limit(1)

      if (!existingUser) {
        const [newUser] = await db.insert(users).values({
          phoneE164: doctor.phone,
          email: doctor.email,
          displayName: doctor.displayName,
          passwordHash,
          preferredLocale: 'ps',
          preferredTimezone: 'Asia/Kabul',
        }).returning({ id: users.id })
        existingUser = newUser!
        results.push(`Created user: ${doctor.displayName}`)
      } else {
        results.push(`User exists: ${doctor.displayName}`)
      }

      if (!existingUser) continue

      // Assign practitioner role (idempotent)
      await db.insert(userRoles).values({
        userId: existingUser.id,
        roleId: practRole.id,
        grantedBy: session?.user?.id ?? existingUser.id,
      }).onConflictDoNothing()

      // Create or find practitioner record
      const [existingPract] = await db.select({ id: practitioners.id })
        .from(practitioners).where(eq(practitioners.userId, existingUser.id)).limit(1)

      if (!existingPract) {
        const [pract] = await db.insert(practitioners).values({
          userId: existingUser.id,
          displayName: doctor.displayName,
          displayNameUrdu: doctor.displayNameUrdu,
          displayNamePashto: doctor.displayNamePashto,
          specialty: doctor.specialty,
          specialtyUrdu: doctor.specialtyUrdu,
          specialtyPashto: doctor.specialtyPashto,
          qualifications: doctor.qualifications,
          licenceNumber: doctor.licenceNumber,
          licenceJurisdiction: doctor.licenceJurisdiction,
          bio: doctor.bio,
          photoKey: doctor.photoKey,
          consultationFeeDefaultPkr: doctor.consultationFeeDefaultPkr,
          telemedicineEligible: doctor.telemedicineEligible,
          isPublished: true,
          publishedAt: new Date(),
          credentialStatus: 'verified',
          credentialVerifiedAt: new Date(),
          createdBy: session?.user?.id ?? existingUser.id,
          updatedBy: session?.user?.id ?? existingUser.id,
        }).returning({ id: practitioners.id })

        if (pract) {
          // Create availability rules
          for (const slot of doctor.schedule) {
            for (const day of slot.days) {
              await db.insert(availabilityRules).values({
                practitionerId: pract.id,
                dayOfWeek: day,
                slotStartTime: slot.start,
                slotEndTime: slot.end,
                slotDurationMinutes: slot.duration,
                bufferMinutes: 5,
                consultationType: 'video',
              }).onConflictDoNothing()
            }
          }
          results.push(`Created practitioner + schedule: ${doctor.displayName}`)
        }
      } else {
        // Update published status and photo key (idempotent update)
        await db.update(practitioners).set({
          isPublished: true,
          credentialStatus: 'verified',
          photoKey: doctor.photoKey,
          updatedAt: new Date(),
        }).where(eq(practitioners.id, existingPract.id))
        results.push(`Updated practitioner: ${doctor.displayName}`)
      }
    }

    return NextResponse.json({ success: true, results }, { status: 200 })
  } catch (error) {
    console.error('Doctor bootstrap error:', error)
    return NextResponse.json({ error: 'Bootstrap failed', detail: String(error) }, { status: 500 })
  }
}

// GET to check status
export async function GET() {
  try {
    const docs = await db.select({
      name: practitioners.displayName,
      specialty: practitioners.specialty,
      isPublished: practitioners.isPublished,
      credentialStatus: practitioners.credentialStatus,
      photoKey: practitioners.photoKey,
    }).from(practitioners)

    return NextResponse.json({ count: docs.length, doctors: docs })
  } catch (error) {
    return NextResponse.json({ error: 'Failed to fetch doctors' }, { status: 500 })
  }
}
