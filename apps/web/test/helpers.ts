/** Shared helpers for DB-backed eTabib tests. Synthetic data only. */
import { NextRequest } from 'next/server'
import { db } from '@etabeeb/db'
import { users, consultationCases, caseEvents, notificationOutbox } from '@etabeeb/db/schema'
import { asc, eq, like } from 'drizzle-orm'
import { sql } from 'drizzle-orm'
import { processInboundMessage, type InboundMessage } from '@/lib/etabib/whatsapp'
import {
  submitAdminIntake,
  confirmPayment,
  requestDoctorApproval,
  applyDoctorDecision,
  startConsultation,
  createCasePrescription,
} from '@/lib/etabib/cases'
import type { Actor } from '@/lib/etabib/transitions'

export const hasTestDb = Boolean(process.env.ETABIB_TEST_DATABASE_URL)
export const HOOK_KEY = 'test-hook-key-not-a-real-secret'

export async function resetDb(): Promise<void> {
  // TRUNCATE does not fire the case_events row-level immutability trigger
  await db.transaction(async (tx) => {
    await tx.execute(sql`SET LOCAL client_min_messages = warning`)
    await tx.execute(sql`TRUNCATE case_events, whatsapp_events, consultation_cases, integration_errors,
      notification_outbox, prescription_items, prescriptions, whatsapp_allowed_senders, staff_audit_events,
      consultation_join_tokens, consultation_video_sessions,
      password_reset_tokens, etabib_runtime_status, user_roles, roles, users CASCADE`)
  })
}

let phoneSeq = 1000000
export function fakePhone(): string {
  phoneSeq += 1
  return `+92300${phoneSeq}`
}

export async function createUser(displayName = 'Synthetic User'): Promise<string> {
  const [u] = await db.insert(users).values({ phoneE164: fakePhone(), displayName }).returning({ id: users.id })
  return u!.id
}

let wamidSeq = 0
export function inbound(from: string, text: string | null, type = 'text'): InboundMessage {
  wamidSeq += 1
  return { wamid: `wamid.TEST.${Date.now()}.${wamidSeq}`, from, type, text }
}

export function metaPayload(from: string, wamid: string, text: string) {
  return {
    object: 'whatsapp_business_account',
    entry: [
      {
        id: 'TEST_WABA',
        changes: [
          {
            field: 'messages',
            value: {
              messaging_product: 'whatsapp',
              contacts: [{ wa_id: from.replace('+', ''), profile: { name: 'Synthetic' } }],
              messages: [{ from: from.replace('+', ''), id: wamid, timestamp: '1700000000', type: 'text', text: { body: text } }],
            },
          },
        ],
      },
    ],
  }
}

export function jsonRequest(path: string, body: unknown, headers: Record<string, string> = {}): NextRequest {
  return new NextRequest(`http://localhost${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...headers },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  })
}

export async function getCase(id: string) {
  const [c] = await db.select().from(consultationCases).where(eq(consultationCases.id, id))
  return c!
}

export async function eventsFor(id: string) {
  return db.select().from(caseEvents).where(eq(caseEvents.consultationId, id)).orderBy(asc(caseEvents.createdAt))
}

export async function jobsOfType(type: string) {
  return db.select().from(notificationOutbox).where(like(notificationOutbox.idempotencyKey, `etabib:${type}:%`))
}

export const future = (hours: number) => new Date(Date.now() + hours * 3600_000)

export const intake = {
  age: 34,
  sex: 'FEMALE' as const,
  consultationFor: 'SELF' as const,
  location: 'Synthetic District',
  mainComplaint: 'Synthetic complaint for testing',
  medicalHistory: 'None (synthetic)',
}

export const rxItems = [
  { genericName: 'Paracetamol', strength: '500mg', dose: '1 tablet', frequency: 'twice daily', substitutionAllowed: true, isControlled: false },
]

/** Drive a case through the real services up to (and including) `target`. */
export async function caseAt(
  target:
    | 'ADMIN_INTAKE'
    | 'AWAITING_PAYMENT'
    | 'PAYMENT_RECEIVED'
    | 'AWAITING_DOCTOR_APPROVAL'
    | 'CONFIRMED'
    | 'IN_CONSULTATION'
    | 'PRESCRIBED',
  ctx: { adminId: string; doctorId: string },
) {
  const sender = fakePhone()
  const first = await processInboundMessage(inbound(sender, 'Salam'))
  await processInboundMessage(inbound(sender, 'Synthetic Patient'))
  await processInboundMessage(inbound(sender, '03001234567'))
  const id = first.consultationId!
  const admin: Actor = { type: 'ADMIN', id: ctx.adminId }
  const doctor = { type: 'DOCTOR' as const, id: ctx.doctorId }
  const approvedTime = future(48)
  const steps: Array<[string, () => Promise<unknown>]> = [
    ['AWAITING_PAYMENT', () => submitAdminIntake(id, intake, admin)],
    ['PAYMENT_RECEIVED', () => confirmPayment(id, { received: true, source: 'EASYPAISA', reference: 'SYN-REF', amount: 2000 }, admin)],
    ['AWAITING_DOCTOR_APPROVAL', () => requestDoctorApproval(id, approvedTime, admin)],
    ['CONFIRMED', () => applyDoctorDecision(id, { decision: 'APPROVED', approvedTime }, doctor)],
    ['IN_CONSULTATION', () => startConsultation(id, doctor)],
    ['PRESCRIBED', () => createCasePrescription(id, rxItems, doctor)],
  ]
  if (target !== 'ADMIN_INTAKE') {
    for (const [name, run] of steps) {
      await run()
      if (name === target) break
    }
  }
  return { id, sender, approvedTime }
}

// ---- P1 helpers ----
import { roles, userRoles } from '@etabeeb/db/schema'
import bcryptjs from 'bcryptjs'

/** Create a staff user with a real role row (and optionally a known password). */
export async function createStaffUser(
  role: 'administrator' | 'practitioner' | 'patient',
  opts: { phone?: string; password?: string; mustChangePassword?: boolean; displayName?: string; email?: string } = {},
): Promise<{ id: string; phone: string }> {
  const phone = opts.phone ?? fakePhone()
  const [r] = await db.insert(roles).values({ name: role }).onConflictDoNothing().returning({ id: roles.id })
  const roleId = r?.id ?? (await db.select({ id: roles.id }).from(roles).where(eq(roles.name, role)))[0]!.id
  const [u] = await db
    .insert(users)
    .values({
      phoneE164: phone,
      displayName: opts.displayName ?? `Synthetic ${role}`,
      email: opts.email ?? null,
      passwordHash: opts.password ? await bcryptjs.hash(opts.password, 4) : null,
      mustChangePassword: opts.mustChangePassword ?? false,
    })
    .returning({ id: users.id })
  await db.insert(userRoles).values({ userId: u!.id, roleId })
  return { id: u!.id, phone }
}
