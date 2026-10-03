import { NextResponse } from 'next/server'
import { requireV1Doctor } from '@/lib/etabib/auth'
import { errorResponse } from '@/lib/etabib/errors'
import { parseCaseId } from '@/lib/etabib/schemas'
import { getCaseDetailForDoctor } from '@/lib/etabib/queries'

// GET /api/doctor/cases/[id] — clinical view (no payment amount/reference/confirmer)
export async function GET(_req: Request, { params }: { params: { id: string } }) {
  try {
    await requireV1Doctor()
    return NextResponse.json({ success: true, ...(await getCaseDetailForDoctor(parseCaseId(params.id))) })
  } catch (error) {
    return errorResponse(error, 'doctor/case-detail')
  }
}
