import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { errorResponse, validationErrorResponse } from '@/lib/etabib/errors'
import { readJson } from '@/lib/etabib/schemas'
import { getPatientAccess } from '@/lib/etabib/video'

const bodySchema = z.object({ token: z.string().min(1).max(100) }).strict()

// POST /api/video/patient/access — public; the secure link token is the credential
// (sent in the body, never a query string). Returns join status + display info
// (doctor name, time). Never returns the case id, clinical data or room name.
export async function POST(req: NextRequest) {
  try {
    const parsed = bodySchema.safeParse(await readJson(req, 2 * 1024))
    if (!parsed.success) return validationErrorResponse(parsed.error)
    return NextResponse.json(await getPatientAccess(parsed.data.token))
  } catch (error) {
    return errorResponse(error, 'video/patient-access')
  }
}
