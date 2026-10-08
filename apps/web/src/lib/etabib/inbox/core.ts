/**
 * eTabib V1 — shared WhatsApp inbox: feature flag, conversation store and the
 * WhatsApp customer-service window.
 *
 *   ETABIB_INBOX_ENABLED   "true" turns the inbox on (default off: nothing is
 *                          written, the bot behaves exactly as before, the
 *                          inbox pages and APIs answer 404)
 *
 * A conversation is one WhatsApp contact. It is NOT a patient (a number may
 * book for several family members) and NOT a case; messages are linked to a
 * case only when that is unambiguous (the contact's single open case).
 */
import { and, desc, eq, notInArray, sql } from 'drizzle-orm'
import { db } from '@etabeeb/db'
import { consultationCases, waConversations, waMessages } from '@etabeeb/db/schema'
import { CLOSED_STATUSES, type Tx } from '../transitions'

export function isInboxEnabled(): boolean {
  return process.env.ETABIB_INBOX_ENABLED?.trim().toLowerCase() === 'true'
}

export type Conversation = typeof waConversations.$inferSelect
export type ConversationOwner = Conversation['owner']
export type InboxRole = 'ADMIN' | 'DOCTOR'

/** Meta allows free-form messages for 24 h after the patient's last message; keep a safety margin. */
export const WINDOW_MS = 23.5 * 3600_000

export interface WindowState {
  open: boolean
  /** When free-form messages stop being allowed (null if never opened). */
  closesAt: string | null
  lastPatientMessageAt: string | null
}

export function windowState(lastPatientMessageAt: Date | null, now = Date.now()): WindowState {
  if (!lastPatientMessageAt) return { open: false, closesAt: null, lastPatientMessageAt: null }
  const closes = lastPatientMessageAt.getTime() + WINDOW_MS
  return { open: now < closes, closesAt: new Date(closes).toISOString(), lastPatientMessageAt: lastPatientMessageAt.toISOString() }
}

/** Find or create the conversation for a WhatsApp contact (inside the caller's transaction). */
export async function ensureConversation(tx: Tx, contactPhone: string, profileName?: string | null): Promise<Conversation> {
  await tx
    .insert(waConversations)
    .values({ contactPhone, profileName: profileName ?? null })
    .onConflictDoNothing({ target: waConversations.contactPhone })
  const [conv] = await tx.select().from(waConversations).where(eq(waConversations.contactPhone, contactPhone)).limit(1).for('update')
  if (!conv) throw new Error('conversation_unavailable')
  if (profileName && profileName !== conv.profileName) {
    await tx.update(waConversations).set({ profileName: profileName.slice(0, 120), updatedAt: new Date() }).where(eq(waConversations.id, conv.id))
  }
  return conv
}

export async function conversationByPhone(phone: string, executor: Tx | typeof db = db): Promise<Conversation | null> {
  const [conv] = await executor.select().from(waConversations).where(eq(waConversations.contactPhone, phone)).limit(1)
  return conv ?? null
}

/** The contact's single open case (unique per WhatsApp sender), if any. */
export async function openCaseForContact(executor: Tx | typeof db, phone: string): Promise<{ id: string; status: string; patientName: string | null } | null> {
  const [row] = await executor
    .select({ id: consultationCases.id, status: consultationCases.status, patientName: consultationCases.patientName })
    .from(consultationCases)
    .where(and(eq(consultationCases.whatsappPhone, phone), notInArray(consultationCases.status, [...CLOSED_STATUSES])))
    .limit(1)
  return row ?? null
}

/** The contact's most recent case (open or closed). */
export async function latestCaseForContact(executor: Tx | typeof db, phone: string): Promise<{ id: string; status: string; patientName: string | null } | null> {
  const [row] = await executor
    .select({ id: consultationCases.id, status: consultationCases.status, patientName: consultationCases.patientName })
    .from(consultationCases)
    .where(eq(consultationCases.whatsappPhone, phone))
    .orderBy(desc(consultationCases.createdAt))
    .limit(1)
  return row ?? null
}

/** Case link for a new message: AUTO to the single open case, otherwise NEEDED (never guessed). */
export function caseLinkFor(openCaseId: string | null): { caseId: string | null; caseLink: 'AUTO' | 'NEEDED' } {
  return openCaseId ? { caseId: openCaseId, caseLink: 'AUTO' } : { caseId: null, caseLink: 'NEEDED' }
}

export async function touchConversation(tx: Tx, conversationId: string, at: Date, patientAt?: Date | null): Promise<void> {
  const ts = (d: Date) => sql`${d.toISOString()}::timestamptz`
  await tx
    .update(waConversations)
    .set({
      lastMessageAt: sql`greatest(coalesce(${waConversations.lastMessageAt}, ${ts(at)}), ${ts(at)})`,
      ...(patientAt ? { lastPatientMessageAt: sql`greatest(coalesce(${waConversations.lastPatientMessageAt}, ${ts(patientAt)}), ${ts(patientAt)})` } : {}),
      updatedAt: new Date(),
    })
    .where(eq(waConversations.id, conversationId))
}

export type NewMessage = typeof waMessages.$inferInsert
