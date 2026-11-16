import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/etabib/auth'
import { errorResponse, validationErrorResponse } from '@/lib/etabib/errors'
import { paymentSchema, parseCaseId, readJson } from '@/lib/etabib/schemas'
import { confirmPayment } from '@/lib/etabib/cases'

// POST /api/admin/cases/[id]/payment — manual payment confirmation (no gateway)
// AWAITING_PAYMENT → PAYMENT_RECEIVED. Confirmer and time come from the server.
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const admin = await requireAdmin()
    const caseId = parseCaseId(params.id)
    const parsed = paymentSchema.safeParse(await readJson(req))
    if (!parsed.success) return validationErrorResponse(parsed.error)

    const result = await confirmPayment(
      caseId,
      {
        received: parsed.data.received,
        source: parsed.data.source,
        reference: parsed.data.reference ?? null,
        amount: parsed.data.amount ?? null,
      },
      { type: 'ADMIN', id: admin.id },
    )
    return NextResponse.json({ success: true, changed: result.changed, case: result.case })
  } catch (error) {
    return errorResponse(error, 'admin/payment')
  }
}
