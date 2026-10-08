import { NextRequest, NextResponse } from 'next/server'
import { errorResponse } from '@/lib/etabib/errors'
import { requireInboxActor } from '@/lib/etabib/inbox/access'
import { conversationView } from '@/lib/etabib/inbox/queries'

export const dynamic = 'force-dynamic'

// GET /api/inbox/conversations/[id]?before=<iso> — conversation, a page of messages, notes, files, actions
export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const actor = await requireInboxActor()
    const raw = req.nextUrl.searchParams.get('before')
    const before = raw && !Number.isNaN(Date.parse(raw)) ? new Date(raw) : null
    return NextResponse.json(await conversationView(actor, params.id, { before }), { headers: { 'cache-control': 'private, no-store' } })
  } catch (error) {
    return errorResponse(error, 'inbox/view')
  }
}
