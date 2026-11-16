import { NextResponse } from 'next/server'
import { representativeChatTarget } from '@/lib/etabib/links'

export const dynamic = 'force-dynamic'

// GET /help — the short, clean help link in patient WhatsApp messages. Redirects
// server-side to the representative's WhatsApp chat (wa.me, Pashto greeting
// prefilled). The target is built only from configuration: no query parameter
// or path can influence it, so this cannot be used as an open redirect.
export async function GET() {
  const target = representativeChatTarget()
  if (!target) return new NextResponse('Not available', { status: 404, headers: { 'cache-control': 'no-store' } })
  return NextResponse.redirect(target, { status: 302, headers: { 'cache-control': 'no-store' } })
}
