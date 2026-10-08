import { NextRequest, NextResponse } from 'next/server'
import { requireHookKey } from '@/lib/etabib/auth'
import { EtabibError, errorResponse } from '@/lib/etabib/errors'
import { isInboxEnabled } from '@/lib/etabib/inbox/core'
import { MAX_ATTACHMENT_BYTES, MediaRejected, storeFetchedMedia } from '@/lib/etabib/inbox/media'

export const dynamic = 'force-dynamic'

// POST /api/hooks/wa-media/[id] — n8n "eTabib - Media Intake" uploads a downloaded
// patient file (multipart: file, mime_type). Shared-key auth; content is sniffed.
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    requireHookKey(req)
    if (!isInboxEnabled()) throw new EtabibError('not_found', 'Not found', 404)
    if (!/^[0-9a-f-]{36}$/i.test(params.id)) throw new EtabibError('not_found', 'Not found', 404)
    if (Number(req.headers.get('content-length') ?? 0) > MAX_ATTACHMENT_BYTES + 64 * 1024) throw new EtabibError('invalid_media', 'File too large', 413)
    const form = await req.formData().catch(() => null)
    const file = form?.get('file')
    if (!(file instanceof Blob)) throw new EtabibError('invalid_media', 'No file received', 400)
    const declared = form?.get('mime_type')
    try {
      const r = await storeFetchedMedia(params.id, Buffer.from(await file.arrayBuffer()), typeof declared === 'string' && declared ? declared : null)
      return NextResponse.json({ success: true, already: r.already })
    } catch (error) {
      if (error instanceof MediaRejected) throw new EtabibError(error.code, error.message, error.code === 'not_found' ? 404 : 422)
      throw error
    }
  } catch (error) {
    return errorResponse(error, 'hooks/wa-media')
  }
}
