/**
 * eTabib V1 inbox — checks run at DISPATCH time (immediately before a job is
 * handed to the existing n8n "eTabib - Outbound Sender"), plus capture of the
 * bot's/system's outbound messages into the conversation history.
 *
 *  - staff replies: the conversation's ownership version must still be the one
 *    the reply was written under (a handover after queuing cancels it)
 *  - every inbox job: Meta's customer-service window must be open (free-form
 *    text/media/audio is never converted to a template)
 *  - conversational bot replies: withdrawn when a human owns the conversation
 */
import { and, eq, inArray, sql } from 'drizzle-orm'
import { db } from '@etabeeb/db'
import { notificationOutbox, waAttachments, waConversations, waMessages } from '@etabeeb/db/schema'
import { signedMediaUrl } from '../media-links'
import { buildTemplatePayload, getApprovedTemplates } from '../templates'
import type { OutboundJobRefs, OutboundPayload } from '../outbound'
import type { Tx } from '../transitions'
import { conversationByPhone, isInboxEnabled, touchConversation, windowState } from './core'

export const INBOX_JOB_TYPES = ['INBOX_TEXT', 'INBOX_AUDIO', 'INBOX_IMAGE', 'INBOX_DOCUMENT', 'INBOX_NOTICE', 'INBOX_INVITE'] as const
export type InboxJobType = (typeof INBOX_JOB_TYPES)[number]
export const INBOX_JOB_TYPE_SET: ReadonlySet<string> = new Set(INBOX_JOB_TYPES)

/** Bot replies that belong to the intake conversation (not transactional notices). */
export const BOT_CONVERSATIONAL_TYPES: ReadonlySet<string> = new Set(['ASK_PATIENT_NAME', 'ASK_PATIENT_PHONE', 'PATIENT_ACKNOWLEDGED', 'PATIENT_CASE_IN_PROGRESS'])

export type InboxDispatchDecision =
  | { action: 'send'; payload: OutboundPayload }
  | { action: 'cancel'; reason: string }
  | { action: 'fail'; reason: string }

type ClaimedJob = { id: string; idempotencyKey: string; templateKey: string }

/** Build the payload for an inbox job, or decide to cancel/fail it (never sends anything itself). */
export async function prepareInboxDispatch(job: ClaimedJob, refs: OutboundJobRefs): Promise<InboxDispatchDecision> {
  if (!refs.conversationId || !refs.messageId) return { action: 'fail', reason: 'payload_unavailable' }
  const [msg] = await db.select().from(waMessages).where(eq(waMessages.id, refs.messageId)).limit(1)
  const [conv] = await db.select().from(waConversations).where(eq(waConversations.id, refs.conversationId)).limit(1)
  if (!msg || !conv || msg.conversationId !== conv.id) return { action: 'fail', reason: 'payload_unavailable' }
  if (msg.localStatus === 'cancelled') return { action: 'cancel', reason: 'superseded: message cancelled' }
  // Ownership re-check (handover after the reply was queued → never sent)
  if (msg.ownerVersion !== null && msg.ownerVersion !== conv.ownerVersion) return { action: 'cancel', reason: 'superseded: conversation ownership changed' }
  if (job.templateKey !== 'INBOX_NOTICE') {
    const roleOk = (conv.owner === 'ADMIN' && msg.senderRole === 'ADMIN') || (conv.owner === 'DOCTOR' && msg.senderRole === 'DOCTOR')
    if (!roleOk || conv.ownerUserId !== msg.senderUserId) return { action: 'cancel', reason: 'superseded: sender no longer owns the conversation' }
  }
  if (job.templateKey === 'INBOX_INVITE') {
    // The only message allowed outside the window: the approved reply-invitation template
    const approved = getApprovedTemplates().PATIENT_REPLY_INVITE
    if (!approved) return { action: 'fail', reason: 'template_not_configured: etabib_reply_invite_ps is not mapped' }
    if (windowState(conv.lastPatientMessageAt).open) return { action: 'cancel', reason: 'superseded: the patient wrote again (free-form reply possible)' }
    const name = msg.body?.trim() || 'ګران ناروغ'
    let template
    try {
      template = buildTemplatePayload('PATIENT_REPLY_INVITE', approved, [name])
    } catch {
      return { action: 'fail', reason: 'invalid_template' }
    }
    return {
      action: 'send',
      payload: { jobId: job.id, idempotencyKey: job.idempotencyKey, type: 'INBOX_INVITE', audience: 'PATIENT', consultationId: refs.consultationId, to: conv.contactPhone, messageKind: 'template', template, callback: { path: '/api/hooks/outbound-result' } },
    }
  }
  if (!windowState(conv.lastPatientMessageAt).open) return { action: 'fail', reason: 'window_closed: the patient has not written in the last 24 hours' }

  const base = {
    jobId: job.id,
    idempotencyKey: job.idempotencyKey,
    type: job.templateKey as OutboundPayload['type'],
    audience: 'PATIENT' as const,
    consultationId: refs.consultationId,
    to: conv.contactPhone,
    callback: { path: '/api/hooks/outbound-result' as const },
  }
  if (job.templateKey === 'INBOX_TEXT' || job.templateKey === 'INBOX_NOTICE') {
    if (!msg.body) return { action: 'fail', reason: 'payload_unavailable' }
    return { action: 'send', payload: { ...base, messageKind: 'text', text: msg.body } }
  }
  const [att] = await db.select().from(waAttachments).where(and(eq(waAttachments.messageId, msg.id), eq(waAttachments.conversationId, conv.id))).limit(1)
  if (!att || !att.storageKey || att.fetchStatus !== 'STORED') return { action: 'fail', reason: 'payload_unavailable' }
  const link = signedMediaUrl({ kind: 'wa-att', id: att.id })
  if (!link) return { action: 'fail', reason: 'payload_unavailable' }
  if (job.templateKey === 'INBOX_AUDIO') return { action: 'send', payload: { ...base, messageKind: 'audio', media: { link, voice: true } } }
  if (job.templateKey === 'INBOX_IMAGE') return { action: 'send', payload: { ...base, messageKind: 'image', media: { link, ...(msg.body ? { caption: msg.body.slice(0, 1024) } : {}) } } }
  return {
    action: 'send',
    payload: { ...base, messageKind: 'document', media: { link, filename: att.mimeType === 'application/pdf' ? 'eTabeeb-document.pdf' : 'eTabeeb-document', ...(msg.body ? { caption: msg.body.slice(0, 1024) } : {}) } },
  }
}

/** A conversational bot reply must not be sent while a human owns the conversation. */
export async function botReplySuppressed(templateKey: string, recipientPhone: string | null): Promise<boolean> {
  if (!isInboxEnabled() || !BOT_CONVERSATIONAL_TYPES.has(templateKey) || !recipientPhone) return false
  const conv = await conversationByPhone(recipientPhone)
  return Boolean(conv && conv.owner !== 'BOT')
}

/** Inside an ownership change: withdraw the contact's queued (not yet sent) bot replies. */
export async function withdrawQueuedBotReplies(tx: Tx, contactPhone: string): Promise<number> {
  const rows = await tx
    .update(notificationOutbox)
    .set({ status: 'cancelled', lastError: 'superseded: staff took over the conversation', processedAt: new Date() })
    .where(and(eq(notificationOutbox.status, 'pending'), eq(notificationOutbox.recipientPhone, contactPhone), inArray(notificationOutbox.templateKey, [...BOT_CONVERSATIONAL_TYPES])))
    .returning({ id: notificationOutbox.id })
  return rows.length
}

/** Inside an ownership change: cancel queued staff replies written under an older ownership version. */
export async function cancelStaleStaffReplies(tx: Tx, conversationId: string, currentVersion: number): Promise<number> {
  const stale = await tx
    .select({ id: waMessages.id, jobId: waMessages.outboxJobId })
    .from(waMessages)
    .innerJoin(notificationOutbox, eq(notificationOutbox.id, waMessages.outboxJobId))
    .where(
      and(
        eq(waMessages.conversationId, conversationId),
        eq(notificationOutbox.status, 'pending'),
        sql`${waMessages.ownerVersion} IS NOT NULL AND ${waMessages.ownerVersion} <> ${currentVersion}`,
      ),
    )
  if (stale.length === 0) return 0
  await tx.update(waMessages).set({ localStatus: 'cancelled' }).where(inArray(waMessages.id, stale.map((s) => s.id)))
  await tx
    .update(notificationOutbox)
    .set({ status: 'cancelled', lastError: 'superseded: conversation ownership changed', processedAt: new Date() })
    .where(and(inArray(notificationOutbox.id, stale.map((s) => s.jobId!)), eq(notificationOutbox.status, 'pending')))
  return stale.length
}

const BOT_TYPES = BOT_CONVERSATIONAL_TYPES

/**
 * Record a bot/system message to the patient in the conversation (once per job;
 * the text as actually built for sending). Best effort: never blocks delivery.
 */
export async function captureOutboundMessage(job: { id: string; templateKey: string; createdAt: Date }, payload: OutboundPayload): Promise<void> {
  if (!isInboxEnabled() || payload.audience !== 'PATIENT' || !payload.to || INBOX_JOB_TYPE_SET.has(job.templateKey)) return
  try {
    const body =
      payload.messageKind === 'text'
        ? (payload.text ?? null)
        : payload.messageKind === 'template'
          ? `[${payload.template?.name ?? 'template'}] ${(payload.template?.components ?? []).flatMap((c) => (c.type === 'body' ? c.parameters.map((p) => p.text) : [])).join(' · ')}`
          : (payload.media?.caption ?? null)
    const kind = payload.messageKind === 'image' || payload.messageKind === 'audio' ? payload.messageKind : payload.messageKind === 'template' ? 'template' : 'text'
    await db.transaction(async (tx) => {
      const [conv] = await tx.select().from(waConversations).where(eq(waConversations.contactPhone, payload.to!)).limit(1)
      if (!conv) return
      const caseId = /^[0-9a-f-]{36}$/i.test(payload.consultationId) ? payload.consultationId : null
      await tx
        .insert(waMessages)
        .values({
          conversationId: conv.id,
          direction: 'OUT',
          senderRole: BOT_TYPES.has(job.templateKey) ? 'BOT' : 'SYSTEM',
          kind,
          body: body?.slice(0, 4096) ?? null,
          outboxJobId: job.id,
          caseId,
          caseLink: caseId ? 'AUTO' : 'NEEDED',
          createdAt: job.createdAt,
        })
        .onConflictDoUpdate({ target: waMessages.outboxJobId, targetWhere: sql`outbox_job_id IS NOT NULL`, set: { body: body?.slice(0, 4096) ?? null, kind } })
      await touchConversation(tx, conv.id, job.createdAt)
    })
  } catch (error) {
    console.warn(`[etabib:inbox] could not record outbound job ${job.id}: ${error instanceof Error ? error.name : 'error'}`)
  }
}
