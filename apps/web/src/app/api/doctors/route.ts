import { NextRequest, NextResponse } from 'next/server'
import { db } from '@etabeeb/db'
import { users, practitioners, userRoles, roles } from '@etabeeb/db/schema'
import { eq, and } from 'drizzle-orm'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { hash } from 'bcryptjs'

// GET /api/doctors — List published doctors
export async function GET(req: NextRequest) {
  try {
    const url = new URL(req.url)
    const specialty = url.searchParams.get('specialty')
    const all = url.searchParams.get('all') === 'true' // admin: show all including unpublished

    const conditions = []

    // Only show published doctors to public
    if (!all) {
      conditions.push(eq(practitioners.isPublished, true))
    }
    conditions.push(eq(practitioners.credentialStatus, 'verified'))

    if (specialty) {
      conditions.push(eq(practitioners.specialty, specialty))
    }

    const doctors = await db
      .select({
        id: practitioners.publicId,
        displayName: practitioners.displayName,
        displayNameUrdu: practitioners.displayNameUrdu,
        displayNamePashto: practitioners.displayNamePashto,
        specialty: practitioners.specialty,
        specialtyUrdu: practitioners.specialtyUrdu,
        specialtyPashto: practitioners.specialtyPashto,
        qualifications: practitioners.qualifications,
        bio: practitioners.bio,
        photoKey: practitioners.photoKey,
        consultationFee: practitioners.consultationFeeDefaultPkr,
        telemedicineEligible: practitioners.telemedicineEligible,
        isPublished: practitioners.isPublished,
      })
      .from(practitioners)
      .where(conditions.length > 0 ? and(...conditions) : undefined)

    return NextResponse.json({ doctors })
  } catch (error) {
    console.error('Doctors fetch error:', error)
    return NextResponse.json(
      { error: 'Failed to fetch doctors' },
      { status: 500 }
    )
  }
}

// POST /api/doctors — Create doctor (admin only)
export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions)

    if (!session?.user?.id || session.user.role !== 'administrator') {
      return NextResponse.json({ error: 'Admin access required' }, { status: 403 })
    }

    const body = await req.json()
    
    // Create user account for doctor
    const passwordHash = await hash(body.password || 'changeme123', 12)

    const result = await db.transaction(async (tx) => {
      // Create user
      const [user] = await tx
        .insert(users)
        .values({
          phoneE164: body.phone,
          email: body.email || null,
          displayName: body.displayName,
          passwordHash,
          preferredLocale: 'ps',
        })
        .returning()

      if (!user) throw new Error('Failed to create user')

      // Create practitioner
      const [practitioner] = await tx
        .insert(practitioners)
        .values({
          userId: user.id,
          displayName: body.displayName,
          displayNameUrdu: body.displayNameUrdu || null,
          displayNamePashto: body.displayNamePashto || null,
          specialty: body.specialty,
          specialtyUrdu: body.specialtyUrdu || null,
          specialtyPashto: body.specialtyPashto || null,
          qualifications: body.qualifications,
          licenceNumber: body.licenceNumber || null,
          consultationFeeDefaultPkr: body.consultationFee ? Math.round(body.consultationFee * 100) : null,
          telemedicineEligible: true,
          credentialStatus: 'pending_review',
          createdBy: session.user.id,
        })
        .returning()
        
      if (!practitioner) throw new Error('Failed to create practitioner')

      // Assign practitioner role
      const [practRole] = await tx
        .select()
        .from(roles)
        .where(eq(roles.name, 'practitioner'))
        .limit(1)

      if (practRole) {
        await tx.insert(userRoles).values({
          userId: user.id,
          roleId: practRole.id,
          grantedBy: session.user.id,
        })
      }

      return { user, practitioner }
    })

    if (!result?.practitioner) {
      throw new Error('Transaction failed')
    }

    return NextResponse.json(
      { success: true, doctor: { id: result.practitioner.publicId } },
      { status: 201 }
    )
  } catch (error) {
    console.error('Doctor creation error:', error)
    return NextResponse.json(
      { error: 'Failed to create doctor' },
      { status: 500 }
    )
  }
}
