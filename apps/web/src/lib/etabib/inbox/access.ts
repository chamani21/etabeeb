/**
 * eTabib V1 inbox — who may see and act on a conversation.
 *
 *  - Admin: every conversation (operations owner).
 *  - Doctor (the configured V1 doctor only): conversations they own, have been
 *    asked to take, or whose contact has a case that reached the doctor
 *    (awaiting approval or later). Everything else answers 404, not 403.
 *  - Sending patient-facing messages: only the current human owner.
 */
import { and, eq, or, sql } from 'drizzle-orm'
import { db } from '@etabeeb/db'
import { consultationCases, waConversations, waHandoverRequests } from '@etabeeb/db/schema'
import { getCurrentUser } from '@/lib/auth-helpers'
import { EtabibError } from '../errors'
import { requireAdmin, requireV1Doctor } from '../auth'
import { isInboxEnabled, type Conversation } from './core'
import type { InboxActor } from './ownership'

/** Case statuses at which the doctor is involved with a contact. */
export const DOCTOR_CASE_STATUSES = ['AWAITING_DOCTOR_APPROVAL', 'CONFIRMED', 'IN_CONSULTATION', 'PRESCRIPTION_SENT', 'COMPLETED'] as const

export function requireInboxEnabled(): void {
  if (!isInboxEnabled()) throw new EtabibError('not_found', 'Not found', 404)
}

/** Signed-in admin or V1 doctor (password must be current), as an inbox actor. */
export async function requireInboxActor(): Promise<InboxActor> {
  requireInboxEnabled()
  const user = await getCurrentUser()
  if (user?.role === 'administrator') return { id: (await requireAdmin()).id, role: 'ADMIN' }
  return { id: (await requireV1Doctor()).id, role: 'DOCTOR' }
}

/** SQL condition: conversations the doctor may see. */
export function doctorVisibleSql(doctorId: string) {
  return or(
    and(eq(waConversations.owner, 'DOCTOR'), eq(waConversations.ownerUserId, doctorId)),
    sql`EXISTS (SELECT 1 FROM ${waHandoverRequests} h WHERE h.conversation_id = ${waConversations.id} AND h.to_user_id = ${doctorId})`,
    sql`EXISTS (SELECT 1 FROM ${consultationCases} c WHERE c.whatsapp_phone = ${waConversations.contactPhone} AND c.status IN (${sql.join(DOCTOR_CASE_STATUSES.map((s) => sql`${s}`), sql`, `)}))`,
  )!
}

export async function canView(actor: InboxActor, conversationId: string): Promise<boolean> {
  if (actor.role === 'ADMIN') return true
  const [row] = await db
    .select({ id: waConversations.id })
    .from(waConversations)
    .where(and(eq(waConversations.id, conversationId), doctorVisibleSql(actor.id)))
    .limit(1)
  return Boolean(row)
}

/** Load a conversation the actor may see (404 otherwise — no existence leak). */
export async function viewableConversation(actor: InboxActor, conversationId: string): Promise<Conversation> {
  if (!/^[0-9a-f-]{36}$/i.test(conversationId)) throw new EtabibError('not_found', 'Conversation not found', 404)
  const [conv] = await db.select().from(waConversations).where(eq(waConversations.id, conversationId)).limit(1)
  if (!conv || !(await canView(actor, conv.id))) throw new EtabibError('not_found', 'Conversation not found', 404)
  return conv
}

export function isOwner(actor: InboxActor, conv: Pick<Conversation, 'owner' | 'ownerUserId'>): boolean {
  return conv.owner === actor.role && conv.ownerUserId === actor.id
}

/** Cases of this contact (the only cases a message/file of the conversation may be linked to). */
export async function contactCaseIds(contactPhone: string): Promise<string[]> {
  const rows = await db.select({ id: consultationCases.id }).from(consultationCases).where(eq(consultationCases.whatsappPhone, contactPhone))
  return rows.map((r) => r.id)
}

export async function assertCaseOfContact(contactPhone: string, caseId: string): Promise<void> {
  const ids = await contactCaseIds(contactPhone)
  if (!ids.includes(caseId)) throw new EtabibError('validation_error', 'That case does not belong to this WhatsApp contact', 400)
}

