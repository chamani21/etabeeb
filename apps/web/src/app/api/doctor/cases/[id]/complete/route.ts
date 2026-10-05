import { NextRequest, NextResponse } from 'next/server'
import { requireV1Doctor } from '@/lib/etabib/auth'
import { errorResponse } from '@/lib/etabib/errors'
import { parseCaseId } from '@/lib/etabib/schemas'
import { completeConsultation } from '@/lib/etabib/rx/service'
import { closeLiveKitRoom } from '@/lib/etabib/video'

// POST /api/doctor/cases/[id]/complete — the doctor deliberately ends the
// consultation (prescription finalized and sent): COMPLETED, video closed.
export async function POST(_req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const doctor = await requireV1Doctor()
    const { videoRoomToClose, ...result } = await completeConsultation(parseCaseId(params.id), { type: 'DOCTOR', id: doctor.id })
    if (videoRoomToClose) await closeLiveKitRoom(videoRoomToClose)
    return NextResponse.json({ success: true, changed: result.changed, caseStatus: result.case.status })
  } catch (error) {
    return errorResponse(error, 'doctor/complete')
  }
}
