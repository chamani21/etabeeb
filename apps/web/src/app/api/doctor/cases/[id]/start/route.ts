import { NextRequest, NextResponse } from 'next/server'
import { requireV1Doctor } from '@/lib/etabib/auth'
import { errorResponse } from '@/lib/etabib/errors'
import { parseCaseId } from '@/lib/etabib/schemas'
import { startConsultation } from '@/lib/etabib/cases'

// POST /api/doctor/cases/[id]/start — CONFIRMED → IN_CONSULTATION (idempotent)
export async function POST(_req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const doctor = await requireV1Doctor()
    const caseId = parseCaseId(params.id)
    const result = await startConsultation(caseId, { type: 'DOCTOR', id: doctor.id })
    return NextResponse.json({ success: true, changed: result.changed, case: result.case })
  } catch (error) {
    return errorResponse(error, 'doctor/start')
  }
}
