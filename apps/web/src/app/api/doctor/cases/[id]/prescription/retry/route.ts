import { NextRequest, NextResponse } from 'next/server'
import { requireV1Doctor } from '@/lib/etabib/auth'
import { errorResponse, validationErrorResponse } from '@/lib/etabib/errors'
import { parseCaseId, readJson, rxRetrySchema } from '@/lib/etabib/schemas'
import { retryOutboundJob } from '@/lib/etabib/cases'
import { dispatchOutboundJobs } from '@/lib/etabib/outbound'

// POST /api/doctor/cases/[id]/prescription/retry — retry a FAILED prescription
// message (same job, same rendered image; nothing is regenerated).
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const doctor = await requireV1Doctor()
    const parsed = rxRetrySchema.safeParse(await readJson(req))
    if (!parsed.success) return validationErrorResponse(parsed.error)
    const result = await retryOutboundJob(parseCaseId(params.id), parsed.data.jobId, { type: 'DOCTOR', id: doctor.id }, ['PRESCRIPTION_IMAGE', 'PRESCRIPTION_VOICE'])
    const [d] = await dispatchOutboundJobs(result.jobs.map((j) => j.id))
    return NextResponse.json({ success: true, dispatched: d?.dispatched ?? false })
  } catch (error) {
    return errorResponse(error, 'doctor/prescription-retry')
  }
}
