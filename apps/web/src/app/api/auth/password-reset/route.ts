import { NextRequest, NextResponse } from 'next/server'
import { errorResponse, validationErrorResponse } from '@/lib/etabib/errors'
import { passwordResetCompleteSchema, readJson } from '@/lib/etabib/schemas'
import { completePasswordReset } from '@/lib/etabib/passwords'

// POST /api/auth/password-reset — complete an admin-issued reset (public; the
// one-time token is the credential). The token arrives in the JSON body, never
// in the URL. All of the user's sessions are revoked on success.
export async function POST(req: NextRequest) {
  try {
    const parsed = passwordResetCompleteSchema.safeParse(await readJson(req, 4 * 1024))
    if (!parsed.success) return validationErrorResponse(parsed.error)
    await completePasswordReset(parsed.data)
    return NextResponse.json({ success: true })
  } catch (error) {
    return errorResponse(error, 'auth/password-reset')
  }
}
