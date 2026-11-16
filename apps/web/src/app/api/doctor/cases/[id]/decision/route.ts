import { NextRequest, NextResponse } from 'next/server'
import { requireV1Doctor } from '@/lib/etabib/auth'
import { errorResponse, validationErrorResponse } from '@/lib/etabib/errors'
import { doctorDecisionSchema, parseCaseId, readJson } from '@/lib/etabib/schemas'
import { applyDoctorDecision, type DoctorDecisionInput } from '@/lib/etabib/cases'
import { dispatchOutboundJobs } from '@/lib/etabib/outbound'

// POST /api/doctor/cases/[id]/decision — Dr. Jalaluddin's time decision
// APPROVED (+approvedTime) → CONFIRMED; other decisions never confirm.
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const doctor = await requireV1Doctor()
    const caseId = parseCaseId(params.id)
    const parsed = doctorDecisionSchema.safeParse(await readJson(req))
    if (!parsed.success) return validationErrorResponse(parsed.error)

    const d = parsed.data
    let input: DoctorDecisionInput
    switch (d.decision) {
      case 'APPROVED':
        input = { decision: 'APPROVED', approvedTime: d.approvedTime, consultationLink: d.consultationLink ?? null }
        break
      case 'PROPOSE_NEW_TIME':
        // refine() guarantees one of the two is present
        input = { decision: 'PROPOSE_NEW_TIME', proposedTime: (d.proposedTime ?? d.approvedTime) as Date }
        break
      default:
        input = { decision: d.decision }
    }

    const result = await applyDoctorDecision(caseId, input, { type: 'DOCTOR', id: doctor.id })
    await dispatchOutboundJobs(result.jobs.filter((j) => j.created).map((j) => j.id))
    return NextResponse.json({ success: true, changed: result.changed, case: result.case })
  } catch (error) {
    return errorResponse(error, 'doctor/decision')
  }
}
