/**
 * eTabib V1 — WhatsApp sender allow-list administration (P1).
 * Soft-deactivate only; every change is written to staff_audit_events.
 */
import { db } from '@etabeeb/db'
import { whatsappAllowedSenders } from '@etabeeb/db/schema'
import { asc, desc, eq } from 'drizzle-orm'
import { EtabibError } from './errors'
import { normalizePhone } from './phone'
import { recordStaffAudit, last4, type StaffActorType } from './staff-audit'

export type SenderPurpose = 'PATIENT_TEST' | 'STAFF' | 'PILOT_PATIENT' | 'BLOCKED'
export type AllowedSender = typeof whatsappAllowedSenders.$inferSelect

export interface SenderActor {
  id: string
  type: StaffActorType
}

/** Normalize to E.164 or throw a 400 (accepts 03…, 07…, +…, 00…). */
export function normalizeSenderPhone(raw: string): string {
  const phone = normalizePhone(raw)
  if (!phone) throw new EtabibError('invalid_phone', 'Phone number must be a valid WhatsApp number (E.164)', 400)
  return phone
}

export async function listSenders(): Promise<AllowedSender[]> {
  return db
    .select()
    .from(whatsappAllowedSenders)
    .orderBy(desc(whatsappAllowedSenders.active), asc(whatsappAllowedSenders.purpose), asc(whatsappAllowedSenders.label))
}

export async function createSender(
  input: { phone: string; label: string; purpose: SenderPurpose; notes?: string | null },
  actor: SenderActor,
): Promise<AllowedSender> {
  const phoneE164 = normalizeSenderPhone(input.phone)
  return db.transaction(async (tx) => {
    const inserted = await tx
      .insert(whatsappAllowedSenders)
      .values({
        phoneE164,
        label: input.label,
        purpose: input.purpose,
        notes: input.notes ?? null,
        active: true,
        createdBy: actor.id,
        updatedBy: actor.id,
      })
      .onConflictDoNothing({ target: whatsappAllowedSenders.phoneE164 })
      .returning()
    const row = inserted[0]
    if (!row) throw new EtabibError('sender_exists', 'This number is already on the list; edit the existing entry', 409)
    await recordStaffAudit(
      {
        action: 'ALLOWED_SENDER_CREATED',
        actorType: actor.type,
        actorId: actor.id,
        targetType: 'whatsapp_allowed_sender',
        targetId: row.id,
        metadata: { phoneLast4: last4(phoneE164), purpose: row.purpose, active: row.active },
      },
      tx,
    )
    return row
  })
}

export async function updateSender(
  id: string,
  patch: { label?: string; purpose?: SenderPurpose; notes?: string | null; active?: boolean },
  actor: SenderActor,
): Promise<{ sender: AllowedSender; changed: boolean }> {
  return db.transaction(async (tx) => {
    const [current] = await tx
      .select()
      .from(whatsappAllowedSenders)
      .where(eq(whatsappAllowedSenders.id, id))
      .limit(1)
      .for('update')
    if (!current) throw new EtabibError('not_found', 'Sender not found', 404)

    const changes: Partial<AllowedSender> = {}
    if (patch.label !== undefined && patch.label !== current.label) changes.label = patch.label
    if (patch.purpose !== undefined && patch.purpose !== current.purpose) changes.purpose = patch.purpose
    if (patch.notes !== undefined && (patch.notes ?? null) !== current.notes) changes.notes = patch.notes ?? null
    if (patch.active !== undefined && patch.active !== current.active) changes.active = patch.active
    const changedFields = Object.keys(changes)
    if (changedFields.length === 0) return { sender: current, changed: false }

    const [updated] = await tx
      .update(whatsappAllowedSenders)
      .set({ ...changes, updatedBy: actor.id, updatedAt: new Date() })
      .where(eq(whatsappAllowedSenders.id, id))
      .returning()
    await recordStaffAudit(
      {
        action: 'ALLOWED_SENDER_UPDATED',
        actorType: actor.type,
        actorId: actor.id,
        targetType: 'whatsapp_allowed_sender',
        targetId: id,
        metadata: {
          phoneLast4: last4(current.phoneE164),
          changedFields,
          purpose: updated!.purpose,
          active: updated!.active,
        },
      },
      tx,
    )
    return { sender: updated!, changed: true }
  })
}
