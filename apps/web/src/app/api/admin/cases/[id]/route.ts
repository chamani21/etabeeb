import { NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/etabib/auth'
import { errorResponse } from '@/lib/etabib/errors'
import { parseCaseId } from '@/lib/etabib/schemas'
import { getCaseDetailForAdmin } from '@/lib/etabib/queries'

// Per-request data behind a session: never prerender or cache at build time
export const dynamic = 'force-dynamic'

// GET /api/admin/cases/[id] — full case, audit trail, outbox (masked recipients), prescription
export async function GET(_req: Request, { params }: { params: { id: string } }) {
  try {
    await requireAdmin()
    return NextResponse.json({ success: true, ...(await getCaseDetailForAdmin(parseCaseId(params.id))) })
  } catch (error) {
    return errorResponse(error, 'admin/case-detail')
  }
}
