import { NextRequest, NextResponse } from 'next/server'
import { requireV1Doctor } from '@/lib/etabib/auth'
import { EtabibError, errorResponse } from '@/lib/etabib/errors'
import { findCaseByRxCode } from '@/lib/etabib/rx/service'

export const dynamic = 'force-dynamic'

// GET /api/doctor/prescriptions/lookup?code=K7Q4M — find the consultation of a
// prescription ID (cases the doctor can see only).
export async function GET(req: NextRequest) {
  try {
    await requireV1Doctor()
    const found = await findCaseByRxCode(new URL(req.url).searchParams.get('code') ?? '')
    const visible =
      found &&
      (['AWAITING_DOCTOR_APPROVAL', 'CONFIRMED', 'IN_CONSULTATION', 'PRESCRIPTION_SENT', 'COMPLETED'].includes(found.status) ||
        (found.status === 'CANCELLED' && ['AWAITING_DOCTOR_APPROVAL', 'CONFIRMED'].includes(found.cancelledFromStatus ?? '')))
    if (!visible) throw new EtabibError('not_found', 'No prescription with this ID', 404)
    return NextResponse.json({ caseId: found.caseId })
  } catch (error) {
    return errorResponse(error, 'doctor/prescription-lookup')
  }
}
