import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/etabib/auth'
import { errorResponse, validationErrorResponse } from '@/lib/etabib/errors'
import { caseListQuerySchema } from '@/lib/etabib/schemas'
import { listCasesForAdmin, statusCounts } from '@/lib/etabib/queries'

// Per-request data behind a session: never prerender or cache at build time
export const dynamic = 'force-dynamic'

// GET /api/admin/cases?status=OPEN|ALL|<STATUS>&q=<case id | phone | name>
export async function GET(req: NextRequest) {
  try {
    await requireAdmin()
    const parsed = caseListQuerySchema.safeParse(Object.fromEntries(req.nextUrl.searchParams))
    if (!parsed.success) return validationErrorResponse(parsed.error)
    const [cases, counts] = await Promise.all([listCasesForAdmin(parsed.data), statusCounts()])
    return NextResponse.json({ success: true, cases, counts })
  } catch (error) {
    return errorResponse(error, 'admin/cases')
  }
}
