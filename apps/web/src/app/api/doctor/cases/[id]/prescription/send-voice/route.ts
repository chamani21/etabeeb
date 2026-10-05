import { NextRequest, NextResponse } from 'next/server'
import { requireV1Doctor } from '@/lib/etabib/auth'
import { errorResponse } from '@/lib/etabib/errors'
import { parseCaseId } from '@/lib/etabib/schemas'
import { sendVoiceNotes } from '@/lib/etabib/rx/service'
import { dispatchOutboundJobs } from '@/lib/etabib/outbound'

// POST /api/doctor/cases/[id]/prescription/send-voice — send voice note(s) recorded
// after the prescription was sent (idempotent per voice note).
export async function POST(_req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const doctor = await requireV1Doctor()
    const { jobs } = await sendVoiceNotes(parseCaseId(params.id), { type: 'DOCTOR', id: doctor.id })
    await dispatchOutboundJobs(jobs.filter((j) => j.created).map((j) => j.id))
    return NextResponse.json({ success: true, queued: jobs.filter((j) => j.created).length })
  } catch (error) {
    return errorResponse(error, 'doctor/prescription-send-voice')
  }
}
