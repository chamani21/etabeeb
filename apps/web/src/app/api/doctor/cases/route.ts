import { NextResponse } from 'next/server'
import { requireV1Doctor } from '@/lib/etabib/auth'
import { errorResponse } from '@/lib/etabib/errors'
import { listCasesForDoctor } from '@/lib/etabib/queries'

// GET /api/doctor/cases — pending approvals, confirmed, in consultation, recently completed
export async function GET() {
  try {
    await requireV1Doctor()
    return NextResponse.json({ success: true, ...(await listCasesForDoctor()) })
  } catch (error) {
    return errorResponse(error, 'doctor/cases')
  }
}
