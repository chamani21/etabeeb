import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/etabib/auth'
import { errorResponse } from '@/lib/etabib/errors'
import { parseCaseId } from '@/lib/etabib/schemas'
import { resendPrescription } from '@/lib/etabib/rx/service'
import { dispatchOutboundJobs } from '@/lib/etabib/outbound'

// POST /api/admin/cases/[id]/prescription/resend — send the already-rendered
// finalized prescription image(s) again (audited; never edits clinical content).
export async function POST(_req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const admin = await requireAdmin()
    const result = await resendPrescription(parseCaseId(params.id), { type: 'ADMIN', id: admin.id })
    await dispatchOutboundJobs(result.jobs.map((j) => j.id))
    return NextResponse.json({ success: true, changed: result.changed, queued: result.jobs.length })
  } catch (error) {
    return errorResponse(error, 'admin/prescription-resend')
  }
}
