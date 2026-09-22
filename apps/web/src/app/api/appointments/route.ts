import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'

// ============================================================
// APPOINTMENT API ROUTES
// ============================================================

// Validation schemas
const bookAppointmentSchema = z.object({
  practitionerId: z.string().uuid(),
  slotStart: z.string().datetime(),
  slotEnd: z.string().datetime(),
  consultationType: z.enum(['video', 'audio']).default('video'),
  chiefComplaint: z.string().min(3).max(1000).optional(),
  timezone: z.string().default('Asia/Kabul'),
})

const updateStatusSchema = z.object({
  appointmentId: z.string().uuid(),
  status: z.enum([
    'confirmed',
    'checked_in',
    'in_progress',
    'completed',
    'cancelled',
    'no_show',
    'rescheduled',
  ]),
  reason: z.string().optional(),
})

// POST /api/appointments — Book an appointment
export async function POST(req: NextRequest) {
  try {
    // Auth check
    const { getServerSession } = await import('next-auth')
    const { authOptions } = await import('@/lib/auth')
    const session = await getServerSession(authOptions)

    if (!session?.user?.id) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      )
    }

    const body = await req.json()
    const parsed = bookAppointmentSchema.safeParse(body)

    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid input', details: parsed.error.flatten() },
        { status: 400 }
      )
    }

    const { practitionerId, slotStart, slotEnd, consultationType, chiefComplaint, timezone } = parsed.data

    // Import DB
    const { db } = await import('@etabeeb/db')
    const { appointments, appointmentStatusHistory, patients } = await import('@etabeeb/db/schema')
    const { eq, and, or, gte, lt } = await import('drizzle-orm')

    // Verify slot start is in the future
    if (new Date(slotStart) <= new Date()) {
      return NextResponse.json(
        { error: 'Cannot book a slot in the past' },
        { status: 400 }
      )
    }

    // Verify slot end > slot start
    if (new Date(slotEnd) <= new Date(slotStart)) {
      return NextResponse.json(
        { error: 'Invalid slot time range' },
        { status: 400 }
      )
    }

    // Check for double booking (same doctor, overlapping time)
    const conflicting = await db
      .select({ id: appointments.id })
      .from(appointments)
      .where(
        and(
          eq(appointments.practitionerId, practitionerId),
          lt(appointments.slotStart, new Date(slotEnd)),
          gte(appointments.slotEnd, new Date(slotStart)),
          // Exclude cancelled/no-show appointments
          or(
            eq(appointments.status, 'draft'),
            eq(appointments.status, 'held'),
            eq(appointments.status, 'pending_payment'),
            eq(appointments.status, 'pending_verification'),
            eq(appointments.status, 'confirmed'),
            eq(appointments.status, 'checked_in'),
            eq(appointments.status, 'in_progress'),
          )
        )
      )
      .limit(1)

    if (conflicting.length > 0) {
      return NextResponse.json(
        { error: 'This time slot is no longer available. Please select another slot.' },
        { status: 409 }
      )
    }

    // Get patient record
    const patientRecords = await db
      .select({ id: patients.id })
      .from(patients)
      .where(eq(patients.userId, session.user.id))
      .limit(1)

    const patientId = patientRecords[0]?.id

    // Create appointment (within a transaction)
    const result = await db.transaction(async (tx) => {
      const [appointment] = await tx
        .insert(appointments)
        .values({
          patientUserId: session.user.id,
          patientId: patientId || null,
          practitionerId,
          slotStart: new Date(slotStart),
          slotEnd: new Date(slotEnd),
          timezone,
          consultationType,
          chiefComplaint: chiefComplaint || null,
          status: 'confirmed', // Auto-confirm for now (manual payment)
          createdBy: session.user.id,
          updatedBy: session.user.id,
        })
        .returning()

      // Record status history
      await tx.insert(appointmentStatusHistory).values({
        appointmentId: appointment.id,
        fromStatus: null,
        toStatus: 'confirmed',
        changedBy: session.user.id,
        reason: 'Appointment booked by patient',
      })

      return appointment
    })

    // TODO: Trigger WhatsApp/email notification

    return NextResponse.json(
      {
        success: true,
        appointment: {
          id: result.publicId,
          status: result.status,
          slotStart: result.slotStart,
          slotEnd: result.slotEnd,
          consultationType: result.consultationType,
        },
      },
      { status: 201 }
    )
  } catch (error) {
    console.error('Appointment booking error:', error)
    return NextResponse.json(
      { error: 'Failed to book appointment' },
      { status: 500 }
    )
  }
}

// GET /api/appointments — List appointments for current user
export async function GET(req: NextRequest) {
  try {
    const { getServerSession } = await import('next-auth')
    const { authOptions } = await import('@/lib/auth')
    const session = await getServerSession(authOptions)

    if (!session?.user?.id) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      )
    }

    const { db } = await import('@etabeeb/db')
    const { appointments, practitioners } = await import('@etabeeb/db/schema')
    const { eq, desc, and, gte, or } = await import('drizzle-orm')

    const url = new URL(req.url)
    const status = url.searchParams.get('status')
    const upcoming = url.searchParams.get('upcoming') === 'true'
    const role = session.user.role

    let whereCondition

    if (role === 'patient') {
      whereCondition = eq(appointments.patientUserId, session.user.id)
    } else if (role === 'practitioner') {
      // Doctor sees their own appointments
      const practitionerRecords = await db
        .select({ id: practitioners.id })
        .from(practitioners)
        .where(eq(practitioners.userId, session.user.id))
        .limit(1)

      if (!practitionerRecords[0]) {
        return NextResponse.json({ appointments: [] })
      }
      whereCondition = eq(appointments.practitionerId, practitionerRecords[0].id)
    } else if (role === 'administrator') {
      // Admin sees all
      whereCondition = undefined
    } else {
      return NextResponse.json(
        { error: 'Forbidden' },
        { status: 403 }
      )
    }

    const conditions = []
    if (whereCondition) conditions.push(whereCondition)
    if (upcoming) conditions.push(gte(appointments.slotStart, new Date()))
    if (status) conditions.push(eq(appointments.status, status as any))

    const results = await db
      .select()
      .from(appointments)
      .where(conditions.length > 0 ? and(...conditions) : undefined)
      .orderBy(desc(appointments.slotStart))
      .limit(50)

    return NextResponse.json({ appointments: results })
  } catch (error) {
    console.error('Appointments fetch error:', error)
    return NextResponse.json(
      { error: 'Failed to fetch appointments' },
      { status: 500 }
    )
  }
}

// PATCH /api/appointments — Update appointment status
export async function PATCH(req: NextRequest) {
  try {
    const { getServerSession } = await import('next-auth')
    const { authOptions } = await import('@/lib/auth')
    const session = await getServerSession(authOptions)

    if (!session?.user?.id) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      )
    }

    const body = await req.json()
    const parsed = updateStatusSchema.safeParse(body)

    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid input', details: parsed.error.flatten() },
        { status: 400 }
      )
    }

    const { appointmentId, status, reason } = parsed.data

    const { db } = await import('@etabeeb/db')
    const { appointments, appointmentStatusHistory } = await import('@etabeeb/db/schema')
    const { eq } = await import('drizzle-orm')

    // Get current appointment
    const [current] = await db
      .select()
      .from(appointments)
      .where(eq(appointments.id, appointmentId))
      .limit(1)

    if (!current) {
      return NextResponse.json(
        { error: 'Appointment not found' },
        { status: 404 }
      )
    }

    // Authorization: patient can only cancel their own, doctor/admin can change status
    const role = session.user.role
    if (role === 'patient') {
      if (current.patientUserId !== session.user.id) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
      }
      if (status !== 'cancelled') {
        return NextResponse.json(
          { error: 'Patients can only cancel appointments' },
          { status: 403 }
        )
      }
    }

    // Update with optimistic concurrency
    const result = await db.transaction(async (tx) => {
      const [updated] = await tx
        .update(appointments)
        .set({
          status: status as any,
          updatedBy: session.user.id,
          updatedAt: new Date(),
          ...(status === 'cancelled' ? {
            cancelledBy: session.user.id,
            cancellationReason: reason || null,
            cancelledAt: new Date(),
          } : {}),
          version: current.version + 1,
        })
        .where(
          and(
            eq(appointments.id, appointmentId),
            eq(appointments.version, current.version), // optimistic lock
          )
        )
        .returning()

      if (!updated) {
        throw new Error('Concurrent modification detected')
      }

      // Record status change
      await tx.insert(appointmentStatusHistory).values({
        appointmentId,
        fromStatus: current.status,
        toStatus: status as any,
        changedBy: session.user.id,
        reason: reason || null,
      })

      return updated
    })

    return NextResponse.json({ success: true, appointment: result })
  } catch (error: any) {
    if (error?.message === 'Concurrent modification detected') {
      return NextResponse.json(
        { error: 'Appointment was modified by someone else. Please refresh.' },
        { status: 409 }
      )
    }
    console.error('Appointment update error:', error)
    return NextResponse.json(
      { error: 'Failed to update appointment' },
      { status: 500 }
    )
  }
}
