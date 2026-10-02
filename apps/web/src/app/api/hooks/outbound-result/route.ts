import { NextRequest, NextResponse } from 'next/server'
import { requireHookKey } from '@/lib/etabib/auth'
import { errorResponse, validationErrorResponse } from '@/lib/etabib/errors'
import { outboundResultSchema, readJson } from '@/lib/etabib/schemas'
import { applyOutboundResult } from '@/lib/etabib/cases'

// POST /api/hooks/outbound-result — delivery result from n8n "eTabib - Outbound Sender"
export async function POST(req: NextRequest) {
  try {
    requireHookKey(req)
    const parsed = outboundResultSchema.safeParse(await readJson(req))
    if (!parsed.success) return validationErrorResponse(parsed.error)

    const { jobId, idempotencyKey, consultationId, success, status, wamid, error } = parsed.data
    const outcome = await applyOutboundResult({
      success,
      ...(jobId ? { jobId } : {}),
      ...(idempotencyKey ? { idempotencyKey } : {}),
      ...(consultationId ? { consultationId } : {}),
      ...(status ? { status } : {}),
      ...(wamid ? { wamid } : {}),
      ...(error
        ? {
            error: {
              ...(error.code !== undefined ? { code: error.code } : {}),
              ...(error.message !== undefined ? { message: error.message } : {}),
            },
          }
        : {}),
    })
    return NextResponse.json({ success: true, ...outcome })
  } catch (error) {
    return errorResponse(error, 'hooks/outbound-result')
  }
}
