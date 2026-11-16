import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/etabib/auth'
import { errorResponse, validationErrorResponse } from '@/lib/etabib/errors'
import { cancelCaseSchema, parseCaseId, readJson } from '@/lib/etabib/schemas'
import { cancelConsultation } from '@/lib/etabib/cases'
import { dispatchOutboundJobs } from '@/lib/etabib/outbound'
import { closeLiveKitRoom } from '@/lib/etabib/video'

// POST /api/admin/cases/[id]/cancel — admin cancels before the consultation starts
// (ADMIN_INTAKE … CONFIRMED). Reason required; repeat on a CANCELLED case is a no-op.
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const admin = await requireAdmin()
    const caseId = parseCaseId(params.id)
    const parsed = cancelCaseSchema.safeParse(await readJson(req))
    if (!parsed.success) return validationErrorResponse(parsed.error)
    const { videoRoomToClose, ...result } = await cancelConsultation(caseId, { reason: parsed.data.reason, note: parsed.data.note ?? null }, { type: 'ADMIN', id: admin.id })
    if (videoRoomToClose) await closeLiveKitRoom(videoRoomToClose)
    await dispatchOutboundJobs(result.jobs.filter((j) => j.created).map((j) => j.id))
    return NextResponse.json({ success: true, changed: result.changed, status: result.case.status, withdrawnJobs: result.withdrawnJobs })
  } catch (error) {
    return errorResponse(error, 'admin/cancel')
  }
}
