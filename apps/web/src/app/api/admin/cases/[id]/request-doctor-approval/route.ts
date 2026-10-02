import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/etabib/auth'
import { errorResponse, validationErrorResponse } from '@/lib/etabib/errors'
import { parseCaseId, readJson, requestApprovalSchema } from '@/lib/etabib/schemas'
import { requestDoctorApproval } from '@/lib/etabib/cases'
import { dispatchOutboundJobs } from '@/lib/etabib/outbound'

// POST /api/admin/cases/[id]/request-doctor-approval — ask Dr. Jalaluddin to approve a time
// PAYMENT_RECEIVED → AWAITING_DOCTOR_APPROVAL (+ DOCTOR_APPROVAL_REQUEST outbound job)
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const admin = await requireAdmin()
    const caseId = parseCaseId(params.id)
    const parsed = requestApprovalSchema.safeParse(await readJson(req))
    if (!parsed.success) return validationErrorResponse(parsed.error)

    const result = await requestDoctorApproval(caseId, parsed.data.proposedConsultationTime, {
      type: 'ADMIN',
      id: admin.id,
    })
    await dispatchOutboundJobs(result.jobs.filter((j) => j.created).map((j) => j.id))
    return NextResponse.json({ success: true, changed: result.changed, case: result.case })
  } catch (error) {
    return errorResponse(error, 'admin/request-doctor-approval')
  }
}
