import { NextRequest, NextResponse } from 'next/server'
import { errorResponse } from '@/lib/etabib/errors'
import { requireInboxActor } from '@/lib/etabib/inbox/access'
import { LIST_FILTERS, listConversations, type ListFilter } from '@/lib/etabib/inbox/queries'

export const dynamic = 'force-dynamic'

// GET /api/inbox/conversations?filter=all|mine|admin_queue|doctor_queue|pending
export async function GET(req: NextRequest) {
  try {
    const actor = await requireInboxActor()
    const f = req.nextUrl.searchParams.get('filter') ?? 'all'
    const filter: ListFilter = (LIST_FILTERS as readonly string[]).includes(f) ? (f as ListFilter) : 'all'
    return NextResponse.json({ conversations: await listConversations(actor, filter) }, { headers: { 'cache-control': 'private, no-store' } })
  } catch (error) {
    return errorResponse(error, 'inbox/list')
  }
}
