import { NextResponse } from 'next/server'
import { eq } from 'drizzle-orm'
import { db } from '@etabeeb/db'
import { consultationCases } from '@etabeeb/db/schema'
import { errorResponse } from '@/lib/etabib/errors'
import { parseCaseId } from '@/lib/etabib/schemas'
import { canView, requireInboxActor } from '@/lib/etabib/inbox/access'
import { conversationByPhone } from '@/lib/etabib/inbox/core'

export const dynamic = 'force-dynamic'

// GET /api/inbox/by-case/[caseId] — the WhatsApp conversation of a case's contact (for the case page)
export async function GET(_req: Request, { params }: { params: { caseId: string } }) {
  try {
    const actor = await requireInboxActor()
    const caseId = parseCaseId(params.caseId)
    const [c] = await db.select({ phone: consultationCases.whatsappPhone }).from(consultationCases).where(eq(consultationCases.id, caseId)).limit(1)
    const conv = c?.phone ? await conversationByPhone(c.phone) : null
    if (!conv || !(await canView(actor, conv.id))) return NextResponse.json({ conversationId: null })
    return NextResponse.json({ conversationId: conv.id })
  } catch (error) {
    return errorResponse(error, 'inbox/by-case')
  }
}
