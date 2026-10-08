/**
 * eTabib V1 inbox — conversation ownership and two-way admin/doctor handover.
 *
 *   BOT ──take_over──▶ ADMIN ──request_doctor──▶ (pending; ADMIN still owns)
 *                        ▲  ◀──cancel_request / decline──┘
 *                        │          accept ──▶ DOCTOR
 *                        └──── return_to_admin / take_back ◀┘
 *   ADMIN/DOCTOR ──resume_bot──▶ BOT (only when the bot has a valid continuation)
 *
 * Every change runs in one transaction with the conversation row locked and the
 * caller's expected ownership version checked (stale screens / double clicks
 * fail with 409). The version is bumped on every owner change; queued staff
 * replies written under an older version are cancelled here and re-checked at
 * dispatch. Typing a message never changes ownership.
 */
import { and, desc, eq, inArray } from 'drizzle-orm'
import { db } from '@etabeeb/db'
import { users, waAttachments, waConversations, waHandoverRequests, waInternalNotes, waMessages } from '@etabeeb/db/schema'
import { EtabibError } from '../errors'
import { getV1DoctorUserId } from '../config'
import { enqueueOutboundJob } from '../outbound'
import { recordStaffAudit, type StaffAuditAction } from '../staff-audit'
import type { Tx } from '../transitions'
import { caseLinkFor, latestCaseForContact, openCaseForContact, windowState, type Conversation, type InboxRole } from './core'
import { cancelStaleStaffReplies, withdrawQueuedBotReplies } from './dispatch'
import { HANDOVER_NOTICES_PS } from './notices'

export interface InboxActor {
  id: string
  role: InboxRole
}

export const OWNERSHIP_ACTIONS = ['take_over', 'take_back', 'request_doctor', 'cancel_request', 'accept', 'decline', 'return_to_admin', 'resume_bot'] as const
export type OwnershipAction = (typeof OWNERSHIP_ACTIONS)[number]

export interface OwnershipInput {
  action: OwnershipAction
  expectedVersion: number
  summary?: string | undefined
  attachmentIds?: string[] | undefined
  reason?: string | undefined
  instruction?: string | undefined
}

export interface OwnershipResult {
  conversationId: string
  owner: Conversation['owner']
  ownerUserId: string | null
  ownerVersion: number
  noticeJobIds: string[]
}

const conflict = (message: string) => new EtabibError('ownership_conflict', message, 409)
const forbidden = (message: string) => new EtabibError('forbidden', message, 403)

async function lockConversation(tx: Tx, id: string): Promise<Conversation> {
  const [conv] = await tx.select().from(waConversations).where(eq(waConversations.id, id)).limit(1).for('update')
  if (!conv) throw new EtabibError('not_found', 'Conversation not found', 404)
  return conv
}

async function pendingRequest(tx: Tx, conversationId: string) {
  const [req] = await tx
    .select()
    .from(waHandoverRequests)
    .where(and(eq(waHandoverRequests.conversationId, conversationId), eq(waHandoverRequests.status, 'PENDING')))
    .limit(1)
    .for('update')
  return req ?? null
}

async function note(tx: Tx, conv: Conversation, actor: InboxActor, body: string, kind: string): Promise<void> {
  const open = await openCaseForContact(tx, conv.contactPhone)
  await tx.insert(waInternalNotes).values({ conversationId: conv.id, authorId: actor.id, authorRole: actor.role, body: body.slice(0, 2000), caseId: open?.id ?? null, kind })
}

async function audit(tx: Tx, actor: InboxActor, action: StaffAuditAction, conv: Conversation, metadata: Record<string, string | number | boolean | null> = {}): Promise<void> {
  await recordStaffAudit({ action, actorType: actor.role, actorId: actor.id, targetType: 'wa_conversation', targetId: conv.id, metadata }, tx)
}

/** One Pashto notice per transition, only while Meta's window is open (no template is used for this). */
async function notice(tx: Tx, conv: Conversation, version: number, text: string): Promise<string[]> {
  if (!windowState(conv.lastPatientMessageAt).open) return []
  const latest = await latestCaseForContact(tx, conv.contactPhone)
  if (!latest) return []
  const open = await openCaseForContact(tx, conv.contactPhone)
  const link = caseLinkFor(open?.id ?? null)
  const [msg] = await tx
    .insert(waMessages)
    .values({ conversationId: conv.id, direction: 'OUT', senderRole: 'SYSTEM', kind: 'text', body: text, ownerVersion: version, caseId: link.caseId, caseLink: link.caseLink })
    .returning({ id: waMessages.id })
  const job = await enqueueOutboundJob(tx, {
    type: 'INBOX_NOTICE',
    consultationId: latest.id,
    dedupeKey: `${conv.id}:v${version}`,
    recipientPhone: conv.contactPhone,
    conversationId: conv.id,
    messageId: msg!.id,
  })
  await tx.update(waMessages).set({ outboxJobId: job.id }).where(eq(waMessages.id, msg!.id))
  return job.created ? [job.id] : []
}

async function setOwner(tx: Tx, conv: Conversation, owner: Conversation['owner'], ownerUserId: string | null): Promise<number> {
  const version = conv.ownerVersion + 1
  const [updated] = await tx
    .update(waConversations)
    .set({ owner, ownerUserId, ownerVersion: version, updatedAt: new Date() })
    .where(and(eq(waConversations.id, conv.id), eq(waConversations.ownerVersion, conv.ownerVersion)))
    .returning({ v: waConversations.ownerVersion })
  if (!updated) throw conflict('The conversation changed in the meantime. Reload and try again.')
  await cancelStaleStaffReplies(tx, conv.id, version)
  return version
}

async function isActiveAdmin(tx: Tx, userId: string | null): Promise<boolean> {
  if (!userId) return false
  const [u] = await tx.select({ active: users.isActive }).from(users).where(eq(users.id, userId)).limit(1)
  return Boolean(u?.active)
}

/** Whether "Resume bot" has a valid continuation (never restarts intake or repeats the name question). */
export async function botResumeBlocker(executor: Tx | typeof db, contactPhone: string): Promise<string | null> {
  const open = await openCaseForContact(executor, contactPhone)
  if (open && open.status === 'NEW' && !open.patientName) {
    return 'The bot would have to ask for the patient’s name again. Keep the conversation with staff and complete the intake manually.'
  }
  return null
}

export async function changeOwnership(conversationId: string, actor: InboxActor, input: OwnershipInput): Promise<OwnershipResult> {
  return db.transaction(async (tx) => {
    const conv = await lockConversation(tx, conversationId)
    if (input.expectedVersion !== conv.ownerVersion) throw conflict('The conversation changed in the meantime. Reload and try again.')
    const pending = await pendingRequest(tx, conv.id)
    let noticeJobIds: string[] = []
    let version = conv.ownerVersion
    let owner = conv.owner
    let ownerUserId = conv.ownerUserId
    const now = new Date()

    switch (input.action) {
      case 'take_over': {
        if (actor.role !== 'ADMIN') throw forbidden('Only an admin can take over a conversation')
        if (!(conv.owner === 'BOT' || (conv.owner === 'ADMIN' && !conv.ownerUserId))) throw conflict('This conversation already has an owner. Use “Take back to admin”.')
        version = await setOwner(tx, conv, 'ADMIN', actor.id)
        ;[owner, ownerUserId] = ['ADMIN', actor.id]
        await withdrawQueuedBotReplies(tx, conv.contactPhone)
        if (conv.owner === 'BOT') noticeJobIds = await notice(tx, conv, version, HANDOVER_NOTICES_PS.staffJoined)
        await audit(tx, actor, 'INBOX_TAKE_OVER', conv, { from: conv.owner })
        break
      }
      case 'take_back': {
        if (actor.role !== 'ADMIN') throw forbidden('Only an admin can take a conversation back')
        if (!(conv.owner === 'DOCTOR' || (conv.owner === 'ADMIN' && conv.ownerUserId !== actor.id))) throw conflict('Nothing to take back')
        if (pending) await tx.update(waHandoverRequests).set({ status: 'CANCELLED', resolvedBy: actor.id, resolvedAt: now }).where(eq(waHandoverRequests.id, pending.id))
        version = await setOwner(tx, conv, 'ADMIN', actor.id)
        ;[owner, ownerUserId] = ['ADMIN', actor.id]
        await withdrawQueuedBotReplies(tx, conv.contactPhone)
        if (conv.owner === 'DOCTOR') noticeJobIds = await notice(tx, conv, version, HANDOVER_NOTICES_PS.backToStaff)
        await note(tx, conv, actor, 'Admin took the conversation back.', 'TAKE_BACK')
        await audit(tx, actor, 'INBOX_TAKEN_BACK', conv, { from: conv.owner })
        break
      }
      case 'request_doctor': {
        if (actor.role !== 'ADMIN' || conv.owner !== 'ADMIN' || conv.ownerUserId !== actor.id) throw forbidden('Only the admin who owns this conversation can request the doctor')
        if (pending) throw conflict('A doctor handover is already pending')
        const doctorId = getV1DoctorUserId()
        if (!doctorId) throw new EtabibError('not_configured', 'No doctor is configured', 409)
        const summary = (input.summary ?? '').trim()
        if (summary.length < 3 || summary.length > 1000) throw new EtabibError('validation_error', 'Write a short summary for the doctor (3–1000 characters)', 400)
        const ids = [...new Set(input.attachmentIds ?? [])].slice(0, 20)
        if (ids.length) {
          const found = await tx.select({ id: waAttachments.id }).from(waAttachments).where(and(eq(waAttachments.conversationId, conv.id), inArray(waAttachments.id, ids)))
          if (found.length !== ids.length) throw new EtabibError('validation_error', 'Selected files do not belong to this conversation', 400)
          await tx.update(waAttachments).set({ flaggedAt: now, flaggedBy: actor.id, updatedAt: now }).where(and(inArray(waAttachments.id, ids), eq(waAttachments.conversationId, conv.id)))
        }
        await tx.insert(waHandoverRequests).values({ conversationId: conv.id, requestedBy: actor.id, toUserId: doctorId, summary, attachmentIds: ids })
        await note(tx, conv, actor, `Doctor handover requested: ${summary}`, 'HANDOVER_REQUEST')
        await audit(tx, actor, 'INBOX_HANDOVER_REQUESTED', conv, { files: ids.length })
        break
      }
      case 'cancel_request': {
        if (actor.role !== 'ADMIN') throw forbidden('Only an admin can cancel the request')
        if (!pending) throw conflict('There is no pending handover request')
        await tx.update(waHandoverRequests).set({ status: 'CANCELLED', resolvedBy: actor.id, resolvedAt: now }).where(eq(waHandoverRequests.id, pending.id))
        await note(tx, conv, actor, 'Doctor handover request cancelled.', 'HANDOVER_CANCELLED')
        await audit(tx, actor, 'INBOX_HANDOVER_CANCELLED', conv)
        break
      }
      case 'accept': {
        if (actor.role !== 'DOCTOR') throw forbidden('Only the doctor can accept')
        if (!pending) throw conflict('There is no pending handover request')
        if (pending.toUserId !== actor.id) throw forbidden('This request is for another doctor')
        await tx.update(waHandoverRequests).set({ status: 'ACCEPTED', resolvedBy: actor.id, resolvedAt: now }).where(eq(waHandoverRequests.id, pending.id))
        version = await setOwner(tx, conv, 'DOCTOR', actor.id)
        ;[owner, ownerUserId] = ['DOCTOR', actor.id]
        noticeJobIds = await notice(tx, conv, version, HANDOVER_NOTICES_PS.doctorJoined)
        await audit(tx, actor, 'INBOX_HANDOVER_ACCEPTED', conv)
        break
      }
      case 'decline': {
        if (actor.role !== 'DOCTOR') throw forbidden('Only the doctor can decline')
        if (!pending) throw conflict('There is no pending handover request')
        if (pending.toUserId !== actor.id) throw forbidden('This request is for another doctor')
        const reason = (input.reason ?? '').trim()
        if (reason.length < 3 || reason.length > 500) throw new EtabibError('validation_error', 'Give a short internal reason (3–500 characters)', 400)
        await tx.update(waHandoverRequests).set({ status: 'DECLINED', resolvedBy: actor.id, resolvedAt: now, declineReason: reason }).where(eq(waHandoverRequests.id, pending.id))
        await note(tx, conv, actor, `Doctor declined the handover: ${reason}`, 'HANDOVER_DECLINED')
        await audit(tx, actor, 'INBOX_HANDOVER_DECLINED', conv)
        break
      }
      case 'return_to_admin': {
        if (actor.role !== 'DOCTOR' || conv.owner !== 'DOCTOR' || conv.ownerUserId !== actor.id) throw forbidden('Only the doctor who owns this conversation can return it')
        // Back to the admin who asked for the doctor; the shared admin queue if that account is gone
        const [lastAccepted] = await tx
          .select({ requestedBy: waHandoverRequests.requestedBy })
          .from(waHandoverRequests)
          .where(and(eq(waHandoverRequests.conversationId, conv.id), eq(waHandoverRequests.status, 'ACCEPTED')))
          .orderBy(desc(waHandoverRequests.resolvedAt))
          .limit(1)
        const target = (await isActiveAdmin(tx, lastAccepted?.requestedBy ?? null)) ? lastAccepted!.requestedBy : null
        version = await setOwner(tx, conv, 'ADMIN', target)
        ;[owner, ownerUserId] = ['ADMIN', target]
        const instruction = (input.instruction ?? '').trim().slice(0, 1000)
        await note(tx, conv, actor, instruction ? `Returned to admin: ${instruction}` : 'Returned to admin.', 'RETURNED')
        noticeJobIds = await notice(tx, conv, version, HANDOVER_NOTICES_PS.backToStaff)
        await audit(tx, actor, 'INBOX_RETURNED_TO_ADMIN', conv, { toQueue: target === null })
        break
      }
      case 'resume_bot': {
        const isOwner = conv.owner !== 'BOT' && ((conv.owner === actor.role && conv.ownerUserId === actor.id) || (actor.role === 'ADMIN' && conv.owner === 'ADMIN' && !conv.ownerUserId))
        if (!isOwner) throw forbidden('Only the current owner can hand the conversation back to the bot')
        const blocker = await botResumeBlocker(tx, conv.contactPhone)
        if (blocker) throw new EtabibError('bot_resume_blocked', blocker, 409)
        if (pending) await tx.update(waHandoverRequests).set({ status: 'CANCELLED', resolvedBy: actor.id, resolvedAt: now }).where(eq(waHandoverRequests.id, pending.id))
        version = await setOwner(tx, conv, 'BOT', null)
        ;[owner, ownerUserId] = ['BOT', null]
        await note(tx, conv, actor, 'Conversation handed back to the bot.', 'BOT_RESUMED')
        await audit(tx, actor, 'INBOX_BOT_RESUMED', conv)
        break
      }
    }
    return { conversationId: conv.id, owner, ownerUserId, ownerVersion: version, noticeJobIds }
  })
}
