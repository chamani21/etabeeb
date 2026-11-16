import { NextRequest, NextResponse } from 'next/server'
import { errorResponse, validationErrorResponse } from '@/lib/etabib/errors'
import { readJson } from '@/lib/etabib/schemas'
import { requireInboxActor } from '@/lib/etabib/inbox/access'
import { readAttachment, updateAttachment } from '@/lib/etabib/inbox/files'
import { attachmentPatchSchema } from '@/lib/etabib/inbox/schemas'

export const dynamic = 'force-dynamic'

// GET /api/inbox/attachments/[id] — authorized streaming of the stored original (inline; ?download=1)
export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const actor = await requireInboxActor()
    const file = await readAttachment(actor, params.id)
    const disposition = req.nextUrl.searchParams.get('download') === '1' ? 'attachment' : 'inline'
    return new NextResponse(new Uint8Array(file.data), {
      headers: {
        'content-type': file.contentType,
        'content-length': String(file.data.length),
        'content-disposition': `${disposition}; filename="${file.filename}"`,
        'cache-control': 'private, no-store',
        // Only sniffed image/PDF/audio/video types are ever stored (no HTML/SVG); never re-interpreted
        'x-content-type-options': 'nosniff',
      },
    })
  } catch (error) {
    return errorResponse(error, 'inbox/attachment')
  }
}

// PATCH /api/inbox/attachments/[id] — case association, label, flag for doctor, mark reviewed
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const actor = await requireInboxActor()
    const parsed = attachmentPatchSchema.safeParse(await readJson(req, 8 * 1024))
    if (!parsed.success) return validationErrorResponse(parsed.error)
    const patch = Object.fromEntries(Object.entries(parsed.data).filter(([, v]) => v !== undefined))
    await updateAttachment(actor, params.id, patch)
    return NextResponse.json({ success: true })
  } catch (error) {
    return errorResponse(error, 'inbox/attachment-update')
  }
}
