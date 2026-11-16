import { NextResponse } from 'next/server'
import { requireV1Doctor } from '@/lib/etabib/auth'
import { errorResponse } from '@/lib/etabib/errors'
import { parseCaseId } from '@/lib/etabib/schemas'
import { getRoomPresence, getVideoSummary } from '@/lib/etabib/video'

export const dynamic = 'force-dynamic'

// GET /api/doctor/cases/[id]/video/status — session status + who is in the room
export async function GET(_req: Request, { params }: { params: { id: string } }) {
  try {
    await requireV1Doctor()
    const caseId = parseCaseId(params.id)
    const summary = await getVideoSummary(caseId)
    return NextResponse.json({
      success: true,
      session: summary ? { status: summary.status, scheduledAt: summary.scheduledAt, configured: summary.configured, patientJoinedAt: summary.patientJoinedAt } : null,
      presence: summary ? await getRoomPresence(caseId) : null,
    })
  } catch (error) {
    return errorResponse(error, 'doctor/video-status')
  }
}
