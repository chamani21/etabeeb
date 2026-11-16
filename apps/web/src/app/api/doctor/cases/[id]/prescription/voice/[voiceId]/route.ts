import { NextRequest, NextResponse } from 'next/server'
import { requireV1Doctor } from '@/lib/etabib/auth'
import { EtabibError, errorResponse, validationErrorResponse } from '@/lib/etabib/errors'
import { parseCaseId, readJson, rxVoicePatchSchema } from '@/lib/etabib/schemas'
import { updateVoiceNote, voiceAudioForCase } from '@/lib/etabib/rx/service'

const voiceIdOf = (v: string) => {
  if (!/^[0-9a-f-]{36}$/i.test(v)) throw new EtabibError('not_found', 'Voice note not found', 404)
  return v
}

// GET — the original recording for playback in the doctor's browser (authenticated, private)
export async function GET(_req: NextRequest, { params }: { params: { id: string; voiceId: string } }) {
  try {
    await requireV1Doctor()
    const audio = await voiceAudioForCase(parseCaseId(params.id), voiceIdOf(params.voiceId))
    if (!audio) throw new EtabibError('not_found', 'Recording not found', 404)
    return new NextResponse(new Uint8Array(audio.data), { headers: { 'content-type': audio.mimeType, 'cache-control': 'private, no-store' } })
  } catch (error) {
    return errorResponse(error, 'doctor/prescription-voice-get')
  }
}

// PATCH — include / exclude from delivery (before it was sent)
export async function PATCH(req: NextRequest, { params }: { params: { id: string; voiceId: string } }) {
  try {
    const doctor = await requireV1Doctor()
    const parsed = rxVoicePatchSchema.safeParse(await readJson(req))
    if (!parsed.success) return validationErrorResponse(parsed.error)
    const v = await updateVoiceNote(parseCaseId(params.id), voiceIdOf(params.voiceId), { type: 'DOCTOR', id: doctor.id }, { includeInDelivery: parsed.data.includeInDelivery })
    return NextResponse.json({ success: true, includeInDelivery: v.includeInDelivery })
  } catch (error) {
    return errorResponse(error, 'doctor/prescription-voice-patch')
  }
}

// DELETE — remove (before it was sent); the audit trail keeps the event
export async function DELETE(_req: NextRequest, { params }: { params: { id: string; voiceId: string } }) {
  try {
    const doctor = await requireV1Doctor()
    await updateVoiceNote(parseCaseId(params.id), voiceIdOf(params.voiceId), { type: 'DOCTOR', id: doctor.id }, { delete: true })
    return NextResponse.json({ success: true })
  } catch (error) {
    return errorResponse(error, 'doctor/prescription-voice-delete')
  }
}
