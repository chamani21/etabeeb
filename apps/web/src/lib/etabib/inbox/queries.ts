/**
 * eTabib V1 inbox — read models for the staff UI (list, conversation view,
 * unread counts). Phone numbers are masked; message delivery status is read
 * from the outbox job (the single source of truth, already out-of-order safe).
 */
import { and, asc, desc, eq, gt, gte, inArray, isNull, lt, or, sql } from 'drizzle-orm'
import { db } from '@etabeeb/db'
import {
  consultationCases,
  notificationOutbox,
  users,
  waAttachments,
  waConversationReads,
  waConversations,
  waHandoverRequests,
  waInternalNotes,
  waMessages,
} from '@etabeeb/db/schema'
import { maskPhone } from '../staff-audit'
import { getV1DoctorUserId } from '../config'
import { doctorVisibleSql, isOwner, viewableConversation } from './access'
import { windowState } from './core'
import { botResumeBlocker, type InboxActor } from './ownership'

export const LIST_FILTERS = ['all', 'mine', 'admin_queue', 'doctor_queue', 'pending'] as const
export type ListFilter = (typeof LIST_FILTERS)[number]

const PAGE = 50

/** Delivery state shown to staff (never invents a read receipt). */
export function deliveryState(job: { status: string; lastError: string | null; createdAt: Date } | null, localStatus: string | null): string {
  if (localStatus === 'cancelled') return 'cancelled'
  if (!job) return localStatus ?? 'unknown'
  if (job.status === 'pending') return 'queued'
  // Handed to n8n but no result yet: after 10 minutes the outcome is uncertain (never auto-resent)
  if (job.status === 'processing') return Date.now() - job.createdAt.getTime() > 10 * 60_000 ? 'unknown' : 'sending'
  return job.status // sent | delivered | read | failed | cancelled
}

async function userNames(ids: Array<string | null | undefined>): Promise<Map<string, string>> {
  const unique = [...new Set(ids.filter((v): v is string => Boolean(v)))]
  if (unique.length === 0) return new Map()
  const rows = await db.select({ id: users.id, name: users.displayName }).from(users).where(inArray(users.id, unique))
  return new Map(rows.map((r) => [r.id, r.name ?? 'Staff']))
}

export async function listConversations(actor: InboxActor, filter: ListFilter = 'all') {
  const conds = []
  if (actor.role === 'DOCTOR') conds.push(doctorVisibleSql(actor.id))
  if (filter === 'mine') conds.push(and(eq(waConversations.owner, actor.role), eq(waConversations.ownerUserId, actor.id)))
  if (filter === 'admin_queue') conds.push(eq(waConversations.owner, 'ADMIN'))
  if (filter === 'doctor_queue') conds.push(eq(waConversations.owner, 'DOCTOR'))
  if (filter === 'pending') conds.push(sql`EXISTS (SELECT 1 FROM ${waHandoverRequests} h WHERE h.conversation_id = ${waConversations.id} AND h.status = 'PENDING')`)
  const convs = await db
    .select()
    .from(waConversations)
    .where(conds.length ? and(...conds) : undefined)
    .orderBy(sql`${waConversations.lastMessageAt} DESC NULLS LAST`)
    .limit(200)
  if (convs.length === 0) return []
  const ids = convs.map((c) => c.id)

  const latest = await db.execute<{ conversation_id: string; direction: string; kind: string; body: string | null; sender_role: string; historical: boolean }>(sql`
    SELECT DISTINCT ON (conversation_id) conversation_id, direction, kind, body, sender_role, historical
    FROM ${waMessages} WHERE conversation_id IN (${sql.join(ids.map((i) => sql`${i}::uuid`), sql`, `)})
    ORDER BY conversation_id, created_at DESC`)
  const unread = await db.execute<{ conversation_id: string; n: number }>(sql`
    SELECT m.conversation_id, count(*)::int AS n FROM ${waMessages} m
    LEFT JOIN ${waConversationReads} r ON r.conversation_id = m.conversation_id AND r.user_id = ${actor.id}
    WHERE m.conversation_id IN (${sql.join(ids.map((i) => sql`${i}::uuid`), sql`, `)}) AND m.direction = 'IN' AND m.historical = false
      AND (r.last_read_at IS NULL OR m.created_at > r.last_read_at)
    GROUP BY m.conversation_id`)
  const pending = await db.select({ conversationId: waHandoverRequests.conversationId, toUserId: waHandoverRequests.toUserId }).from(waHandoverRequests).where(and(inArray(waHandoverRequests.conversationId, ids), eq(waHandoverRequests.status, 'PENDING')))
  const names = await db.execute<{ phone: string; name: string | null }>(sql`
    SELECT DISTINCT ON (whatsapp_phone) whatsapp_phone AS phone, patient_name AS name FROM ${consultationCases}
    WHERE whatsapp_phone IN (${sql.join(convs.map((c) => sql`${c.contactPhone}`), sql`, `)}) ORDER BY whatsapp_phone, created_at DESC`)
  const owners = await userNames(convs.map((c) => c.ownerUserId))
  const latestBy = new Map(latest.map((r) => [r.conversation_id, r]))
  const unreadBy = new Map(unread.map((r) => [r.conversation_id, Number(r.n)]))
  const pendingBy = new Map(pending.map((p) => [p.conversationId, p]))
  const nameBy = new Map(names.map((n) => [n.phone, n.name]))

  return convs.map((c) => {
    const last = latestBy.get(c.id)
    const p = pendingBy.get(c.id)
    return {
      id: c.id,
      name: nameBy.get(c.contactPhone) ?? c.profileName ?? null,
      phone: maskPhone(c.contactPhone),
      owner: c.owner,
      ownerName: c.ownerUserId ? (owners.get(c.ownerUserId) ?? null) : null,
      mine: isOwner(actor, c),
      pendingHandover: Boolean(p),
      pendingForMe: Boolean(p && p.toUserId === actor.id),
      unread: unreadBy.get(c.id) ?? 0,
      lastMessageAt: c.lastMessageAt?.toISOString() ?? null,
      window: windowState(c.lastPatientMessageAt),
      preview: last
        ? { direction: last.direction, senderRole: last.sender_role, kind: last.kind, historical: Boolean(last.historical && !last.body), text: (last.body ?? null)?.slice(0, 90) ?? null }
        : null,
    }
  })
}

export async function inboxSummary(actor: InboxActor) {
  const [mine] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(waMessages)
    .innerJoin(waConversations, eq(waConversations.id, waMessages.conversationId))
    .leftJoin(waConversationReads, and(eq(waConversationReads.conversationId, waMessages.conversationId), eq(waConversationReads.userId, actor.id)))
    .where(
      and(
        eq(waConversations.owner, actor.role),
        eq(waConversations.ownerUserId, actor.id),
        eq(waMessages.direction, 'IN'),
        eq(waMessages.historical, false),
        or(isNull(waConversationReads.lastReadAt), gt(waMessages.createdAt, waConversationReads.lastReadAt)),
      ),
    )
  const [pendingForMe] = await db.select({ n: sql<number>`count(*)::int` }).from(waHandoverRequests).where(and(eq(waHandoverRequests.status, 'PENDING'), eq(waHandoverRequests.toUserId, actor.id)))
  const [queue] =
    actor.role === 'ADMIN'
      ? await db.select({ n: sql<number>`count(*)::int` }).from(waConversations).where(and(eq(waConversations.owner, 'ADMIN'), isNull(waConversations.ownerUserId)))
      : [{ n: 0 }]
  return { unreadMine: Number(mine?.n ?? 0), pendingForMe: Number(pendingForMe?.n ?? 0), adminQueue: Number(queue?.n ?? 0) }
}

export async function markRead(actor: InboxActor, conversationId: string): Promise<void> {
  const conv = await viewableConversation(actor, conversationId)
  const now = new Date()
  await db
    .insert(waConversationReads)
    .values({ conversationId: conv.id, userId: actor.id, lastReadAt: now })
    .onConflictDoUpdate({ target: [waConversationReads.conversationId, waConversationReads.userId], set: { lastReadAt: now } })
}

/** Conversation + latest page of messages (or the page before `before`), notes, files and permitted actions. */
export async function conversationView(actor: InboxActor, conversationId: string, opts: { before?: Date | null } = {}) {
  const conv = await viewableConversation(actor, conversationId)
  const rows = await db
    .select({ m: waMessages, job: { status: notificationOutbox.status, lastError: notificationOutbox.lastError, createdAt: notificationOutbox.createdAt, templateKey: notificationOutbox.templateKey } })
    .from(waMessages)
    .leftJoin(notificationOutbox, eq(notificationOutbox.id, waMessages.outboxJobId))
    .where(and(eq(waMessages.conversationId, conv.id), opts.before ? lt(waMessages.createdAt, opts.before) : undefined))
    .orderBy(desc(waMessages.createdAt), desc(waMessages.id))
    .limit(PAGE + 1)
  const hasMore = rows.length > PAGE
  const page = rows.slice(0, PAGE).reverse()
  const oldest = page[0]?.m.createdAt ?? null
  const newestBound = opts.before ?? null

  const notes = await db
    .select()
    .from(waInternalNotes)
    .where(and(eq(waInternalNotes.conversationId, conv.id), hasMore && oldest ? gte(waInternalNotes.createdAt, oldest) : undefined, newestBound ? lt(waInternalNotes.createdAt, newestBound) : undefined))
    .orderBy(asc(waInternalNotes.createdAt))
    .limit(200)
  const attachments = await db.select().from(waAttachments).where(eq(waAttachments.conversationId, conv.id)).orderBy(desc(waAttachments.createdAt)).limit(200)
  const cases = await db
    .select({ id: consultationCases.id, status: consultationCases.status, patientName: consultationCases.patientName, createdAt: consultationCases.createdAt })
    .from(consultationCases)
    .where(eq(consultationCases.whatsappPhone, conv.contactPhone))
    .orderBy(desc(consultationCases.createdAt))
    .limit(20)
  const [pending] = await db.select().from(waHandoverRequests).where(and(eq(waHandoverRequests.conversationId, conv.id), eq(waHandoverRequests.status, 'PENDING'))).limit(1)
  const names = await userNames([conv.ownerUserId, pending?.requestedBy, ...page.map((r) => r.m.senderUserId), ...notes.map((n) => n.authorId), ...attachments.map((a) => a.reviewedBy)])
  const attByMessage = new Map(attachments.filter((a) => a.messageId).map((a) => [a.messageId!, a]))

  const owner = isOwner(actor, conv)
  const window = windowState(conv.lastPatientMessageAt)
  const actions: string[] = []
  if (actor.role === 'ADMIN') {
    if (conv.owner === 'BOT' || (conv.owner === 'ADMIN' && !conv.ownerUserId)) actions.push('take_over')
    if (conv.owner === 'DOCTOR' || (conv.owner === 'ADMIN' && conv.ownerUserId && conv.ownerUserId !== actor.id)) actions.push('take_back')
    if (owner && !pending && getV1DoctorUserId()) actions.push('request_doctor')
    if (pending) actions.push('cancel_request')
  } else {
    if (pending && pending.toUserId === actor.id) actions.push('accept', 'decline')
    if (owner) actions.push('return_to_admin')
  }
  const canResume = conv.owner !== 'BOT' && (owner || (actor.role === 'ADMIN' && conv.owner === 'ADMIN' && !conv.ownerUserId))
  const resumeBlocker = canResume ? await botResumeBlocker(db, conv.contactPhone) : null
  if (canResume) actions.push('resume_bot')

  const att = (a: (typeof attachments)[number]) => ({
    id: a.id,
    messageId: a.messageId,
    caseId: a.caseId,
    source: a.source,
    mimeType: a.mimeType ?? a.declaredMimeType,
    sizeBytes: a.sizeBytes,
    durationMs: a.durationMs,
    filename: a.filename,
    fetchStatus: a.fetchStatus,
    fetchError: a.fetchError,
    canRetry: Boolean(a.providerMediaId) && (a.fetchStatus === 'FAILED' || a.fetchStatus === 'PENDING' || a.fetchStatus === 'REQUESTED'),
    label: a.label,
    flaggedAt: a.flaggedAt?.toISOString() ?? null,
    reviewedAt: a.reviewedAt?.toISOString() ?? null,
    reviewedBy: a.reviewedBy ? (names.get(a.reviewedBy) ?? null) : null,
    createdAt: a.createdAt.toISOString(),
  })

  return {
    conversation: {
      id: conv.id,
      name: cases[0]?.patientName ?? conv.profileName ?? null,
      profileName: conv.profileName,
      // Full number only for the admin (operations); the doctor sees it masked
      phone: actor.role === 'ADMIN' ? conv.contactPhone : maskPhone(conv.contactPhone),
      owner: conv.owner,
      ownerUserId: conv.ownerUserId,
      ownerName: conv.ownerUserId ? (names.get(conv.ownerUserId) ?? null) : null,
      ownerVersion: conv.ownerVersion,
      window,
    },
    me: { id: actor.id, role: actor.role, isOwner: owner, canSend: owner && window.open },
    pending: pending
      ? { id: pending.id, toMe: pending.toUserId === actor.id, requestedBy: names.get(pending.requestedBy) ?? 'Admin', summary: pending.summary, attachmentIds: pending.attachmentIds, createdAt: pending.createdAt.toISOString() }
      : null,
    actions,
    resumeBlocker,
    cases: cases.map((c) => ({ ...c, createdAt: c.createdAt.toISOString() })),
    messages: page.map(({ m, job }) => ({
      id: m.id,
      direction: m.direction,
      senderRole: m.senderRole,
      senderName: m.senderUserId ? (names.get(m.senderUserId) ?? null) : null,
      kind: m.kind,
      body: m.body,
      historical: m.historical,
      templateKey: job?.templateKey ?? null,
      replyTo: m.replyToProviderId,
      providerMessageId: m.providerMessageId,
      caseId: m.caseId,
      caseLink: m.caseLink,
      status: m.direction === 'IN' ? 'received' : deliveryState(job?.status ? job : null, m.localStatus),
      error: job?.status === 'failed' || job?.status === 'cancelled' ? (job.lastError ?? null) : null,
      at: (m.providerTimestamp ?? m.createdAt).toISOString(),
      createdAt: m.createdAt.toISOString(),
      attachment: attByMessage.has(m.id) ? att(attByMessage.get(m.id)!) : null,
    })),
    hasMore,
    notes: notes.map((n) => ({ id: n.id, body: n.body, kind: n.kind, authorRole: n.authorRole, authorName: names.get(n.authorId) ?? 'Staff', caseId: n.caseId, createdAt: n.createdAt.toISOString() })),
    attachments: attachments.map(att),
  }
}
