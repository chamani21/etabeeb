import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { db } from '@etabeeb/db'
import { encounters, appointments, practitioners } from '@etabeeb/db/schema'
import { eq, and } from 'drizzle-orm'

const createEncounterSchema = z.object({
  appointmentId: z.string().uuid(),
  subjective: z.string().optional(),
  objective: z.string().optional(),
  assessment: z.string().optional(),
  plan: z.string().optional(),
  safetyNet: z.string().optional(),
  followUpDays: z.number().int().positive().optional(),
  sign: z.boolean().default(false),
})

const updateEncounterSchema = z.object({
  encounterId: z.string().uuid(),
  subjective: z.string().optional(),
  objective: z.string().optional(),
  assessment: z.string().optional(),
  plan: z.string().optional(),
  safetyNet: z.string().optional(),
  followUpDays: z.number().int().positive().optional(),
  sign: z.boolean().default(false),
})

// GET /api/encounters?appointmentId=...
export async function GET(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const url = new URL(req.url)
    const appointmentId = url.searchParams.get('appointmentId')

    if (!appointmentId) {
      return NextResponse.json({ error: 'appointmentId is required' }, { status: 400 })
    }

    // Verify access: must be the practitioner or patient of this appointment
    const [appt] = await db.select().from(appointments).where(eq(appointments.id, appointmentId)).limit(1)
    if (!appt) {
      return NextResponse.json({ error: 'Appointment not found' }, { status: 404 })
    }

    const role = session.user.role
    if (role === 'patient' && appt.patientUserId !== session.user.id) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    if (role === 'practitioner') {
      const [pract] = await db.select().from(practitioners).where(eq(practitioners.userId, session.user.id)).limit(1)
      if (!pract || appt.practitionerId !== pract.id) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
      }
    }

    const encounterList = await db.select().from(encounters).where(eq(encounters.appointmentId, appointmentId))

    return NextResponse.json({ encounters: encounterList })
  } catch (error) {
    console.error('Encounters fetch error:', error)
    return NextResponse.json({ error: 'Failed to fetch encounters' }, { status: 500 })
  }
}

// POST /api/encounters — Create encounter (doctor only)
export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    if (session.user.role !== 'practitioner' && session.user.role !== 'administrator') {
      return NextResponse.json({ error: 'Only doctors can create encounters' }, { status: 403 })
    }

    const body = await req.json()
    const parsed = createEncounterSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid input', details: parsed.error.flatten() }, { status: 400 })
    }

    const { appointmentId, sign, ...noteFields } = parsed.data

    const [pract] = await db.select().from(practitioners).where(eq(practitioners.userId, session.user.id)).limit(1)
    if (!pract) {
      return NextResponse.json({ error: 'Practitioner record not found' }, { status: 403 })
    }

    const [encounter] = await db.insert(encounters).values({
      appointmentId,
      practitionerId: session.user.id,
      subjective: noteFields.subjective ?? null,
      objective: noteFields.objective ?? null,
      assessment: noteFields.assessment ?? null,
      plan: noteFields.plan ?? null,
      safetyNet: noteFields.safetyNet ?? null,
      followUpDays: noteFields.followUpDays ?? null,
      status: sign ? 'signed' : 'in_progress',
      ...(sign ? { signedAt: new Date(), signedBy: session.user.id } : {}),
      createdBy: session.user.id,
      updatedBy: session.user.id,
    }).returning()

    return NextResponse.json({ success: true, encounter }, { status: 201 })
  } catch (error) {
    console.error('Encounter creation error:', error)
    return NextResponse.json({ error: 'Failed to create encounter' }, { status: 500 })
  }
}

// PATCH /api/encounters — Update encounter (doctor only, before signing)
export async function PATCH(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    if (session.user.role !== 'practitioner' && session.user.role !== 'administrator') {
      return NextResponse.json({ error: 'Only doctors can update encounters' }, { status: 403 })
    }

    const body = await req.json()
    const parsed = updateEncounterSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid input', details: parsed.error.flatten() }, { status: 400 })
    }

    const { encounterId, sign, ...noteFields } = parsed.data

    const [existing] = await db.select().from(encounters).where(
      and(
        eq(encounters.id, encounterId),
        eq(encounters.practitionerId, session.user.id),
      )
    ).limit(1)

    if (!existing) {
      return NextResponse.json({ error: 'Encounter not found or access denied' }, { status: 404 })
    }
    if (existing.status === 'signed') {
      return NextResponse.json({ error: 'Cannot modify a signed encounter' }, { status: 400 })
    }

    const [updated] = await db.update(encounters).set({
      subjective: noteFields.subjective ?? existing.subjective,
      objective: noteFields.objective ?? existing.objective,
      assessment: noteFields.assessment ?? existing.assessment,
      plan: noteFields.plan ?? existing.plan,
      safetyNet: noteFields.safetyNet ?? existing.safetyNet,
      followUpDays: noteFields.followUpDays ?? existing.followUpDays,
      status: sign ? 'signed' : 'in_progress',
      ...(sign ? { signedAt: new Date(), signedBy: session.user.id } : {}),
      updatedAt: new Date(),
      updatedBy: session.user.id,
      version: existing.version + 1,
    }).where(eq(encounters.id, encounterId)).returning()

    return NextResponse.json({ success: true, encounter: updated })
  } catch (error) {
    console.error('Encounter update error:', error)
    return NextResponse.json({ error: 'Failed to update encounter' }, { status: 500 })
  }
}
