import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { errorResponse, validationErrorResponse } from '@/lib/etabib/errors'
import { readJson } from '@/lib/etabib/schemas'
import { dispatchOutboundJobs } from '@/lib/etabib/outbound'
import { requireInboxActor } from '@/lib/etabib/inbox/access'
import { sendReplyInvite } from '@/lib/etabib/inbox/send'

const schema = z.object({ clientRequestKey: z.string().regex(/^[A-Za-z0-9_-]{8,64}$/), expectedVersion: z.number().int().min(1) }).strict()

// POST /api/inbox/conversations/[id]/invite — approved reply-invitation template (window closed only)
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const actor = await requireInboxActor()
    const parsed = schema.safeParse(await readJson(req, 4 * 1024))
    if (!parsed.success) return validationErrorResponse(parsed.error)
    const r = await sendReplyInvite(params.id, actor, parsed.data)
    if (!r.duplicate && r.jobId) await dispatchOutboundJobs([r.jobId])
    return NextResponse.json({ success: true, ...r }, { status: r.duplicate ? 200 : 201 })
  } catch (error) {
    return errorResponse(error, 'inbox/invite')
  }
}
