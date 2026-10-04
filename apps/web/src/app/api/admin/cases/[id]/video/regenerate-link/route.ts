import { NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/etabib/auth'
import { errorResponse } from '@/lib/etabib/errors'
import { parseCaseId } from '@/lib/etabib/schemas'
import { regeneratePatientVideoLink } from '@/lib/etabib/cases'
import { dispatchOutboundJobs } from '@/lib/etabib/outbound'

// POST /api/admin/cases/[id]/video/regenerate-link — audited: revoke every active
// patient link and send the patient a new confirmation with a fresh link.
export async function POST(_req: Request, { params }: { params: { id: string } }) {
  try {
    const admin = await requireAdmin()
    const result = await regeneratePatientVideoLink(parseCaseId(params.id), { type: 'ADMIN', id: admin.id })
    const dispatch = await dispatchOutboundJobs(result.jobs.map((j) => j.id))
    return NextResponse.json({ success: true, changed: result.changed, dispatched: dispatch[0]?.dispatched ?? false })
  } catch (error) {
    return errorResponse(error, 'admin/video-regenerate')
  }
}
