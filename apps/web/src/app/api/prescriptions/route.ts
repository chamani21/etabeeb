import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { db } from '@etabeeb/db'
import { prescriptions, prescriptionItems } from '@etabeeb/db/schema'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { eq, desc } from 'drizzle-orm'
import { insertPrescription, prescriptionItemSchema } from '@/lib/prescriptions'

const createPrescriptionSchema = z.object({
  encounterId: z.string().uuid(),
  appointmentId: z.string().uuid(),
  patientUserId: z.string().uuid(),
  items: z.array(prescriptionItemSchema).min(1),
  finalize: z.boolean().default(false),
})

// POST /api/prescriptions — Create or finalize a prescription
export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions)

    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Only doctors can create prescriptions
    if (session.user.role !== 'practitioner' && session.user.role !== 'administrator') {
      return NextResponse.json({ error: 'Only doctors can create prescriptions' }, { status: 403 })
    }

    const body = await req.json()
    const parsed = createPrescriptionSchema.safeParse(body)

    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid input', details: parsed.error.flatten() },
        { status: 400 }
      )
    }

    const { encounterId, appointmentId, patientUserId, items, finalize } = parsed.data

    const result = await db.transaction((tx) =>
      insertPrescription(tx, {
        encounterId,
        appointmentId,
        prescribedBy: session.user.id,
        prescribedForUserId: patientUserId,
        items,
        finalize,
      }),
    )

    if (!result) {
      return NextResponse.json({ error: 'Failed to create prescription' }, { status: 500 })
    }

    // TODO: Generate PDF if finalized
    // TODO: Send WhatsApp/email notification to patient

    return NextResponse.json(
      {
        success: true,
        prescription: {
          id: result.publicId,
          verificationToken: result.verificationToken,
          status: result.status,
          signedAt: result.signedAt,
        },
      },
      { status: 201 }
    )
  } catch (error) {
    console.error('Prescription creation error:', error)
    return NextResponse.json(
      { error: 'Failed to create prescription' },
      { status: 500 }
    )
  }
}

// GET /api/prescriptions — List prescriptions for current user
export async function GET(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions)

    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const role = session.user.role

    let whereCondition
    if (role === 'patient') {
      whereCondition = eq(prescriptions.prescribedForUserId, session.user.id)
    } else if (role === 'practitioner') {
      whereCondition = eq(prescriptions.prescribedBy, session.user.id)
    }
    // admin sees all (no where clause)

    const results = await db
      .select()
      .from(prescriptions)
      .where(whereCondition)
      .orderBy(desc(prescriptions.createdAt))
      .limit(50)

    // Get items for each prescription
    const prescriptionsWithItems = await Promise.all(
      results.map(async (rx) => {
        const items = await db
          .select()
          .from(prescriptionItems)
          .where(eq(prescriptionItems.prescriptionId, rx.id))

        return { ...rx, items }
      })
    )

    return NextResponse.json({ prescriptions: prescriptionsWithItems })
  } catch (error) {
    console.error('Prescriptions fetch error:', error)
    return NextResponse.json(
      { error: 'Failed to fetch prescriptions' },
      { status: 500 }
    )
  }
}
