/**
 * eTabib V1 — short-lived signed links for media WhatsApp must fetch
 * (prescription images, voice notes). The link names a storage object by kind
 * + id only; the HMAC (keyed from NEXTAUTH_SECRET with a purpose label) and the
 * expiry prevent guessing or reuse. No session is involved.
 */
import { createHmac, timingSafeEqual } from 'crypto'
import { getAppUrl } from './config'

// wa-att: a file/voice note a STAFF member sends from the inbox (never a patient upload)
export type MediaKind = 'rx-image' | 'voice' | 'wa-att'
export interface MediaRef {
  kind: MediaKind
  /** prescription id (rx-image), voice note id (voice) or inbox attachment id (wa-att) */
  id: string
  /** 1-based page for rx-image */
  page?: number
  /** expiry, unix seconds */
  exp: number
}

export const MEDIA_LINK_TTL_SECONDS = 60 * 60

function key(): Buffer {
  const secret = process.env.NEXTAUTH_SECRET
  if (!secret) throw new Error('media_signing_unavailable')
  return createHmac('sha256', secret).update('etabib:media-link:v1').digest()
}

const b64u = (b: Buffer | string) => Buffer.from(b).toString('base64url')

export function signMediaToken(ref: Omit<MediaRef, 'exp'>, ttlSeconds = MEDIA_LINK_TTL_SECONDS): string {
  const body = b64u(JSON.stringify({ ...ref, exp: Math.floor(Date.now() / 1000) + ttlSeconds }))
  const sig = b64u(createHmac('sha256', key()).update(body).digest())
  return `${body}.${sig}`
}

export function verifyMediaToken(token: string): MediaRef | null {
  const [body, sig] = token.split('.')
  if (!body || !sig || token.length > 600) return null
  const expected = createHmac('sha256', key()).update(body).digest()
  let given: Buffer
  try {
    given = Buffer.from(sig, 'base64url')
  } catch {
    return null
  }
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return null
  try {
    const ref = JSON.parse(Buffer.from(body, 'base64url').toString()) as MediaRef
    if (!['rx-image', 'voice', 'wa-att'].includes(ref.kind) || typeof ref.id !== 'string' || typeof ref.exp !== 'number') return null
    if (ref.exp < Math.floor(Date.now() / 1000)) return null
    return ref
  } catch {
    return null
  }
}

/** Public HTTPS URL WhatsApp fetches (null when the app URL is not configured). */
export function signedMediaUrl(ref: Omit<MediaRef, 'exp'>): string | null {
  const base = getAppUrl()
  if (!base) return null
  if (ref.kind === 'wa-att') return `${base}/api/media/w/${signMediaToken(ref)}/file`
  const ext = ref.kind === 'voice' ? 'ogg' : 'png'
  return `${base}/api/media/w/${signMediaToken(ref)}/${ref.kind === 'voice' ? 'voice' : `page-${ref.page ?? 1}`}.${ext}`
}
