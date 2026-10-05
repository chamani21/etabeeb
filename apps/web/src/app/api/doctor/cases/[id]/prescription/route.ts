import { NextRequest, NextResponse } from 'next/server'
import { requireV1Doctor } from '@/lib/etabib/auth'
import { errorResponse, validationErrorResponse } from '@/lib/etabib/errors'
import { parseCaseId, readJson, rxDraftSchema } from '@/lib/etabib/schemas'
import { prescriptionState, saveDraft } from '@/lib/etabib/rx/service'

export const dynamic = 'force-dynamic'

// GET /api/doctor/cases/[id]/prescription — current revision (draft or finalized),
// revisions, voice notes, per-message delivery status, previous prescriptions.
export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  try {
    await requireV1Doctor()
    return NextResponse.json(await prescriptionState(parseCaseId(params.id)))
  } catch (error) {
    return errorResponse(error, 'doctor/prescription')
  }
}

// POST /api/doctor/cases/[id]/prescription — save the DRAFT (a finalized
// prescription is never edited: create an amendment instead).
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const doctor = await requireV1Doctor()
    const caseId = parseCaseId(params.id)
    const parsed = rxDraftSchema.safeParse(await readJson(req, 128 * 1024))
    if (!parsed.success) return validationErrorResponse(parsed.error)
    const rx = await saveDraft(caseId, parsed.data, { type: 'DOCTOR', id: doctor.id })
    return NextResponse.json({ success: true, prescriptionId: rx.id, revision: rx.revision, status: rx.workflowStatus })
  } catch (error) {
    return errorResponse(error, 'doctor/prescription')
  }
}
