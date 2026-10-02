import { NextRequest, NextResponse } from 'next/server'
import { requireHookKey } from '@/lib/etabib/auth'
import { errorResponse } from '@/lib/etabib/errors'
import { readJson } from '@/lib/etabib/schemas'
import { extractInboundMessages, processInboundMessage } from '@/lib/etabib/whatsapp'
import { dispatchOutboundJobs } from '@/lib/etabib/outbound'

// POST /api/hooks/whatsapp — forwarded Meta webhook from n8n (shared-key auth)
export async function POST(req: NextRequest) {
  try {
    requireHookKey(req)
    const body = await readJson(req, 256 * 1024)
    const messages = extractInboundMessages(body)
    if (messages.length === 0) {
      // Status callbacks / unsupported events: acknowledge so Meta does not retry
      return NextResponse.json({ success: true, processed: 0, results: [] })
    }

    const results = []
    for (const message of messages) {
      results.push(await processInboundMessage(message))
    }
    // Dispatch only newly created jobs, after the transactions committed
    await dispatchOutboundJobs(results.flatMap((r) => r.jobs.filter((j) => j.created).map((j) => j.id)))

    return NextResponse.json({
      success: true,
      processed: results.filter((r) => !r.duplicate).length,
      results: results.map((r) => ({
        wamid: r.wamid,
        duplicate: r.duplicate,
        outcome: r.outcome,
        consultationId: r.consultationId,
        status: r.status,
        jobs: r.jobs.map((j) => ({ id: j.id, type: j.type })),
      })),
    })
  } catch (error) {
    return errorResponse(error, 'hooks/whatsapp')
  }
}
