import { NextRequest, NextResponse } from 'next/server'
import { requireHookKey } from '@/lib/etabib/auth'
import { errorResponse } from '@/lib/etabib/errors'
import { parseJsonBody, readRawBody } from '@/lib/etabib/schemas'
import { checkMetaVerification, requireMetaSignature } from '@/lib/etabib/meta-signature'
import { extractInboundMessages, processInboundMessage } from '@/lib/etabib/whatsapp'
import { dispatchOutboundJobs } from '@/lib/etabib/outbound'

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
