/**
 * eTabib V1 inbox — durable storage of inbound patient messages (inside the
 * webhook's processing transaction, before the webhook is acknowledged).
 * Media bytes are fetched later; only Meta's media id is stored here.
 */
import { waAttachments, waMessages } from '@etabeeb/db/schema'
import type { Tx } from '../transitions'
import type { InboundMessage } from '../whatsapp'
import { caseLinkFor, touchConversation, type Conversation } from './core'
import { baseType, isSupportedType, sanitizeFilename } from './media'

export interface RecordedInbound {
  messageId: string | null
  /** Attachments to download after commit */
  fetchIds: string[]
}

/** Store one inbound message (idempotent by wamid). `caseId`: the contact's open case, if any. */
export async function recordInboundMessage(tx: Tx, conv: Conversation, msg: InboundMessage, caseId: string | null): Promise<RecordedInbound> {
  const receivedAt = new Date()
  // A provider timestamp in the future (clock skew) must not extend the window
  const providerAt = msg.providerTimestamp && msg.providerTimestamp.getTime() <= receivedAt.getTime() + 60_000 ? msg.providerTimestamp : receivedAt
  const link = caseLinkFor(caseId)
  const body = (msg.text ?? msg.media?.caption ?? null)?.slice(0, 4096) ?? null
  const [row] = await tx
    .insert(waMessages)
    .values({
      conversationId: conv.id,
      direction: 'IN',
      senderRole: 'PATIENT',
      kind: msg.type.slice(0, 32),
      body,
      providerMessageId: msg.wamid,
      replyToProviderId: msg.replyTo ?? null,
      caseId: link.caseId,
      caseLink: link.caseLink,
      localStatus: 'received',
      providerTimestamp: providerAt,
      businessPhoneNumberId: msg.businessPhoneNumberId ?? null,
    })
    .onConflictDoNothing()
    .returning({ id: waMessages.id })
  if (!row) return { messageId: null, fetchIds: [] }
  // Any user-initiated message opens Meta's customer-service window
  await touchConversation(tx, conv.id, providerAt, providerAt)

  const fetchIds: string[] = []
  if (msg.media) {
    const supported = isSupportedType(msg.media.mimeType)
    const [att] = await tx
      .insert(waAttachments)
      .values({
        conversationId: conv.id,
        messageId: row.id,
        caseId: link.caseId,
        source: 'PATIENT',
        providerMediaId: msg.media.id,
        declaredMimeType: baseType(msg.media.mimeType) || null,
        filename: sanitizeFilename(msg.media.filename),
        fetchStatus: supported ? 'PENDING' : 'UNSUPPORTED',
        fetchError: supported ? null : 'file_type_not_supported',
      })
      .onConflictDoNothing()
      .returning({ id: waAttachments.id })
    if (att && supported) fetchIds.push(att.id)
  }
  return { messageId: row.id, fetchIds }
}
