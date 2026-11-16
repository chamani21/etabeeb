/**
 * Append-only audit for staff actions that are not tied to one consultation
 * case (password change/reset, allow-list changes). Case-level actions keep
 * using case_events. Metadata must never contain passwords, tokens, secrets or
 * full phone numbers (use last4()).
 */
import { db } from '@etabeeb/db'
import { staffAuditEvents } from '@etabeeb/db/schema'
import type { Tx } from './transitions'

export const STAFF_AUDIT_ACTIONS = [
  'PASSWORD_CHANGED',
  'PASSWORD_CHANGE_REJECTED',
  'PASSWORD_RESET_REQUESTED',
  'PASSWORD_RESET_COMPLETED',
  'PASSWORD_RESET_REJECTED',
  'ALLOWED_SENDER_CREATED',
  'ALLOWED_SENDER_UPDATED',
  // Shared WhatsApp inbox (conversation ownership, files, case association)
  'INBOX_TAKE_OVER',
  'INBOX_TAKEN_BACK',
  'INBOX_HANDOVER_REQUESTED',
  'INBOX_HANDOVER_CANCELLED',
  'INBOX_HANDOVER_ACCEPTED',
  'INBOX_HANDOVER_DECLINED',
  'INBOX_RETURNED_TO_ADMIN',
  'INBOX_BOT_RESUMED',
  'INBOX_CASE_LINKED',
  'INBOX_FILE_UPDATED',
] as const
export type StaffAuditAction = (typeof STAFF_AUDIT_ACTIONS)[number]

export type StaffActorType = 'ADMIN' | 'DOCTOR' | 'SYSTEM' | 'ANONYMOUS'

export interface StaffAuditInput {
  action: StaffAuditAction
  actorType: StaffActorType
  actorId?: string | null | undefined
  targetType?: string | undefined
  targetId?: string | undefined
  metadata?: Record<string, string | number | boolean | null | string[]> | undefined
}

export async function recordStaffAudit(input: StaffAuditInput, tx?: Tx): Promise<void> {
  const executor = tx ?? db
  await executor.insert(staffAuditEvents).values({
    action: input.action,
    actorType: input.actorType,
    actorId: input.actorId ?? null,
    targetType: input.targetType ?? null,
    targetId: input.targetId ?? null,
    metadata: input.metadata ?? null,
  })
}

export function actorTypeForRole(role: string | undefined): StaffActorType {
  return role === 'administrator' ? 'ADMIN' : role === 'practitioner' ? 'DOCTOR' : 'SYSTEM'
}

/** Last four digits of a phone number, for audit metadata and UI masking. */
export function last4(phone: string | null | undefined): string | null {
  if (!phone) return null
  const digits = phone.replace(/\D/g, '')
  return digits.length >= 4 ? digits.slice(-4) : null
}

/** Masked display form, e.g. "+92 *** ***4010". */
export function maskPhone(phone: string | null | undefined): string | null {
  const tail = last4(phone)
  if (!phone || !tail) return null
  const cc = phone.startsWith('+') ? phone.slice(0, 3) : ''
  return `${cc} *** ***${tail}`.trim()
}
