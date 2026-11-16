import { NextRequest, NextResponse } from 'next/server'
import { requireHookKey } from '@/lib/etabib/auth'
import { errorResponse } from '@/lib/etabib/errors'
import { dispatchPendingOutboundJobs } from '@/lib/etabib/outbound'
import { recordSchedulerHeartbeat } from '@/lib/etabib/queries'
import { isInboxEnabled } from '@/lib/etabib/inbox/core'
import { retryPendingMediaFetches } from '@/lib/etabib/inbox/media'

// POST /api/hooks/outbox-dispatch — called by n8n "eTabib - Scheduler" (shared-key auth).
// Re-dispatches a bounded batch of pending V1 outbox jobs to the Outbound Sender.
export async function POST(req: NextRequest) {
  try {
    requireHookKey(req)
    const results = await dispatchPendingOutboundJobs(20)
    const summary = { attempted: results.length, dispatched: results.filter((r) => r.dispatched).length }
    // Shared inbox: patient files whose download was never requested or got stuck
    if (isInboxEnabled()) await retryPendingMediaFetches(5).catch(() => undefined)
    // Heartbeat for the admin status page; never fails the dispatch
    await recordSchedulerHeartbeat(summary).catch(() => undefined)
    return NextResponse.json({ success: true, ...summary })
  } catch (error) {
    return errorResponse(error, 'hooks/outbox-dispatch')
  }
}
