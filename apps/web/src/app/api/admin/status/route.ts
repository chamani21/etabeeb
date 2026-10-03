import { NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/etabib/auth'
import { errorResponse } from '@/lib/etabib/errors'
import { getOperationalStatus } from '@/lib/etabib/queries'

// GET /api/admin/status — read-only operational control panel (no secrets)
export async function GET() {
  try {
    await requireAdmin()
    return NextResponse.json({ success: true, status: await getOperationalStatus() })
  } catch (error) {
    return errorResponse(error, 'admin/status')
  }
}
