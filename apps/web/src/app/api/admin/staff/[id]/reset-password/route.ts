import { NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/etabib/auth'
import { EtabibError, errorResponse } from '@/lib/etabib/errors'
import { caseIdSchema } from '@/lib/etabib/schemas'
import { issuePasswordReset } from '@/lib/etabib/passwords'
import { getAppUrl } from '@/lib/etabib/config'

// POST /api/admin/staff/[id]/reset-password — one-time reset link (30 min).
// The link is returned ONCE to the admin for hand-over and is never logged.
// The token travels in the URL fragment (#token=…), which browsers do not send
// to the server, so it cannot appear in access logs.
export async function POST(_req: Request, { params }: { params: { id: string } }) {
  try {
    const admin = await requireAdmin()
    if (!caseIdSchema.safeParse(params.id).success) throw new EtabibError('invalid_id', 'Invalid user id', 400)
    const { token, expiresAt } = await issuePasswordReset({ targetUserId: params.id, adminId: admin.id })
    const base = getAppUrl() ?? ''
    return NextResponse.json({ success: true, resetUrl: `${base}/reset-password#token=${token}`, expiresAt })
  } catch (error) {
    return errorResponse(error, 'admin/staff-reset')
  }
}
