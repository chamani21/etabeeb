import { NextRequest, NextResponse } from 'next/server'
import { requireStaffSession } from '@/lib/etabib/auth'
import { errorResponse, validationErrorResponse } from '@/lib/etabib/errors'
import { passwordChangeSchema, readJson } from '@/lib/etabib/schemas'
import { changeOwnPassword } from '@/lib/etabib/passwords'

// POST /api/account/password — change own password (allowed while rotation is forced).
// All sessions (including this one) are revoked; the user signs in again.
export async function POST(req: NextRequest) {
  try {
    const staff = await requireStaffSession()
    const parsed = passwordChangeSchema.safeParse(await readJson(req, 4 * 1024))
    if (!parsed.success) return validationErrorResponse(parsed.error)
    await changeOwnPassword({ userId: staff.id, role: staff.role, ...parsed.data })
    return NextResponse.json({ success: true, sessionsRevoked: true })
  } catch (error) {
    return errorResponse(error, 'account/password')
  }
}
