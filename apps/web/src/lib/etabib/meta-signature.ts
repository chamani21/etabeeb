import { createHmac, timingSafeEqual } from 'crypto'
import { EtabibError } from './errors'
import { getMetaAppSecret, getMetaVerifyToken } from './config'

/** Constant-time string comparison (equal-length digests only). */
function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a, 'utf8')
  const bb = Buffer.from(b, 'utf8')
  return ab.length === bb.length && timingSafeEqual(ab, bb)
}

/** True when `header` is a valid `sha256=<hex>` HMAC of `rawBody` under `secret`. */
export function isValidMetaSignature(rawBody: string, header: string | null, secret: string): boolean {
  if (!header || !header.startsWith('sha256=')) return false
  const expected = createHmac('sha256', secret).update(rawBody, 'utf8').digest('hex')
  return safeEqual(header.slice('sha256='.length).toLowerCase(), expected)
}

/**
 * Verify the ORIGINAL Meta signature forwarded by n8n (x-hub-signature-256 over
 * the unmodified raw body). Enforced whenever ETABIB_META_APP_SECRET is set.
 * Fails closed in production when it is not set; outside production it is
 * skipped with a warning so local/dev and tests can run unsigned.
 */
export function requireMetaSignature(rawBody: string, header: string | null): void {
  const secret = getMetaAppSecret()
  if (!secret) {
    if (process.env.NODE_ENV === 'production') {
      console.error('[etabib:auth] ETABIB_META_APP_SECRET is not configured — rejecting WhatsApp hook')
      throw new EtabibError('unauthorized', 'Unauthorized', 401)
    }
    console.warn('[etabib:auth] ETABIB_META_APP_SECRET not set — Meta signature NOT verified (non-production)')
    return
  }
  if (!isValidMetaSignature(rawBody, header, secret)) throw new EtabibError('unauthorized', 'Unauthorized', 401)
}

/** Meta GET verification: returns the challenge when mode + token match, else null. */
export function checkMetaVerification(query: URLSearchParams): string | null {
  const expected = getMetaVerifyToken()
  const provided = query.get('hub.verify_token')
  const challenge = query.get('hub.challenge')
  if (!expected || !provided || query.get('hub.mode') !== 'subscribe' || !challenge) return null
  return safeEqual(provided, expected) ? challenge : null
}
