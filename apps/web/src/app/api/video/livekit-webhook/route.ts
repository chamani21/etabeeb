import { NextRequest, NextResponse } from 'next/server'
import { errorResponse } from '@/lib/etabib/errors'
import { readRawBody } from '@/lib/etabib/schemas'
import { handleLiveKitWebhook } from '@/lib/etabib/video-webhook'

// POST /api/video/livekit-webhook — LiveKit server webhooks (signed with the API
// key/secret; verified by WebhookReceiver). Records join/leave audit events and
// queues the room-join WhatsApp notices (dispatched after commit, not awaited).
export async function POST(req: NextRequest) {
  try {
    const raw = await readRawBody(req, 64 * 1024)
    const result = await handleLiveKitWebhook(raw, req.headers.get('authorization'))
    return NextResponse.json({ success: true, ...result })
  } catch (error) {
    return errorResponse(error, 'video/livekit-webhook')
  }
}
