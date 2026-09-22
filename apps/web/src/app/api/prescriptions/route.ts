import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'

const prescriptionItemSchema = z.object({
  genericName: z.string().min(1),
  strength: z.string().optional(),
  formulation: z.string().optional(),
  route: z.string().optional(),
  dose: z.string().min(1),
  frequency: z.string().min(1),
  timing: z.string().optional(),
  durationDays: z.number().int().positive().optional(),
  quantity: z.string().optional(),
  indication: z.string().optional(),
  substitutionAllowed: z.boolean().default(true),
  patientInstructions: z.string().optional(),
  isControlled: z.boolean().default(false),
})

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
    const { getServerSession } = await import('next-auth')
    const { authOptions } = await import('@/lib/auth')
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
    const { db } = await import('@etabeeb/db')
    const { prescriptions, prescriptionItems } = await import('@etabeeb/db/schema')
    const { randomUUID } = await import('crypto')

    const verificationToken = randomUUID().replace(/-/g, '').substring(0, 16).toUpperCase()

    const result = await db.transaction(async (tx) => {
      // Create prescription
      const [prescription] = await tx
        .insert(prescriptions)
        .values({
          encounterId,
          appointmentId,
          prescribedBy: session.user.id,
          prescribedForUserId: patientUserId,
          verificationToken,
          status: finalize ? 'active' : 'active', // Always active once created
          signedAt: finalize ? new Date() : null,
          signedBy: finalize ? session.user.id : null,
        })
        .returning()

      // Create prescription items
      for (let i = 0; i < items.length; i++) {
        await tx.insert(prescriptionItems).values({
          prescriptionId: prescription.id,
          genericName: items[i].genericName,
          strength: items[i].strength || null,
          formulation: items[i].formulation || null,
          route: items[i].route || null,
          dose: items[i].dose,
          frequency: items[i].frequency,
          timing: items[i].timing || null,
          durationDays: items[i].durationDays || null,
          quantity: items[i].quantity || null,
          indication: items[i].indication || null,
          substitutionAllowed: items[i].substitutionAllowed,
          patientInstructions: items[i].patientInstructions || null,
          isControlled: items[i].isControlled,
          sortOrder: i,
        })
      }

      return prescription
    })

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
    const { getServerSession } = await import('next-auth')
    const { authOptions } = await import('@/lib/auth')
    const session = await getServerSession(authOptions)

    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { db } = await import('@etabeeb/db')
    const { prescriptions, prescriptionItems, practitioners } = await import('@etabeeb/db/schema')
    const { eq, desc } = await import('drizzle-orm')

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
