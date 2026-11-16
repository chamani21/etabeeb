import { NextRequest, NextResponse } from 'next/server'
import { requireV1Doctor } from '@/lib/etabib/auth'
import { errorResponse } from '@/lib/etabib/errors'
import { parseCaseId } from '@/lib/etabib/schemas'
import { finalizePrescription } from '@/lib/etabib/rx/service'

// POST /api/doctor/cases/[id]/prescription/finalize — lock the draft (immutable),
// render image(s) + PDF. Idempotent. Does not send and does not end the call.
export async function POST(_req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const doctor = await requireV1Doctor()
    const { prescription, changed } = await finalizePrescription(parseCaseId(params.id), { type: 'DOCTOR', id: doctor.id })
    return NextResponse.json({ success: true, changed, prescriptionId: prescription.id, rendered: Boolean(prescription.renderedAt) })
  } catch (error) {
    return errorResponse(error, 'doctor/prescription-finalize')
  }
}
