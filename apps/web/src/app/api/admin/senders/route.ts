import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/etabib/auth'
import { errorResponse, validationErrorResponse } from '@/lib/etabib/errors'
import { readJson, senderCreateSchema } from '@/lib/etabib/schemas'
import { createSender, listSenders } from '@/lib/etabib/senders'
import { getInboundPolicy } from '@/lib/etabib/inbound-policy'

// Per-request data behind a session: never prerender or cache at build time
export const dynamic = 'force-dynamic'

// GET /api/admin/senders — WhatsApp sender allow-list (+ current inbound policy, read-only)
export async function GET() {
  try {
    await requireAdmin()
    return NextResponse.json({ success: true, senders: await listSenders(), policy: getInboundPolicy() })
  } catch (error) {
    return errorResponse(error, 'admin/senders')
  }
}

// POST /api/admin/senders — add a number (normalized to E.164; duplicates rejected)
export async function POST(req: NextRequest) {
  try {
    const admin = await requireAdmin()
    const parsed = senderCreateSchema.safeParse(await readJson(req))
    if (!parsed.success) return validationErrorResponse(parsed.error)
    const sender = await createSender(
      { phone: parsed.data.phone, label: parsed.data.label, purpose: parsed.data.purpose, notes: parsed.data.notes ?? null },
      { id: admin.id, type: 'ADMIN' },
    )
    return NextResponse.json({ success: true, sender }, { status: 201 })
  } catch (error) {
    return errorResponse(error, 'admin/senders-create')
  }
}
