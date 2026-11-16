import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { errorResponse, validationErrorResponse } from '@/lib/etabib/errors'
import { readJson } from '@/lib/etabib/schemas'
import { issuePatientVideoToken } from '@/lib/etabib/video'

const bodySchema = z.object({ token: z.string().min(1).max(100) }).strict()

// POST /api/video/patient/token — exchange a valid patient link for a short-lived
// LiveKit token for exactly this case's room. The room is resolved server-side.
export async function POST(req: NextRequest) {
  try {
    const parsed = bodySchema.safeParse(await readJson(req, 2 * 1024))
    if (!parsed.success) return validationErrorResponse(parsed.error)
    return NextResponse.json(await issuePatientVideoToken(parsed.data.token))
  } catch (error) {
    return errorResponse(error, 'video/patient-token')
  }
}
