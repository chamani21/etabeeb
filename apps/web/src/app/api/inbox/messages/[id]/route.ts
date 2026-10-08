import { NextRequest, NextResponse } from 'next/server'
import { errorResponse, validationErrorResponse } from '@/lib/etabib/errors'
import { readJson } from '@/lib/etabib/schemas'
import { requireInboxActor } from '@/lib/etabib/inbox/access'
import { linkMessageToCase } from '@/lib/etabib/inbox/files'
import { messagePatchSchema } from '@/lib/etabib/inbox/schemas'

// PATCH /api/inbox/messages/[id] — explicit case association ("Case association needed")
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const actor = await requireInboxActor()
    const parsed = messagePatchSchema.safeParse(await readJson(req, 4 * 1024))
    if (!parsed.success) return validationErrorResponse(parsed.error)
    await linkMessageToCase(actor, params.id, parsed.data.caseId)
    return NextResponse.json({ success: true })
  } catch (error) {
    return errorResponse(error, 'inbox/message-case')
  }
}
