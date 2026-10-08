import { NextResponse } from 'next/server'
import { errorResponse } from '@/lib/etabib/errors'
import { requireInboxActor } from '@/lib/etabib/inbox/access'
import { inboxSummary } from '@/lib/etabib/inbox/queries'

export const dynamic = 'force-dynamic'

// GET /api/inbox/summary — badge counts for the staff navigation
export async function GET() {
  try {
    const actor = await requireInboxActor()
    return NextResponse.json(await inboxSummary(actor), { headers: { 'cache-control': 'private, no-store' } })
  } catch (error) {
    return errorResponse(error, 'inbox/summary')
  }
}
