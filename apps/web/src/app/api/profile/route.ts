import { NextRequest, NextResponse } from 'next/server'
import { db } from '@etabeeb/db'
import { users, patients } from '@etabeeb/db/schema'
import { eq } from 'drizzle-orm'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import bcryptjs from 'bcryptjs'
import { z } from 'zod'

const updateProfileSchema = z.object({
  displayName: z.string().min(2).max(100).optional(),
  email: z.string().email().optional().or(z.literal('')),
  preferredLocale: z.enum(['ps', 'fa', 'ur', 'en']).optional(),
  // Patient-specific fields
  givenName: z.string().min(1).optional(),
  familyName: z.string().optional(),
  dateOfBirth: z.string().optional(), // ISO date string YYYY-MM-DD
  biologicalSex: z.enum(['male', 'female', 'not_stated']).optional(),
  allergiesSummary: z.string().optional(),
  // Password change
  currentPassword: z.string().optional(),
  newPassword: z.string().min(6).optional(),
})

// GET /api/profile — Get current user profile
export async function GET(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const [user] = await db
      .select({
        id: users.id,
        publicId: users.publicId,
        phoneE164: users.phoneE164,
        email: users.email,
        displayName: users.displayName,
        preferredLocale: users.preferredLocale,
        createdAt: users.createdAt,
      })
      .from(users)
      .where(eq(users.id, session.user.id))
      .limit(1)

    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 })
    }

    // Get patient record if exists
    const [patient] = await db
      .select()
      .from(patients)
      .where(eq(patients.userId, session.user.id))
      .limit(1)

    return NextResponse.json({
      user,
      patient: patient || null,
      role: session.user.role,
    })
  } catch (error) {
    console.error('Profile fetch error:', error)
    return NextResponse.json({ error: 'Failed to fetch profile' }, { status: 500 })
  }
}

// PATCH /api/profile — Update current user profile
export async function PATCH(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await req.json()
    const parsed = updateProfileSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid input', details: parsed.error.flatten() }, { status: 400 })
    }

    const {
      displayName,
      email,
      preferredLocale,
      givenName,
      familyName,
      dateOfBirth,
      biologicalSex,
      allergiesSummary,
      currentPassword,
      newPassword,
    } = parsed.data

    // Handle password change
    let newPasswordHash: string | undefined
    if (newPassword) {
      if (!currentPassword) {
        return NextResponse.json({ error: 'Current password required to change password' }, { status: 400 })
      }
      const [userRecord] = await db.select({ passwordHash: users.passwordHash }).from(users).where(eq(users.id, session.user.id)).limit(1)
      if (!userRecord?.passwordHash) {
        return NextResponse.json({ error: 'User not found' }, { status: 404 })
      }
      const valid = await bcryptjs.compare(currentPassword, userRecord.passwordHash)
      if (!valid) {
        return NextResponse.json({ error: 'Current password is incorrect' }, { status: 400 })
      }
      newPasswordHash = await bcryptjs.hash(newPassword, 10)
    }

    await db.transaction(async (tx) => {
      // Update user record
      const userUpdates: Record<string, any> = { updatedAt: new Date() }
      if (displayName) userUpdates.displayName = displayName
      if (email !== undefined) userUpdates.email = email || null
      if (preferredLocale) userUpdates.preferredLocale = preferredLocale
      if (newPasswordHash) userUpdates.passwordHash = newPasswordHash

      if (Object.keys(userUpdates).length > 1) {
        await tx.update(users).set(userUpdates).where(eq(users.id, session.user.id))
      }

      // Update patient record if provided
      const patientUpdates: Record<string, any> = { updatedAt: new Date(), updatedBy: session.user.id }
      if (givenName) patientUpdates.givenName = givenName
      if (familyName !== undefined) patientUpdates.familyName = familyName || null
      if (dateOfBirth !== undefined) patientUpdates.dateOfBirth = dateOfBirth || null
      if (biologicalSex) patientUpdates.biologicalSex = biologicalSex
      if (allergiesSummary !== undefined) patientUpdates.allergiesSummary = allergiesSummary || null

      if (Object.keys(patientUpdates).length > 2) {
        // Check if patient record exists
        const [existingPatient] = await tx.select({ id: patients.id }).from(patients).where(eq(patients.userId, session.user.id)).limit(1)
        if (existingPatient) {
          await tx.update(patients).set(patientUpdates).where(eq(patients.userId, session.user.id))
        }
      }
    })

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Profile update error:', error)
    return NextResponse.json({ error: 'Failed to update profile' }, { status: 500 })
  }
}
