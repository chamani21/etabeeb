import { NextRequest, NextResponse } from 'next/server'
import { requireV1Doctor } from '@/lib/etabib/auth'
import { EtabibError, errorResponse } from '@/lib/etabib/errors'
import { parseCaseId } from '@/lib/etabib/schemas'
import { addVoiceNote } from '@/lib/etabib/rx/service'
import { VOICE_MAX_BYTES } from '@/lib/etabib/rx/audio'

export const dynamic = 'force-dynamic'

// POST /api/doctor/cases/[id]/prescription/voice — upload the doctor's recording
// (multipart field "audio"); stored privately, transcoded to OGG/Opus for WhatsApp.
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const doctor = await requireV1Doctor()
    const caseId = parseCaseId(params.id)
    const declared = Number(req.headers.get('content-length') ?? 0)
    if (declared > VOICE_MAX_BYTES + 64 * 1024) throw new EtabibError('invalid_audio', 'The recording is too large (max 10 MB)', 413)
    const form = await req.formData().catch(() => null)
    const file = form?.get('audio')
    if (!(file instanceof Blob)) throw new EtabibError('invalid_audio', 'No recording received', 400)
    const note = await addVoiceNote(caseId, { type: 'DOCTOR', id: doctor.id }, { data: Buffer.from(await file.arrayBuffer()), mimeType: file.type || 'application/octet-stream' })
    return NextResponse.json({ success: true, voiceNote: { id: note.id, durationMs: note.durationMs, includeInDelivery: note.includeInDelivery } }, { status: 201 })
  } catch (error) {
    return errorResponse(error, 'doctor/prescription-voice')
  }
}
