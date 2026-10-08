import { NextResponse } from 'next/server'
import { errorResponse } from '@/lib/etabib/errors'
import { requireInboxActor } from '@/lib/etabib/inbox/access'
import { markRead } from '@/lib/etabib/inbox/queries'

export async function POST(_req: Request, { params }: { params: { id: string } }) {
  try {
    const actor = await requireInboxActor()
    await markRead(actor, params.id)
    return NextResponse.json({ success: true })
  } catch (error) {
    return errorResponse(error, 'inbox/read')
  }
}
