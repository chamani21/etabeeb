import { NextRequest, NextResponse } from 'next/server'
import { requireHookKey } from '@/lib/etabib/auth'
import { errorResponse, validationErrorResponse } from '@/lib/etabib/errors'
import { outboundResultSchema, readJson } from '@/lib/etabib/schemas'
import { applyOutboundResult } from '@/lib/etabib/cases'
import { closeLiveKitRoom } from '@/lib/etabib/video'

// POST /api/hooks/outbound-result — delivery result from n8n "eTabib - Outbound Sender"
export async function POST(req: NextRequest) {
  try {
    requireHookKey(req)
    const parsed = outboundResultSchema.safeParse(await readJson(req))
    if (!parsed.success) return validationErrorResponse(parsed.error)

    const { jobId, idempotencyKey, consultationId, success, status, wamid, error } = parsed.data
    const outcome = await applyOutboundResult({
      success,
      ...(jobId ? { jobId } : {}),
      ...(idempotencyKey ? { idempotencyKey } : {}),
      ...(consultationId ? { consultationId } : {}),
      ...(status ? { status } : {}),
      ...(wamid ? { wamid } : {}),
      ...(error
        ? {
            error: {
              ...(error.code !== undefined ? { code: error.code } : {}),
              ...(error.message !== undefined ? { message: error.message } : {}),
            },
          }
        : {}),
    })
    const { videoRoomToClose, ...publicOutcome } = outcome
    // Case completed: disconnect anyone still in the video room (best effort)
    if (videoRoomToClose) await closeLiveKitRoom(videoRoomToClose)
    return NextResponse.json({ success: true, ...publicOutcome })
  } catch (error) {
    return errorResponse(error, 'hooks/outbound-result')
  }
}
