import { NextRequest, NextResponse } from 'next/server'
import { requireV1Doctor } from '@/lib/etabib/auth'
import { errorResponse, validationErrorResponse } from '@/lib/etabib/errors'
import { parseCaseId, readJson, rxCopySchema } from '@/lib/etabib/schemas'
import { copyMedicinesIntoDraft } from '@/lib/etabib/rx/service'

// POST /api/doctor/cases/[id]/prescription/copy — copy medicines of a previous
// prescription (same patient) into this case's draft. The old one is untouched.
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const doctor = await requireV1Doctor()
    const parsed = rxCopySchema.safeParse(await readJson(req))
    if (!parsed.success) return validationErrorResponse(parsed.error)
    const rx = await copyMedicinesIntoDraft(parseCaseId(params.id), parsed.data.fromPrescriptionId, { type: 'DOCTOR', id: doctor.id })
    return NextResponse.json({ success: true, prescriptionId: rx.id })
  } catch (error) {
    return errorResponse(error, 'doctor/prescription-copy')
  }
}
