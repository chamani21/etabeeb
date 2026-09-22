import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'

const scheduleRuleSchema = z.object({
  dayOfWeek: z.number().int().min(0).max(6),
  slotStartTime: z.string().regex(/^\d{2}:\d{2}$/),
  slotEndTime: z.string().regex(/^\d{2}:\d{2}$/),
  slotDurationMinutes: z.number().int().min(5).max(120).default(20),
  bufferMinutes: z.number().int().min(0).max(30).default(5),
  consultationType: z.enum(['video', 'audio']).default('video'),
  timezone: z.string().default('Asia/Karachi'),
})

const leaveSchema = z.object({
  exceptionDate: z.string().datetime(),
  reason: z.string().optional(),
  isAvailable: z.boolean().default(false),
})

// GET /api/schedule — Get current doctor's schedule
export async function GET(req: NextRequest) {
  try {
    const { getServerSession } = await import('next-auth')
    const { authOptions } = await import('@/lib/auth')
    const session = await getServerSession(authOptions)

    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { db } = await import('@etabeeb/db')
    const { practitioners, availabilityRules, availabilityExceptions } = await import('@etabeeb/db/schema')
    const { eq } = await import('drizzle-orm')

    // Get practitioner
    const [practitioner] = await db
      .select()
      .from(practitioners)
      .where(eq(practitioners.userId, session.user.id))
      .limit(1)

    if (!practitioner) {
      return NextResponse.json({ error: 'Not a doctor' }, { status: 403 })
    }

    // Get rules
    const rules = await db
      .select()
      .from(availabilityRules)
      .where(eq(availabilityRules.practitionerId, practitioner.id))

    // Get exceptions (upcoming)
    const exceptions = await db
      .select()
      .from(availabilityExceptions)
      .where(eq(availabilityExceptions.practitionerId, practitioner.id))

    return NextResponse.json({
      practitionerId: practitioner.publicId,
      rules,
      exceptions,
    })
  } catch (error) {
    console.error('Schedule fetch error:', error)
    return NextResponse.json({ error: 'Failed to fetch schedule' }, { status: 500 })
  }
}

// POST /api/schedule — Add availability rule
export async function POST(req: NextRequest) {
  try {
    const { getServerSession } = await import('next-auth')
    const { authOptions } = await import('@/lib/auth')
    const session = await getServerSession(authOptions)

    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await req.json()

    // Handle leave dates
    if (body.type === 'leave') {
      const parsed = leaveSchema.safeParse(body)
      if (!parsed.success) {
        return NextResponse.json({ error: 'Invalid input', details: parsed.error.flatten() }, { status: 400 })
      }

      const { db } = await import('@etabeeb/db')
      const { practitioners, availabilityExceptions } = await import('@etabeeb/db/schema')
      const { eq } = await import('drizzle-orm')

      const [practitioner] = await db
        .select()
        .from(practitioners)
        .where(eq(practitioners.userId, session.user.id))
        .limit(1)

      if (!practitioner) {
        return NextResponse.json({ error: 'Not a doctor' }, { status: 403 })
      }

      const [exception] = await db
        .insert(availabilityExceptions)
        .values({
          practitionerId: practitioner.id,
          exceptionDate: new Date(parsed.data.exceptionDate),
          reason: parsed.data.reason || null,
          isAvailable: parsed.data.isAvailable,
        })
        .returning()

      return NextResponse.json({ success: true, exception }, { status: 201 })
    }

    // Handle schedule rule
    const parsed = scheduleRuleSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid input', details: parsed.error.flatten() }, { status: 400 })
    }

    const { db } = await import('@etabeeb/db')
    const { practitioners, availabilityRules } = await import('@etabeeb/db/schema')
    const { eq } = await import('drizzle-orm')

    const [practitioner] = await db
      .select()
      .from(practitioners)
      .where(eq(practitioners.userId, session.user.id))
      .limit(1)

    if (!practitioner) {
      return NextResponse.json({ error: 'Not a doctor' }, { status: 403 })
    }

    const [rule] = await db
      .insert(availabilityRules)
      .values({
        practitionerId: practitioner.id,
        ...parsed.data,
      })
      .returning()

    return NextResponse.json({ success: true, rule }, { status: 201 })
  } catch (error) {
    console.error('Schedule update error:', error)
    return NextResponse.json({ error: 'Failed to update schedule' }, { status: 500 })
  }
}
