import { NextResponse } from 'next/server'
import { errorResponse } from '@/lib/etabib/errors'
import { requireInboxActor } from '@/lib/etabib/inbox/access'
import { retryAttachmentFetch } from '@/lib/etabib/inbox/files'

// POST /api/inbox/attachments/[id]/fetch — retry downloading a patient file from WhatsApp
export async function POST(_req: Request, { params }: { params: { id: string } }) {
  try {
    const actor = await requireInboxActor()
    await retryAttachmentFetch(actor, params.id)
    return NextResponse.json({ success: true })
  } catch (error) {
    return errorResponse(error, 'inbox/attachment-fetch')
  }
}
