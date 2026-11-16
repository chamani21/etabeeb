import { NextRequest, NextResponse } from 'next/server'
import { requireV1Doctor } from '@/lib/etabib/auth'
import { errorResponse } from '@/lib/etabib/errors'
import { parseCaseId } from '@/lib/etabib/schemas'
import { previewPrescription } from '@/lib/etabib/rx/service'

// POST /api/doctor/cases/[id]/prescription/preview — the ACTUAL rendered document
// (same renderer as WhatsApp/PDF) for the saved draft; not stored.
export async function POST(_req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const doctor = await requireV1Doctor()
    const pages = await previewPrescription(parseCaseId(params.id), { type: 'DOCTOR', id: doctor.id })
    return NextResponse.json({ success: true, pages })
  } catch (error) {
    return errorResponse(error, 'doctor/prescription-preview')
  }
}
