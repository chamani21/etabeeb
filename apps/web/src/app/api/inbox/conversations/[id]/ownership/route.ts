import { NextRequest, NextResponse } from 'next/server'
import { errorResponse, validationErrorResponse } from '@/lib/etabib/errors'
import { readJson } from '@/lib/etabib/schemas'
import { dispatchOutboundJobs } from '@/lib/etabib/outbound'
import { requireInboxActor, viewableConversation } from '@/lib/etabib/inbox/access'
import { changeOwnership } from '@/lib/etabib/inbox/ownership'
import { ownershipSchema } from '@/lib/etabib/inbox/schemas'

// POST /api/inbox/conversations/[id]/ownership — take over / request doctor / accept / decline / return / take back / resume bot
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const actor = await requireInboxActor()
    const parsed = ownershipSchema.safeParse(await readJson(req, 16 * 1024))
    if (!parsed.success) return validationErrorResponse(parsed.error)
    await viewableConversation(actor, params.id)
    const r = await changeOwnership(params.id, actor, parsed.data)
    if (r.noticeJobIds.length) await dispatchOutboundJobs(r.noticeJobIds)
    const { noticeJobIds, ...state } = r
    return NextResponse.json({ success: true, ...state, noticeQueued: noticeJobIds.length > 0 })
  } catch (error) {
    return errorResponse(error, 'inbox/ownership')
  }
}
