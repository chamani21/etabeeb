import { NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/etabib/auth'
import { EtabibError, errorResponse } from '@/lib/etabib/errors'
import { caseIdSchema, parseCaseId } from '@/lib/etabib/schemas'
import { retryOutboundJob } from '@/lib/etabib/cases'
import { dispatchOutboundJobs } from '@/lib/etabib/outbound'

// POST /api/admin/cases/[id]/outbox/[jobId]/retry — re-send a FAILED WhatsApp message (same idempotency key)
export async function POST(_req: Request, { params }: { params: { id: string; jobId: string } }) {
  try {
    const admin = await requireAdmin()
    const caseId = parseCaseId(params.id)
    if (!caseIdSchema.safeParse(params.jobId).success) throw new EtabibError('invalid_id', 'Invalid job id', 400)
    const result = await retryOutboundJob(caseId, params.jobId, { type: 'ADMIN', id: admin.id })
    const dispatch = await dispatchOutboundJobs(result.jobs.map((j) => j.id))
    return NextResponse.json({ success: true, jobId: params.jobId, dispatched: dispatch[0]?.dispatched ?? false, reason: dispatch[0]?.reason ?? null })
  } catch (error) {
    return errorResponse(error, 'admin/outbox-retry')
  }
}
