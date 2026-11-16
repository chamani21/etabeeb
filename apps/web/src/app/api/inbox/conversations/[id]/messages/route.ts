import { NextRequest, NextResponse } from 'next/server'
import { errorResponse, validationErrorResponse } from '@/lib/etabib/errors'
import { readJson } from '@/lib/etabib/schemas'
import { dispatchOutboundJobs } from '@/lib/etabib/outbound'
import { requireInboxActor } from '@/lib/etabib/inbox/access'
import { sendTextSchema } from '@/lib/etabib/inbox/schemas'
import { sendText } from '@/lib/etabib/inbox/send'

// POST /api/inbox/conversations/[id]/messages — owner's text reply to the patient (existing outbox → n8n)
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const actor = await requireInboxActor()
    const parsed = sendTextSchema.safeParse(await readJson(req, 32 * 1024))
    if (!parsed.success) return validationErrorResponse(parsed.error)
    const r = await sendText(params.id, actor, parsed.data)
    if (!r.duplicate && r.jobId) await dispatchOutboundJobs([r.jobId])
    return NextResponse.json({ success: true, ...r }, { status: r.duplicate ? 200 : 201 })
  } catch (error) {
    return errorResponse(error, 'inbox/send-text')
  }
}
