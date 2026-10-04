import { NextResponse } from 'next/server'
import { requireV1Doctor } from '@/lib/etabib/auth'
import { errorResponse } from '@/lib/etabib/errors'
import { parseCaseId } from '@/lib/etabib/schemas'
import { issueDoctorVideoToken } from '@/lib/etabib/video'

// POST /api/doctor/cases/[id]/video/token — authenticated V1 doctor only; room
// resolved from the case server-side (never from the client).
export async function POST(_req: Request, { params }: { params: { id: string } }) {
  try {
    const doctor = await requireV1Doctor()
    return NextResponse.json(await issueDoctorVideoToken(parseCaseId(params.id), { id: doctor.id, name: 'Dr. Jalaluddin' }))
  } catch (error) {
    return errorResponse(error, 'doctor/video-token')
  }
}
