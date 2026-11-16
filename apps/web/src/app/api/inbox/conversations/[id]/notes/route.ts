import { NextRequest, NextResponse } from 'next/server'
import { errorResponse, validationErrorResponse } from '@/lib/etabib/errors'
import { readJson } from '@/lib/etabib/schemas'
import { requireInboxActor } from '@/lib/etabib/inbox/access'
import { noteSchema } from '@/lib/etabib/inbox/schemas'
import { addNote } from '@/lib/etabib/inbox/send'

// POST /api/inbox/conversations/[id]/notes — internal note (staff only; never sent to WhatsApp)
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const actor = await requireInboxActor()
    const parsed = noteSchema.safeParse(await readJson(req, 16 * 1024))
    if (!parsed.success) return validationErrorResponse(parsed.error)
    return NextResponse.json({ success: true, ...(await addNote(params.id, actor, parsed.data)) }, { status: 201 })
  } catch (error) {
    return errorResponse(error, 'inbox/note')
  }
}
