import { NextRequest, NextResponse } from 'next/server'
import { requireV1Doctor } from '@/lib/etabib/auth'
import { errorResponse } from '@/lib/etabib/errors'
import { parseCaseId } from '@/lib/etabib/schemas'
import { createAmendment } from '@/lib/etabib/rx/service'

// POST /api/doctor/cases/[id]/prescription/amend — new editable revision; the
// finalized revision is preserved unchanged.
export async function POST(_req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const doctor = await requireV1Doctor()
    const rx = await createAmendment(parseCaseId(params.id), { type: 'DOCTOR', id: doctor.id })
    return NextResponse.json({ success: true, prescriptionId: rx.id, revision: rx.revision })
  } catch (error) {
    return errorResponse(error, 'doctor/prescription-amend')
  }
}
