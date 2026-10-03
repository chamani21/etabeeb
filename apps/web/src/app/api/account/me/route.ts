import { NextResponse } from 'next/server'
import { getCurrentUser } from '@/lib/auth-helpers'
import { errorResponse } from '@/lib/etabib/errors'
import { requireStaffSession } from '@/lib/etabib/auth'

// GET /api/account/me — signed-in staff identity for the UI (no secrets)
export async function GET() {
  try {
    await requireStaffSession()
    const user = await getCurrentUser()
    return NextResponse.json({
      success: true,
      user: { displayName: user?.displayName ?? null, role: user?.role ?? null, mustChangePassword: Boolean(user?.mustChangePassword) },
    })
  } catch (error) {
    return errorResponse(error, 'account/me')
  }
}
