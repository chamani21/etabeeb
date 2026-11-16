/**
 * eTabib V1 inbox — staff operations on stored files and case association.
 * Access is always checked against the conversation (and therefore the
 * contact's cases); a file can only be linked to a case of the same contact.
 */
import { and, eq } from 'drizzle-orm'
import { db } from '@etabeeb/db'
import { waAttachments, waMessages } from '@etabeeb/db/schema'
import { EtabibError } from '../errors'
import { getFile } from '../storage'
import { recordStaffAudit } from '../staff-audit'
import { assertCaseOfContact, isOwner, viewableConversation } from './access'
import { ALLOWED_TYPES, requestMediaFetches } from './media'
import type { InboxActor } from './ownership'

async function attachmentFor(actor: InboxActor, attachmentId: string) {
  if (!/^[0-9a-f-]{36}$/i.test(attachmentId)) throw new EtabibError('not_found', 'File not found', 404)
  const [att] = await db.select().from(waAttachments).where(eq(waAttachments.id, attachmentId)).limit(1)
  if (!att) throw new EtabibError('not_found', 'File not found', 404)
  const conv = await viewableConversation(actor, att.conversationId) // 404 when not permitted
  return { att, conv }
}

/** Original file bytes for an authorized viewer (never a public URL). */
export async function readAttachment(actor: InboxActor, attachmentId: string): Promise<{ data: Buffer; contentType: string; filename: string }> {
  const { att } = await attachmentFor(actor, attachmentId)
  if (att.fetchStatus !== 'STORED' || !att.storageKey) throw new EtabibError('not_available', 'The file has not been downloaded yet', 409)
  const data = await getFile(att.storageKey)
  if (!data) throw new EtabibError('not_available', 'The stored file is missing', 410)
  const type = att.mimeType ?? 'application/octet-stream'
  // Generic name: patient file names never appear in URLs/headers
  return { data, contentType: type, filename: `etabeeb-file-${att.id.slice(0, 8)}.${ALLOWED_TYPES[type] ?? 'bin'}` }
}

export interface AttachmentPatch {
  caseId?: string | null
  label?: string | null
  flagged?: boolean
  reviewed?: boolean
}

export async function updateAttachment(actor: InboxActor, attachmentId: string, patch: AttachmentPatch): Promise<void> {
  const { att, conv } = await attachmentFor(actor, attachmentId)
  const now = new Date()
  const set: Partial<typeof waAttachments.$inferInsert> = { updatedAt: now }
  const changes: string[] = []
  if (patch.caseId !== undefined) {
    if (actor.role !== 'ADMIN' && !isOwner(actor, conv)) throw new EtabibError('forbidden', 'Only an admin or the conversation owner can change the case', 403)
    if (patch.caseId) await assertCaseOfContact(conv.contactPhone, patch.caseId)
    set.caseId = patch.caseId
    changes.push('case')
  }
  if (patch.label !== undefined) {
    const label = patch.label?.trim().slice(0, 120) || null
    set.label = label
    changes.push('label')
  }
  if (patch.flagged !== undefined) {
    if (actor.role !== 'ADMIN') throw new EtabibError('forbidden', 'Only an admin can flag files for the doctor', 403)
    set.flaggedAt = patch.flagged ? now : null
    set.flaggedBy = patch.flagged ? actor.id : null
    changes.push(patch.flagged ? 'flagged' : 'unflagged')
  }
  if (patch.reviewed !== undefined) {
    if (actor.role !== 'DOCTOR') throw new EtabibError('forbidden', 'Only the doctor marks files as reviewed', 403)
    set.reviewedAt = patch.reviewed ? now : null
    set.reviewedBy = patch.reviewed ? actor.id : null
    changes.push(patch.reviewed ? 'reviewed' : 'unreviewed')
  }
  if (changes.length === 0) return
  await db.transaction(async (tx) => {
    await tx.update(waAttachments).set(set).where(eq(waAttachments.id, att.id))
    await recordStaffAudit({ action: 'INBOX_FILE_UPDATED', actorType: actor.role, actorId: actor.id, targetType: 'wa_attachment', targetId: att.id, metadata: { changes: changes.join(',') } }, tx)
  })
}

/** Explicit case association of a message (and its file). Never guessed. */
export async function linkMessageToCase(actor: InboxActor, messageId: string, caseId: string | null): Promise<void> {
  if (!/^[0-9a-f-]{36}$/i.test(messageId)) throw new EtabibError('not_found', 'Message not found', 404)
  const [msg] = await db.select().from(waMessages).where(eq(waMessages.id, messageId)).limit(1)
  if (!msg) throw new EtabibError('not_found', 'Message not found', 404)
  const conv = await viewableConversation(actor, msg.conversationId)
  if (actor.role !== 'ADMIN' && !isOwner(actor, conv)) throw new EtabibError('forbidden', 'Only an admin or the conversation owner can change the case', 403)
  if (caseId) await assertCaseOfContact(conv.contactPhone, caseId)
  await db.transaction(async (tx) => {
    await tx.update(waMessages).set({ caseId, caseLink: caseId ? 'MANUAL' : 'NEEDED' }).where(eq(waMessages.id, msg.id))
    await tx.update(waAttachments).set({ caseId, updatedAt: new Date() }).where(and(eq(waAttachments.messageId, msg.id), eq(waAttachments.conversationId, conv.id)))
    await recordStaffAudit({ action: 'INBOX_CASE_LINKED', actorType: actor.role, actorId: actor.id, targetType: 'wa_message', targetId: msg.id, metadata: { linked: Boolean(caseId) } }, tx)
  })
}

export async function retryAttachmentFetch(actor: InboxActor, attachmentId: string): Promise<void> {
  const { att } = await attachmentFor(actor, attachmentId)
  if (!att.providerMediaId || att.fetchStatus === 'STORED' || att.fetchStatus === 'UNSUPPORTED') throw new EtabibError('not_retryable', 'This file cannot be downloaded again', 409)
  // Staff retry resets the attempt budget once (visible, deliberate)
  await db.update(waAttachments).set({ fetchStatus: 'PENDING', fetchAttempts: 0, fetchError: null, updatedAt: new Date() }).where(eq(waAttachments.id, att.id))
  await requestMediaFetches([att.id])
}
