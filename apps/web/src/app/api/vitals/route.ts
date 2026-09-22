import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { db } from '@etabeeb/db'
import { vitals } from '@etabeeb/db/schema'
import { eq, desc } from 'drizzle-orm'

const vitalsSchema = z.object({
  patientId: z.string().uuid(),
  appointmentId: z.string().uuid().optional(),
  encounterId: z.string().uuid().optional(),
  systolicBp: z.number().int().min(60).max(300).optional(),
  diastolicBp: z.number().int().min(30).max(200).optional(),
  heartRate: z.number().int().min(20).max(300).optional(),
  respiratoryRate: z.number().int().min(5).max(60).optional(),
  temperatureCelsius: z.number().min(30).max(45).optional(),
  oxygenSaturation: z.number().min(50).max(100).optional(),
  weightKg: z.number().min(0.5).max(500).optional(),
  heightCm: z.number().min(20).max(300).optional(),
  bloodGlucose: z.number().min(10).max(900).optional(),
  source: z.enum(['patient_reported', 'clinician_observed', 'clinic_device']).default('patient_reported'),
  notes: z.string().optional(),
})

// POST /api/vitals
export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await req.json()
    const parsed = vitalsSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid vitals data', details: parsed.error.flatten() }, { status: 400 })
    }

    const data = parsed.data

    // Calculate BMI if height and weight provided
    let bmi: number | null = null
    if (data.weightKg && data.heightCm) {
      bmi = parseFloat((data.weightKg / ((data.heightCm / 100) ** 2)).toFixed(1))
    }

    const inserted = await db
      .insert(vitals)
      .values({
        patientId: data.patientId,
        appointmentId: data.appointmentId || null,
        encounterId: data.encounterId || null,
        systolicBp: data.systolicBp ?? null,
        diastolicBp: data.diastolicBp ?? null,
        heartRate: data.heartRate ?? null,
        respiratoryRate: data.respiratoryRate ?? null,
        temperatureCelsius: data.temperatureCelsius ?? null,
        oxygenSaturation: data.oxygenSaturation ?? null,
        weightKg: data.weightKg ?? null,
        heightCm: data.heightCm ?? null,
        bmi,
        bloodGlucose: data.bloodGlucose ?? null,
        source: data.source,
        notes: data.notes || null,
        recordedBy: session.user.id,
      })
      .returning()

    const result = inserted[0]
    return NextResponse.json({ success: true, vitals: result }, { status: 201 })
  } catch (error) {
    console.error('Vitals recording error:', error)
    return NextResponse.json({ error: 'Failed to record vitals' }, { status: 500 })
  }
}

// GET /api/vitals
export async function GET(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const url = new URL(req.url)
    const patientId = url.searchParams.get('patientId')
    if (!patientId) {
      return NextResponse.json({ error: 'patientId is required' }, { status: 400 })
    }

    const results = await db
      .select()
      .from(vitals)
      .where(eq(vitals.patientId, patientId))
      .orderBy(desc(vitals.takenAt))
      .limit(50)

    return NextResponse.json({ vitals: results })
  } catch (error) {
    console.error('Vitals fetch error:', error)
    return NextResponse.json({ error: 'Failed to fetch vitals' }, { status: 500 })
  }
}
