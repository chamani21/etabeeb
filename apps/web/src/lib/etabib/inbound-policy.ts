/**
 * eTabib V1 — inbound sender gating (P1).
 *
 * Decides whether an inbound WhatsApp message may enter the patient flow. Runs
 * in the backend (not only in n8n), inside the same transaction as the wamid
 * ledger insert, so even an accidentally activated n8n workflow cannot create
 * cases while inbound is switched off.
 *
 * Order of checks (first match wins):
 *   1. kill switch off, or mode `disabled`          → ignored_disabled
 *   2. sender is a known staff identity              → ignored_staff
 *   3. sender is an active BLOCKED entry             → ignored_blocked
 *   4. mode `public`                                 → processed
 *   5. mode `allowlist` + active PATIENT_TEST/PILOT  → processed, else ignored_not_allowed
 *
 * Staff identities are explicit, never inferred: the configured admin/doctor
 * WhatsApp numbers, active STAFF allow-list entries, and active users holding
 * the administrator or practitioner role.
 */
import { and, eq, isNull } from 'drizzle-orm'
import { roles, userRoles, users, whatsappAllowedSenders } from '@etabeeb/db/schema'
import { getAdminWhatsapp, getDoctorWhatsapp, getInboundMode, isInboundEnabled, type InboundMode } from './config'
import type { Tx } from './transitions'

export const INBOUND_DISPOSITIONS = [
  'processed',
  'ignored_disabled',
  'ignored_staff',
  'ignored_blocked',
  'ignored_not_allowed',
] as const
export type InboundDisposition = (typeof INBOUND_DISPOSITIONS)[number]

export interface InboundPolicy {
  enabled: boolean
  mode: InboundMode
}

/** Effective policy: the kill switch overrides the mode. */
export function getInboundPolicy(): InboundPolicy {
  const enabled = isInboundEnabled()
  return { enabled, mode: enabled ? getInboundMode() : 'disabled' }
}

const STAFF_ROLES = ['administrator', 'practitioner'] as const

export async function isStaffSender(tx: Tx, phoneE164: string): Promise<boolean> {
  if (phoneE164 === getAdminWhatsapp() || phoneE164 === getDoctorWhatsapp()) return true
  const [listed] = await tx
    .select({ id: whatsappAllowedSenders.id })
    .from(whatsappAllowedSenders)
    .where(
      and(
        eq(whatsappAllowedSenders.phoneE164, phoneE164),
        eq(whatsappAllowedSenders.purpose, 'STAFF'),
        eq(whatsappAllowedSenders.active, true),
      ),
    )
    .limit(1)
  if (listed) return true
  const staffUsers = await tx
    .select({ role: roles.name })
    .from(users)
    .innerJoin(userRoles, and(eq(userRoles.userId, users.id), isNull(userRoles.revokedAt)))
    .innerJoin(roles, eq(roles.id, userRoles.roleId))
    .where(and(eq(users.phoneE164, phoneE164), eq(users.isActive, true), isNull(users.deletedAt)))
  return staffUsers.some((r) => (STAFF_ROLES as readonly string[]).includes(r.role))
}

export async function evaluateInboundSender(tx: Tx, phoneE164: string): Promise<InboundDisposition> {
  const policy = getInboundPolicy()
  if (!policy.enabled || policy.mode === 'disabled') return 'ignored_disabled'
  if (await isStaffSender(tx, phoneE164)) return 'ignored_staff'

  const [entry] = await tx
    .select({ purpose: whatsappAllowedSenders.purpose })
    .from(whatsappAllowedSenders)
    .where(and(eq(whatsappAllowedSenders.phoneE164, phoneE164), eq(whatsappAllowedSenders.active, true)))
    .limit(1)
  if (entry?.purpose === 'BLOCKED') return 'ignored_blocked'
  if (policy.mode === 'public') return 'processed'
  return entry && (entry.purpose === 'PATIENT_TEST' || entry.purpose === 'PILOT_PATIENT')
    ? 'processed'
    : 'ignored_not_allowed'
}
