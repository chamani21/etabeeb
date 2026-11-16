/**
 * eTabib V1 inbox — patient files (reports, photos, audio) and staff uploads.
 *
 * Inbound media: the webhook stores only Meta's media id + metadata. After the
 * webhook is acknowledged the app asks n8n "eTabib - Media Intake" (which holds
 * the WhatsApp credential) to resolve a fresh download URL and upload the bytes
 * to POST /api/hooks/wa-media/<attachment id>. The temporary Meta URL is never
 * stored. Each logical attachment is stored once (unique media id), privately.
 *
 *   ETABIB_N8N_MEDIA_URL   n8n webhook (…/webhook/etabib-media); unset → files
 *                          stay "waiting for download" (visible, retryable)
 *   ETABIB_GRAPH_VERSION   Graph API version passed to n8n (default v21.0)
 */
import { createHash } from 'crypto'
import { and, eq, inArray, lt, or, sql } from 'drizzle-orm'
import { db } from '@etabeeb/db'
import { waAttachments } from '@etabeeb/db/schema'
import { ETABIB_KEY_HEADER, getAppUrl, getOutboundConfig } from '../config'
import { putFile } from '../storage'
import { sanitizeErrorText } from '../sanitize'

/** Largest file accepted from WhatsApp / staff (WhatsApp documents can be bigger; reports rarely are). */
export const MAX_ATTACHMENT_BYTES = 25 * 1024 * 1024
export const MAX_STAFF_FILE_BYTES = 15 * 1024 * 1024
/** WhatsApp image messages are limited to 5 MB; larger staff images go as documents. */
export const WA_IMAGE_MAX_BYTES = 5 * 1024 * 1024
export const MAX_FETCH_ATTEMPTS = 5

/** Allowed stored types → file extension. Active/executable formats are never accepted. */
export const ALLOWED_TYPES: Readonly<Record<string, string>> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'application/pdf': 'pdf',
  'audio/ogg': 'ogg',
  'audio/mpeg': 'mp3',
  'audio/mp4': 'm4a',
  'audio/aac': 'aac',
  'audio/amr': 'amr',
  'video/mp4': 'mp4',
  'video/3gpp': '3gp',
}
/** Staff may send these to the patient (WhatsApp image / document). */
export const STAFF_SEND_TYPES: ReadonlySet<string> = new Set(['image/jpeg', 'image/png', 'application/pdf'])

export function baseType(type: string | null | undefined): string {
  return (type ?? '').split(';')[0]!.trim().toLowerCase()
}

/** True when the declared type is one we store (otherwise the attachment is UNSUPPORTED, visibly). */
export function isSupportedType(type: string | null | undefined): boolean {
  return baseType(type) in ALLOWED_TYPES
}

/**
 * Detect the real type from the file's first bytes. Returns null when the
 * content is not one of the allowed formats (the declared type is never trusted).
 */
export function sniffType(data: Buffer): string | null {
  const b = data
  const at = (i: number, ...bytes: number[]) => bytes.every((v, k) => b[i + k] === v)
  const ascii = (i: number, s: string) => b.length >= i + s.length && b.subarray(i, i + s.length).toString('latin1') === s
  if (b.length < 12) return null
  if (at(0, 0xff, 0xd8, 0xff)) return 'image/jpeg'
  if (at(0, 0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a)) return 'image/png'
  if (ascii(0, 'RIFF') && ascii(8, 'WEBP')) return 'image/webp'
  if (ascii(0, '%PDF-')) return 'application/pdf'
  if (ascii(0, 'OggS')) return 'audio/ogg'
  if (ascii(0, '#!AMR')) return 'audio/amr'
  if (ascii(0, 'ID3')) return 'audio/mpeg'
  // MPEG audio frame sync (11 bits set): layer bits 00 = AAC ADTS, otherwise MP3
  if (b[0] === 0xff && (b[1]! & 0xe0) === 0xe0) return ((b[1]! >> 1) & 0x03) === 0 ? 'audio/aac' : 'audio/mpeg'
  if (ascii(4, 'ftyp')) {
    const brand = b.subarray(8, 12).toString('latin1')
    if (/^(3gp|3g2)/.test(brand)) return 'video/3gpp'
    if (/^(M4A |M4B |mp42|isom|mp41|dash|iso[2-6]|avc1|MSNV|qt  )/.test(brand)) return brand.startsWith('M4A') || brand.startsWith('M4B') ? 'audio/mp4' : 'video/mp4'
    return null
  }
  return null
}

/** The sniffed type must be allowed and of the same family as the declared one (image/audio/video/pdf). */
export function acceptContent(data: Buffer, declared: string | null): { type: string; ext: string } | null {
  const real = sniffType(data)
  if (!real || !(real in ALLOWED_TYPES)) return null
  const fam = (t: string) => (t === 'application/pdf' ? 'pdf' : t.split('/')[0])
  // Generic labels carry no information (multipart defaults); treat them as undeclared
  const raw = baseType(declared)
  const decl = raw === 'application/octet-stream' || raw === 'binary/octet-stream' ? '' : raw
  // MP4 containers are labelled audio/mp4 or video/mp4 inconsistently by clients
  const compatible = !decl || fam(decl) === fam(real) || (real.endsWith('/mp4') && decl.endsWith('/mp4')) || (real === 'video/3gpp' && decl.startsWith('audio/'))
  if (!compatible) return null
  return { type: real, ext: ALLOWED_TYPES[real]! }
}

/** Display-safe filename (internal only; never used in URLs or logs). */
export function sanitizeFilename(name: string | null | undefined): string | null {
  if (!name) return null
  // eslint-disable-next-line no-control-regex
  const cleaned = name.replace(/[\u0000-\u001f\u007f/\\]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 120)
  return cleaned || null
}

export function sha256(data: Buffer): string {
  return createHash('sha256').update(data).digest('hex')
}

export function graphVersion(): string {
  const v = process.env.ETABIB_GRAPH_VERSION?.trim()
  return v && /^v\d{1,2}\.\d$/.test(v) ? v : 'v21.0'
}

function mediaFetchConfig(): { url: string; key: string } | null {
  const url = process.env.ETABIB_N8N_MEDIA_URL?.trim()
  const outbound = getOutboundConfig()
  if (!url || !/^https:\/\//.test(url) || !outbound) return null
  return { url, key: outbound.key }
}

/**
 * Ask n8n to download the given attachments (bounded, sequential). Never throws:
 * failures are recorded on the attachment and stay visible + retryable.
 */
export async function requestMediaFetches(attachmentIds: string[]): Promise<void> {
  const ids = [...new Set(attachmentIds)].slice(0, 10)
  if (ids.length === 0) return
  const config = mediaFetchConfig()
  const base = getAppUrl()
  for (const id of ids) {
    const [att] = await db.select().from(waAttachments).where(eq(waAttachments.id, id)).limit(1)
    if (!att || !att.providerMediaId || att.fetchStatus === 'STORED' || att.fetchStatus === 'UNSUPPORTED') continue
    if (att.fetchAttempts >= MAX_FETCH_ATTEMPTS) continue
    if (!config || !base) {
      await db.update(waAttachments).set({ fetchError: 'media_download_not_configured', updatedAt: new Date() }).where(eq(waAttachments.id, id))
      continue
    }
    const [claimed] = await db
      .update(waAttachments)
      .set({ fetchStatus: 'REQUESTED', fetchAttempts: sql`${waAttachments.fetchAttempts} + 1`, fetchRequestedAt: new Date(), fetchError: null, updatedAt: new Date() })
      .where(and(eq(waAttachments.id, id), inArray(waAttachments.fetchStatus, ['PENDING', 'FAILED', 'REQUESTED'])))
      .returning({ id: waAttachments.id })
    if (!claimed) continue
    try {
      const res = await fetch(config.url, {
        method: 'POST',
        headers: { 'content-type': 'application/json', [ETABIB_KEY_HEADER]: config.key },
        body: JSON.stringify({ attachment_id: id, media_id: att.providerMediaId, graph_version: graphVersion(), upload_url: `${base}/api/hooks/wa-media/${id}` }),
        signal: AbortSignal.timeout(5_000),
      })
      if (!res.ok) throw new Error(`n8n HTTP ${res.status}`)
    } catch (error) {
      await db
        .update(waAttachments)
        .set({ fetchStatus: 'FAILED', fetchError: sanitizeErrorText(error instanceof Error ? error.message : 'request failed', 200), updatedAt: new Date() })
        .where(eq(waAttachments.id, id))
    }
  }
}

/** Scheduler pass: never-requested files, and requests stuck for 10+ minutes. */
export async function retryPendingMediaFetches(limit = 5): Promise<number> {
  const rows = await db
    .select({ id: waAttachments.id })
    .from(waAttachments)
    .where(
      and(
        lt(waAttachments.fetchAttempts, MAX_FETCH_ATTEMPTS),
        sql`${waAttachments.providerMediaId} IS NOT NULL`,
        or(eq(waAttachments.fetchStatus, 'PENDING'), and(eq(waAttachments.fetchStatus, 'REQUESTED'), lt(waAttachments.fetchRequestedAt, new Date(Date.now() - 10 * 60_000)))),
      ),
    )
    .limit(Math.min(Math.max(limit, 1), 20))
  await requestMediaFetches(rows.map((r) => r.id))
  return rows.length
}

export class MediaRejected extends Error {
  constructor(public readonly code: string, message: string) {
    super(message)
  }
}

/** n8n upload of a patient file: validate content, store once, mark STORED. Idempotent. */
export async function storeFetchedMedia(attachmentId: string, data: Buffer, declaredType: string | null): Promise<{ stored: boolean; already: boolean }> {
  const [att] = await db.select().from(waAttachments).where(eq(waAttachments.id, attachmentId)).limit(1)
  if (!att || !att.providerMediaId) throw new MediaRejected('not_found', 'Attachment not found')
  if (att.fetchStatus === 'STORED') return { stored: true, already: true }
  if (data.length === 0 || data.length > MAX_ATTACHMENT_BYTES) {
    await markFetchFailed(attachmentId, 'file_too_large_or_empty')
    throw new MediaRejected('invalid_media', 'File is empty or too large')
  }
  const accepted = acceptContent(data, declaredType ?? att.declaredMimeType)
  if (!accepted) {
    await db.update(waAttachments).set({ fetchStatus: 'UNSUPPORTED', fetchError: 'content_type_not_allowed', updatedAt: new Date() }).where(eq(waAttachments.id, attachmentId))
    throw new MediaRejected('unsupported_media', 'File type is not allowed')
  }
  const key = `inbox/${att.conversationId}/${att.id}.${accepted.ext}`
  await putFile(key, data)
  await db
    .update(waAttachments)
    .set({ fetchStatus: 'STORED', storageKey: key, mimeType: accepted.type, sizeBytes: data.length, sha256: sha256(data), fetchError: null, updatedAt: new Date() })
    .where(and(eq(waAttachments.id, attachmentId), sql`${waAttachments.fetchStatus} <> 'STORED'`))
  return { stored: true, already: false }
}

export async function markFetchFailed(attachmentId: string, reason: string): Promise<void> {
  await db
    .update(waAttachments)
    .set({ fetchStatus: 'FAILED', fetchError: sanitizeErrorText(reason || 'download failed', 200), updatedAt: new Date() })
    .where(and(eq(waAttachments.id, attachmentId), sql`${waAttachments.fetchStatus} <> 'STORED'`))
}
