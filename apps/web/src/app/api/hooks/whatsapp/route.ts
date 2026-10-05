import { NextRequest, NextResponse } from 'next/server'
import { requireHookKey } from '@/lib/etabib/auth'
import { errorResponse } from '@/lib/etabib/errors'
import { parseJsonBody, readRawBody } from '@/lib/etabib/schemas'
import { checkMetaVerification, requireMetaSignature } from '@/lib/etabib/meta-signature'
import { extractInboundMessages, processInboundMessage } from '@/lib/etabib/whatsapp'
import { dispatchOutboundJobs, heldMediaJobsForCase } from '@/lib/etabib/outbound'
import { applyDeliveryStatus, extractDeliveryStatuses } from '@/lib/etabib/delivery'

// GET /api/hooks/whatsapp — Meta webhook verification, relayed by n8n (shared-key auth).
// The verify token lives only in the app environment, never in n8n.
export async function GET(req: NextRequest) {
  try {
    requireHookKey(req)
    const challenge = checkMetaVerification(req.nextUrl.searchParams)
    if (challenge === null) return new NextResponse('Forbidden', { status: 403 })
    return new NextResponse(challenge, { status: 200, headers: { 'Content-Type': 'text/plain' } })
  } catch (error) {
    return errorResponse(error, 'hooks/whatsapp-verify')
  }
}

// POST /api/hooks/whatsapp — forwarded Meta webhook from n8n (shared-key auth +
// original Meta X-Hub-Signature-256 verification over the unmodified raw body)
export async function POST(req: NextRequest) {
  try {
    requireHookKey(req)
    const raw = await readRawBody(req, 256 * 1024)
    requireMetaSignature(raw, req.headers.get('x-hub-signature-256'))
    const body = parseJsonBody(raw)
    const messages = extractInboundMessages(body)
    // Delivery receipts (statuses[]) update outbox jobs only — never cases
    const statusUpdates = []
    for (const status of extractDeliveryStatuses(body)) statusUpdates.push(await applyDeliveryStatus(status))
    const statusSummary = { received: statusUpdates.length, applied: statusUpdates.filter((u) => u.changed).length }
    if (messages.length === 0) {
      // Status-only / unsupported events: acknowledge so Meta does not retry
      return NextResponse.json({ success: true, processed: 0, results: [], statuses: statusSummary })
    }

    const results = []
    for (const message of messages) {
      results.push(await processInboundMessage(message))
    }
    // Dispatch only newly created jobs, after the transactions committed
    await dispatchOutboundJobs(results.flatMap((r) => r.jobs.filter((j) => j.created).map((j) => j.id)))
    // The patient wrote: Meta's 24-hour window is open — release prescription media held for it
    const patientCases = [...new Set(results.filter((r) => !r.duplicate && r.outcome !== 'ignored' && r.consultationId).map((r) => r.consultationId!))]
    for (const caseId of patientCases) await dispatchOutboundJobs(await heldMediaJobsForCase(caseId))

    return NextResponse.json({
      success: true,
      processed: results.filter((r) => !r.duplicate && r.outcome !== 'ignored').length,
      statuses: statusSummary,
      results: results.map((r) => ({
        wamid: r.wamid,
        duplicate: r.duplicate,
        outcome: r.outcome,
        ...(r.disposition ? { disposition: r.disposition } : {}),
        consultationId: r.consultationId,
        status: r.status,
        jobs: r.jobs.map((j) => ({ id: j.id, type: j.type })),
      })),
    })
  } catch (error) {
    return errorResponse(error, 'hooks/whatsapp')
  }
}
