import { NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/etabib/auth'
import { errorResponse } from '@/lib/etabib/errors'
import { listStaffAccounts } from '@/lib/etabib/passwords'
import { maskPhone } from '@/lib/etabib/staff-audit'

// GET /api/admin/staff — staff accounts for password administration (no hashes)
export async function GET() {
  try {
    await requireAdmin()
    const staff = (await listStaffAccounts()).map((s) => ({ ...s, phoneE164: undefined, phone: maskPhone(s.phoneE164) }))
    return NextResponse.json({ success: true, staff })
  } catch (error) {
    return errorResponse(error, 'admin/staff')
  }
}
