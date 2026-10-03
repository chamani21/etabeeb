import { NextResponse } from 'next/server'
import { requireV1Doctor } from '@/lib/etabib/auth'
import { errorResponse } from '@/lib/etabib/errors'
import { listCasesForDoctor } from '@/lib/etabib/queries'

// Per-request data behind a session: never prerender or cache at build time
export const dynamic = 'force-dynamic'

// GET /api/doctor/cases — pending approvals, confirmed, in consultation, recently completed
export async function GET() {
  try {
    await requireV1Doctor()
    return NextResponse.json({ success: true, ...(await listCasesForDoctor()) })
  } catch (error) {
    return errorResponse(error, 'doctor/cases')
  }
}
