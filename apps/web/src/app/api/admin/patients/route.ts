import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { db } from '@etabeeb/db'
import { patients, users } from '@etabeeb/db/schema'
import { eq, like, or, desc } from 'drizzle-orm'

// GET /api/admin/patients?search=...
export async function GET(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.id || session.user.role !== 'administrator') {
      return NextResponse.json({ error: 'Admin access required' }, { status: 403 })
    }

    const url = new URL(req.url)
    const search = url.searchParams.get('search')?.trim()

    let results

    if (search) {
      results = await db
        .select({
          userId: users.id,
          displayName: users.displayName,
          phone: users.phoneE164,
          email: users.email,
          givenName: patients.givenName,
          familyName: patients.familyName,
          dateOfBirth: patients.dateOfBirth,
          biologicalSex: patients.biologicalSex,
          createdAt: users.createdAt,
        })
        .from(users)
        .leftJoin(patients, eq(patients.userId, users.id))
        .where(
          or(
            like(users.displayName, `%${search}%`),
            like(users.phoneE164, `%${search}%`),
            like(patients.givenName, `%${search}%`),
            like(patients.familyName, `%${search}%`),
          )
        )
        .orderBy(desc(users.createdAt))
        .limit(50)
    } else {
      results = await db
        .select({
          userId: users.id,
          displayName: users.displayName,
          phone: users.phoneE164,
          email: users.email,
          givenName: patients.givenName,
          familyName: patients.familyName,
          dateOfBirth: patients.dateOfBirth,
          biologicalSex: patients.biologicalSex,
          createdAt: users.createdAt,
        })
        .from(patients)
        .leftJoin(users, eq(users.id, patients.userId))
        .orderBy(desc(users.createdAt))
        .limit(100)
    }

    return NextResponse.json({ patients: results })
  } catch (error) {
    console.error('Admin patients fetch error:', error)
    return NextResponse.json({ error: 'Failed to fetch patients' }, { status: 500 })
  }
}
