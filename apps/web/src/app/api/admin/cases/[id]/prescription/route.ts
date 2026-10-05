import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/etabib/auth'
import { errorResponse } from '@/lib/etabib/errors'
import { parseCaseId } from '@/lib/etabib/schemas'
import { prescriptionState } from '@/lib/etabib/rx/service'

export const dynamic = 'force-dynamic'

// GET /api/admin/cases/[id]/prescription — read-only prescription + delivery status
export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  try {
    await requireAdmin()
    return NextResponse.json(await prescriptionState(parseCaseId(params.id), { forAdmin: true }))
  } catch (error) {
    return errorResponse(error, 'admin/prescription')
  }
}
