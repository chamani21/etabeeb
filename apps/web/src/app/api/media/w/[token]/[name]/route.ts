import { NextRequest, NextResponse } from 'next/server'
import { db } from '@etabeeb/db'
import { prescriptions, prescriptionVoiceNotes } from '@etabeeb/db/schema'
import { and, eq, isNull } from 'drizzle-orm'
import { verifyMediaToken } from '@/lib/etabib/media-links'
import { getFile } from '@/lib/etabib/storage'

export const dynamic = 'force-dynamic'

const notFound = () => new NextResponse('Not found', { status: 404, headers: { 'cache-control': 'no-store' } })

// GET /api/media/w/<signed token>/<name> — media WhatsApp (Meta) fetches for a
// prescription message. Valid only with an unexpired HMAC-signed token naming one
// finalized prescription page or one voice note. No listing, no guessing.
export async function GET(_req: NextRequest, { params }: { params: { token: string; name: string } }) {
  const ref = verifyMediaToken(params.token)
  if (!ref) return notFound()
  let key: string | null | undefined
  let type = 'image/png'
  if (ref.kind === 'rx-image') {
    const [rx] = await db.select({ keys: prescriptions.imageKeys, status: prescriptions.workflowStatus }).from(prescriptions).where(eq(prescriptions.id, ref.id)).limit(1)
    if (!rx || rx.status === 'DRAFT') return notFound()
    key = rx.keys?.[(ref.page ?? 1) - 1]
  } else {
    const [v] = await db.select({ key: prescriptionVoiceNotes.audioKey }).from(prescriptionVoiceNotes).where(and(eq(prescriptionVoiceNotes.id, ref.id), isNull(prescriptionVoiceNotes.deletedAt))).limit(1)
    key = v?.key
    type = 'audio/ogg'
  }
  if (!key) return notFound()
  const data = await getFile(key)
  if (!data) return notFound()
  return new NextResponse(new Uint8Array(data), {
    headers: { 'content-type': type, 'content-length': String(data.length), 'cache-control': 'private, no-store', 'x-robots-tag': 'noindex' },
  })
}
