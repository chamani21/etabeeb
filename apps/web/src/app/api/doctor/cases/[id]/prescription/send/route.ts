import { NextRequest, NextResponse } from 'next/server'
import { requireV1Doctor } from '@/lib/etabib/auth'
import { errorResponse, validationErrorResponse } from '@/lib/etabib/errors'
import { parseCaseId, readJson, rxSendSchema } from '@/lib/etabib/schemas'
import { sendPrescription } from '@/lib/etabib/rx/service'
import { dispatchOutboundJobs } from '@/lib/etabib/outbound'
import { closeLiveKitRoom } from '@/lib/etabib/video'

// POST /api/doctor/cases/[id]/prescription/send — queue the finalized prescription
// image(s) (+ voice) for WhatsApp. {complete:true} = "Send & Complete Consultation";
// otherwise the video call stays open. Idempotent per page / voice note.
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const doctor = await requireV1Doctor()
    const parsed = rxSendSchema.safeParse(await readJson(req).catch(() => ({})))
    if (!parsed.success) return validationErrorResponse(parsed.error)
    const { videoRoomToClose, ...result } = await sendPrescription(parseCaseId(params.id), { type: 'DOCTOR', id: doctor.id }, { complete: parsed.data.complete ?? false })
    await dispatchOutboundJobs(result.jobs.filter((j) => j.created).map((j) => j.id))
    if (videoRoomToClose) await closeLiveKitRoom(videoRoomToClose)
    return NextResponse.json({ success: true, changed: result.changed, caseStatus: result.case.status, queued: result.jobs.filter((j) => j.created).length })
  } catch (error) {
    return errorResponse(error, 'doctor/prescription-send')
  }
}
