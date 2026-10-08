/**
 * eTabib V1 inbox — staff → patient messages through the EXISTING outbox and
 * n8n "eTabib - Outbound Sender" (same eTabeeb number, same delivery tracking).
 *
 * Checked when queuing AND again at dispatch: the sender is the conversation's
 * current human owner (ownership version unchanged) and Meta's customer-service
 * window is open. A client request key makes double taps / retries idempotent.
 * Internal notes are a separate table and can never reach the outbox.
 */
import { randomUUID } from 'crypto'
import { eq } from 'drizzle-orm'
import { db } from '@etabeeb/db'
import { waAttachments, waConversations, waInternalNotes, waMessages } from '@etabeeb/db/schema'
import { EtabibError } from '../errors'
import { enqueueOutboundJob, type OutboundJobType } from '../outbound'
import { putFile, storagePath, getFile } from '../storage'
import type { Tx } from '../transitions'
import { caseLinkFor, latestCaseForContact, openCaseForContact, touchConversation, windowState, type Conversation } from './core'
import { STAFF_SEND_TYPES, WA_IMAGE_MAX_BYTES, MAX_STAFF_FILE_BYTES, acceptContent, sanitizeFilename, sha256 } from './media'
import type { InboxActor } from './ownership'
import { isOwner, viewableConversation, assertCaseOfContact } from './access'

export const MAX_TEXT_LENGTH = 4000
const KEY_RE = /^[A-Za-z0-9_-]{8,64}$/

export interface SendResult {
  messageId: string
  jobId: string | null
  duplicate: boolean
}

function checkKey(key: string): void {
  if (!KEY_RE.test(key)) throw new EtabibError('validation_error', 'Invalid request key', 400)
}

async function existingByKey(conversationId: string, key: string): Promise<SendResult | null> {
  const [m] = await db.select({ id: waMessages.id, conv: waMessages.conversationId, job: waMessages.outboxJobId }).from(waMessages).where(eq(waMessages.clientRequestKey, key)).limit(1)
  if (!m) return null
  if (m.conv !== conversationId) throw new EtabibError('validation_error', 'Request key already used', 409)
  return { messageId: m.id, jobId: m.job, duplicate: true }
}

/** Locks the conversation and enforces owner + version + window for a patient-facing send. */
async function lockForSend(tx: Tx, actor: InboxActor, conversationId: string, expectedVersion: number): Promise<{ conv: Conversation; latestCaseId: string }> {
  const [conv] = await tx.select().from(waConversations).where(eq(waConversations.id, conversationId)).limit(1).for('update')
  if (!conv) throw new EtabibError('not_found', 'Conversation not found', 404)
  if (!isOwner(actor, conv)) throw new EtabibError('not_owner', 'Only the current owner of this conversation can message the patient', 403)
  if (conv.ownerVersion !== expectedVersion) throw new EtabibError('ownership_conflict', 'The conversation changed in the meantime. Reload and try again.', 409)
  if (!windowState(conv.lastPatientMessageAt).open) {
    throw new EtabibError('window_closed', 'WhatsApp only allows free-form messages within 24 hours of the patient’s last message. Wait for the patient to write.', 409)
  }
  const latest = await latestCaseForContact(tx, conv.contactPhone)
  if (!latest) throw new EtabibError('no_case', 'This contact has no consultation case yet', 409)
  return { conv, latestCaseId: latest.id }
}

async function queue(tx: Tx, conv: Conversation, latestCaseId: string, actor: InboxActor, type: OutboundJobType, key: string, values: { kind: string; body: string | null }): Promise<{ messageId: string; jobId: string }> {
  const open = await openCaseForContact(tx, conv.contactPhone)
  const link = caseLinkFor(open?.id ?? null)
  const [msg] = await tx
    .insert(waMessages)
    .values({
      conversationId: conv.id,
      direction: 'OUT',
      senderRole: actor.role,
      senderUserId: actor.id,
      kind: values.kind,
      body: values.body,
      clientRequestKey: key,
      ownerVersion: conv.ownerVersion,
      caseId: link.caseId,
      caseLink: link.caseLink,
    })
    .returning({ id: waMessages.id })
  const job = await enqueueOutboundJob(tx, { type, consultationId: latestCaseId, dedupeKey: key, recipientPhone: conv.contactPhone, conversationId: conv.id, messageId: msg!.id })
  await tx.update(waMessages).set({ outboxJobId: job.id }).where(eq(waMessages.id, msg!.id))
  await touchConversation(tx, conv.id, new Date())
  return { messageId: msg!.id, jobId: job.id }
}

export async function sendText(conversationId: string, actor: InboxActor, input: { body: string; clientRequestKey: string; expectedVersion: number }): Promise<SendResult> {
  checkKey(input.clientRequestKey)
  const body = input.body.replace(/\r\n/g, '\n').trim()
  if (!body || body.length > MAX_TEXT_LENGTH) throw new EtabibError('validation_error', `Message must be 1–${MAX_TEXT_LENGTH} characters`, 400)
  await viewableConversation(actor, conversationId)
  const dup = await existingByKey(conversationId, input.clientRequestKey)
  if (dup) return dup
  return db.transaction(async (tx) => {
    const { conv, latestCaseId } = await lockForSend(tx, actor, conversationId, input.expectedVersion)
    const r = await queue(tx, conv, latestCaseId, actor, 'INBOX_TEXT', input.clientRequestKey, { kind: 'text', body })
    return { ...r, duplicate: false }
  })
}

async function storeStaffAttachment(
  tx: Tx,
  conv: Conversation,
  actor: InboxActor,
  messageId: string,
  file: { id: string; storageKey: string; deliveryKey?: string; mimeType: string; size: number; sha: string; durationMs?: number; filename: string | null },
): Promise<void> {
  const open = await openCaseForContact(tx, conv.contactPhone)
  await tx.insert(waAttachments).values({
    id: file.id,
    conversationId: conv.id,
    messageId,
    caseId: open?.id ?? null,
    source: actor.role,
    mimeType: file.mimeType,
    declaredMimeType: file.mimeType,
    sizeBytes: file.size,
    sha256: file.sha,
    storageKey: file.storageKey,
    deliveryKey: file.deliveryKey ?? null,
    durationMs: file.durationMs ?? null,
    filename: file.filename,
    fetchStatus: 'STORED',
  })
}

/** Pre-flight before expensive work (conversion/storage); re-checked under lock. */
async function precheck(actor: InboxActor, conversationId: string, expectedVersion: number): Promise<Conversation> {
  const conv = await viewableConversation(actor, conversationId)
  if (!isOwner(actor, conv)) throw new EtabibError('not_owner', 'Only the current owner of this conversation can message the patient', 403)
  if (conv.ownerVersion !== expectedVersion) throw new EtabibError('ownership_conflict', 'The conversation changed in the meantime. Reload and try again.', 409)
  if (!windowState(conv.lastPatientMessageAt).open) throw new EtabibError('window_closed', 'WhatsApp only allows free-form messages within 24 hours of the patient’s last message. Wait for the patient to write.', 409)
  return conv
}

/** Recorded voice message: original kept, OGG/Opus rendition sent as a WhatsApp voice note. */
export async function sendAudio(conversationId: string, actor: InboxActor, input: { data: Buffer; mimeType: string; clientRequestKey: string; expectedVersion: number }): Promise<SendResult> {
  checkKey(input.clientRequestKey)
  const dup = await existingByKey(conversationId, input.clientRequestKey)
  if (dup) return dup
  const conv = await precheck(actor, conversationId, input.expectedVersion)
  const { AudioError, VOICE_INPUT_TYPES, VOICE_MAX_BYTES, VOICE_MAX_SECONDS, VOICE_MIN_SECONDS, baseMime, probeDurationMs, transcodeToVoiceOgg } = await import('../rx/audio')
  const mime = baseMime(input.mimeType)
  const ext = VOICE_INPUT_TYPES[mime]
  if (!ext) throw new EtabibError('invalid_audio', 'Unsupported audio format', 400)
  if (input.data.length === 0 || input.data.length > VOICE_MAX_BYTES) throw new EtabibError('invalid_audio', 'The recording is empty or too large (max 10 MB)', 400)
  const id = randomUUID()
  const originalKey = `inbox/${conv.id}/${id}-original.${ext}`
  const deliveryKey = `inbox/${conv.id}/${id}.ogg`
  await putFile(originalKey, input.data)
  let durationMs: number
  try {
    durationMs = await probeDurationMs(storagePath(originalKey))
    if (durationMs < VOICE_MIN_SECONDS * 1000) throw new AudioError('audio_too_short', 'The recording is too short')
    if (durationMs > VOICE_MAX_SECONDS * 1000 + 999) throw new AudioError('audio_too_long', 'The recording is longer than 5 minutes')
    await transcodeToVoiceOgg(storagePath(originalKey), storagePath(deliveryKey))
  } catch (error) {
    if (error instanceof AudioError) throw new EtabibError(error.code, error.message, 400)
    throw error
  }
  const converted = await getFile(deliveryKey)
  if (!converted || converted.length === 0) throw new EtabibError('audio_conversion_failed', 'Audio conversion failed', 500)
  return db.transaction(async (tx) => {
    const locked = await lockForSend(tx, actor, conversationId, input.expectedVersion)
    const r = await queue(tx, locked.conv, locked.latestCaseId, actor, 'INBOX_AUDIO', input.clientRequestKey, { kind: 'audio', body: null })
    await storeStaffAttachment(tx, locked.conv, actor, r.messageId, { id, storageKey: originalKey, deliveryKey, mimeType: mime, size: input.data.length, sha: sha256(input.data), durationMs, filename: null })
    return { ...r, duplicate: false }
  })
}

/** Staff file to the patient (photo or PDF). Content is sniffed; the declared type is not trusted. */
export async function sendFile(
  conversationId: string,
  actor: InboxActor,
  input: { data: Buffer; mimeType: string; filename: string | null; caption: string | null; clientRequestKey: string; expectedVersion: number },
): Promise<SendResult> {
  checkKey(input.clientRequestKey)
  const dup = await existingByKey(conversationId, input.clientRequestKey)
  if (dup) return dup
  const conv = await precheck(actor, conversationId, input.expectedVersion)
  if (input.data.length === 0 || input.data.length > MAX_STAFF_FILE_BYTES) throw new EtabibError('invalid_file', 'The file is empty or too large (max 15 MB)', 400)
  const accepted = acceptContent(input.data, input.mimeType)
  if (!accepted || !STAFF_SEND_TYPES.has(accepted.type)) throw new EtabibError('invalid_file', 'Only photos (JPEG/PNG) and PDF files can be sent', 400)
  const caption = input.caption?.trim().slice(0, 1000) || null
  const asImage = accepted.type.startsWith('image/') && input.data.length <= WA_IMAGE_MAX_BYTES
  const id = randomUUID()
  const key = `inbox/${conv.id}/${id}.${accepted.ext}`
  await putFile(key, input.data)
  return db.transaction(async (tx) => {
    const locked = await lockForSend(tx, actor, conversationId, input.expectedVersion)
    const r = await queue(tx, locked.conv, locked.latestCaseId, actor, asImage ? 'INBOX_IMAGE' : 'INBOX_DOCUMENT', input.clientRequestKey, { kind: asImage ? 'image' : 'document', body: caption })
    await storeStaffAttachment(tx, locked.conv, actor, r.messageId, { id, storageKey: key, mimeType: accepted.type, size: input.data.length, sha: sha256(input.data), filename: sanitizeFilename(input.filename) })
    return { ...r, duplicate: false }
  })
}

/** Internal note: visible to authorized staff only; never queued for WhatsApp. Any viewer may add one. */
export async function addNote(conversationId: string, actor: InboxActor, input: { body: string; caseId?: string | null | undefined }): Promise<{ noteId: string }> {
  const conv = await viewableConversation(actor, conversationId)
  const body = input.body.trim()
  if (!body || body.length > 2000) throw new EtabibError('validation_error', 'Note must be 1–2000 characters', 400)
  if (input.caseId) await assertCaseOfContact(conv.contactPhone, input.caseId)
  const [row] = await db
    .insert(waInternalNotes)
    .values({ conversationId: conv.id, authorId: actor.id, authorRole: actor.role, body, caseId: input.caseId ?? null })
    .returning({ id: waInternalNotes.id })
  return { noteId: row!.id }
}
