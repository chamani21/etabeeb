import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { db } from '@etabeeb/db'
import { practitioners, availabilityRules, availabilityExceptions } from '@etabeeb/db/schema'
import { eq } from 'drizzle-orm'

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

// GET /api/schedule
export async function GET(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const [practitioner] = await db
      .select()
      .from(practitioners)
      .where(eq(practitioners.userId, session.user.id))
      .limit(1)

    if (!practitioner) {
      return NextResponse.json({ error: 'Not a doctor' }, { status: 403 })
    }

    const rules = await db
      .select()
      .from(availabilityRules)
      .where(eq(availabilityRules.practitionerId, practitioner.id))

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

// POST /api/schedule
export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await req.json()

    const [practitioner] = await db
      .select()
      .from(practitioners)
      .where(eq(practitioners.userId, session.user.id))
      .limit(1)

    if (!practitioner) {
      return NextResponse.json({ error: 'Not a doctor' }, { status: 403 })
    }

    // Handle leave dates
    if (body.type === 'leave') {
      const parsed = leaveSchema.safeParse(body)
      if (!parsed.success) {
        return NextResponse.json({ error: 'Invalid input', details: parsed.error.flatten() }, { status: 400 })
      }

      const inserted = await db
        .insert(availabilityExceptions)
        .values({
          practitionerId: practitioner.id,
          exceptionDate: new Date(parsed.data.exceptionDate),
          reason: parsed.data.reason || null,
          isAvailable: parsed.data.isAvailable,
        })
        .returning()

      const exception = inserted[0]
      return NextResponse.json({ success: true, exception }, { status: 201 })
    }

    // Handle schedule rule
    const parsed = scheduleRuleSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid input', details: parsed.error.flatten() }, { status: 400 })
    }

    const inserted = await db
      .insert(availabilityRules)
      .values({
        practitionerId: practitioner.id,
        ...parsed.data,
      })
      .returning()

    const rule = inserted[0]
    return NextResponse.json({ success: true, rule }, { status: 201 })
  } catch (error) {
    console.error('Schedule update error:', error)
    return NextResponse.json({ error: 'Failed to update schedule' }, { status: 500 })
  }
}
