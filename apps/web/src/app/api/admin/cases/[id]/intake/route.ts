import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/etabib/auth'
import { errorResponse, validationErrorResponse } from '@/lib/etabib/errors'
import { intakeSchema, parseCaseId, readJson } from '@/lib/etabib/schemas'
import { submitAdminIntake } from '@/lib/etabib/cases'

// POST /api/admin/cases/[id]/intake — admin clinical intake
// ADMIN_INTAKE → INTAKE_COMPLETE → AWAITING_PAYMENT
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const admin = await requireAdmin()
    const caseId = parseCaseId(params.id)
    const parsed = intakeSchema.safeParse(await readJson(req))
    if (!parsed.success) return validationErrorResponse(parsed.error)

    const { medicalHistory, patientName, patientPhone, ...required } = parsed.data
    const result = await submitAdminIntake(
      caseId,
      {
        ...required,
        medicalHistory: medicalHistory ?? null,
        ...(patientName ? { patientName } : {}),
        ...(patientPhone ? { patientPhone } : {}),
      },
      { type: 'ADMIN', id: admin.id },
    )
    return NextResponse.json({ success: true, changed: result.changed, case: result.case })
  } catch (error) {
    return errorResponse(error, 'admin/intake')
  }
}
