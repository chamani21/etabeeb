import { NextRequest, NextResponse } from 'next/server'
import { EtabibError, errorResponse } from '@/lib/etabib/errors'
import { dispatchOutboundJobs } from '@/lib/etabib/outbound'
import { VOICE_MAX_BYTES } from '@/lib/etabib/rx/audio'
import { requireInboxActor } from '@/lib/etabib/inbox/access'
import { multipartMeta } from '@/lib/etabib/inbox/schemas'
import { sendAudio } from '@/lib/etabib/inbox/send'

export const dynamic = 'force-dynamic'

// POST /api/inbox/conversations/[id]/audio — recorded voice message (multipart: audio, clientRequestKey, expectedVersion)
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const actor = await requireInboxActor()
    if (Number(req.headers.get('content-length') ?? 0) > VOICE_MAX_BYTES + 64 * 1024) throw new EtabibError('invalid_audio', 'The recording is too large (max 10 MB)', 413)
    const form = await req.formData().catch(() => null)
    const file = form?.get('audio')
    if (!form || !(file instanceof Blob)) throw new EtabibError('invalid_audio', 'No recording received', 400)
    let meta
    try {
      meta = multipartMeta(form)
    } catch {
      throw new EtabibError('validation_error', 'Invalid request', 400)
    }
    const r = await sendAudio(params.id, actor, { data: Buffer.from(await file.arrayBuffer()), mimeType: file.type || 'application/octet-stream', ...meta })
    if (!r.duplicate && r.jobId) await dispatchOutboundJobs([r.jobId])
    return NextResponse.json({ success: true, ...r }, { status: r.duplicate ? 200 : 201 })
  } catch (error) {
    return errorResponse(error, 'inbox/send-audio')
  }
}
