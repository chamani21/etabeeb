import { NextRequest, NextResponse } from 'next/server'
import { requireV1Doctor } from '@/lib/etabib/auth'
import { errorResponse, validationErrorResponse } from '@/lib/etabib/errors'
import { casePrescriptionSchema, parseCaseId, readJson } from '@/lib/etabib/schemas'
import { createCasePrescription } from '@/lib/etabib/cases'
import { dispatchOutboundJobs } from '@/lib/etabib/outbound'

// POST /api/doctor/cases/[id]/prescription — save + sign the case prescription
// (existing prescriptions module) and queue PRESCRIPTION_READY for n8n delivery.
// The case only becomes PRESCRIPTION_SENT when n8n confirms delivery.
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const doctor = await requireV1Doctor()
    const caseId = parseCaseId(params.id)
    const parsed = casePrescriptionSchema.safeParse(await readJson(req))
    if (!parsed.success) return validationErrorResponse(parsed.error)

    const { items, diagnosis, investigations, advice, followUp, notes } = parsed.data
    const result = await createCasePrescription(caseId, items, { type: 'DOCTOR', id: doctor.id }, {
      diagnosis: diagnosis ?? null,
      investigations: investigations ?? null,
      advice: advice ?? null,
      followUp: followUp ?? null,
      notes: notes ?? null,
    })
    await dispatchOutboundJobs(result.jobs.filter((j) => j.created).map((j) => j.id))
    return NextResponse.json(
      {
        success: true,
        case: result.case,
        prescription: {
          id: result.prescription.publicId,
          verificationToken: result.prescription.verificationToken,
          signedAt: result.prescription.signedAt,
        },
      },
      { status: 201 },
    )
  } catch (error) {
    return errorResponse(error, 'doctor/prescription')
  }
}
