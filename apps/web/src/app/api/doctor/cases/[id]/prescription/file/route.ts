import { NextRequest } from 'next/server'
import { requireV1Doctor } from '@/lib/etabib/auth'
import { errorResponse } from '@/lib/etabib/errors'
import { parseCaseId } from '@/lib/etabib/schemas'
import { prescriptionFileResponse } from '@/lib/etabib/rx/file-response'

// GET /api/doctor/cases/[id]/prescription/file?rx=&kind=image|pdf&page=&download=1
export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    await requireV1Doctor()
    return await prescriptionFileResponse(req, parseCaseId(params.id))
  } catch (error) {
    return errorResponse(error, 'doctor/prescription-file')
  }
}
