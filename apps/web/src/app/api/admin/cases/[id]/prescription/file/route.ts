import { NextRequest } from 'next/server'
import { requireAdmin } from '@/lib/etabib/auth'
import { errorResponse } from '@/lib/etabib/errors'
import { parseCaseId } from '@/lib/etabib/schemas'
import { prescriptionFileResponse } from '@/lib/etabib/rx/file-response'

// GET /api/admin/cases/[id]/prescription/file?rx=&kind=image|pdf&page=&download=1 (view/download only)
export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    await requireAdmin()
    return await prescriptionFileResponse(req, parseCaseId(params.id))
  } catch (error) {
    return errorResponse(error, 'admin/prescription-file')
  }
}
