import { NextRequest, NextResponse } from 'next/server'
import { EtabibError, errorResponse } from '@/lib/etabib/errors'
import { dispatchOutboundJobs } from '@/lib/etabib/outbound'
import { requireInboxActor } from '@/lib/etabib/inbox/access'
import { MAX_STAFF_FILE_BYTES } from '@/lib/etabib/inbox/media'
import { multipartMeta } from '@/lib/etabib/inbox/schemas'
import { sendFile } from '@/lib/etabib/inbox/send'

export const dynamic = 'force-dynamic'

// POST /api/inbox/conversations/[id]/files — photo/PDF to the patient (multipart: file, caption?, clientRequestKey, expectedVersion)
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const actor = await requireInboxActor()
    if (Number(req.headers.get('content-length') ?? 0) > MAX_STAFF_FILE_BYTES + 64 * 1024) throw new EtabibError('invalid_file', 'The file is too large (max 15 MB)', 413)
    const form = await req.formData().catch(() => null)
    const file = form?.get('file')
    if (!form || !(file instanceof File)) throw new EtabibError('invalid_file', 'No file received', 400)
    let meta
    try {
      meta = multipartMeta(form)
    } catch {
      throw new EtabibError('validation_error', 'Invalid request', 400)
    }
    const caption = form.get('caption')
    const r = await sendFile(params.id, actor, {
      data: Buffer.from(await file.arrayBuffer()),
      mimeType: file.type || 'application/octet-stream',
      filename: file.name || null,
      caption: typeof caption === 'string' ? caption : null,
      ...meta,
    })
    if (!r.duplicate && r.jobId) await dispatchOutboundJobs([r.jobId])
    return NextResponse.json({ success: true, ...r }, { status: r.duplicate ? 200 : 201 })
  } catch (error) {
    return errorResponse(error, 'inbox/send-file')
  }
}
