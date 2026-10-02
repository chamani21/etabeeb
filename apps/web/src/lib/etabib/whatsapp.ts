/**
 * eTabib V1 — WhatsApp inbound intake (deterministic, no AI).
 *
 * The bot collects ONLY: 1) patient name, 2) patient phone.
 * Then the case moves NEW → ADMIN_INTAKE, the admin is notified through the
 * outbound service, and automated questioning stops. All clinical intake
 * (age, sex, complaint, history, location, …) belongs to the admin workflow.
 */
import { z } from 'zod'
import { db } from '@etabeeb/db'
import { consultationCases, whatsappEvents } from '@etabeeb/db/schema'
import type { ConsultationCase } from '@etabeeb/db'
import { and, eq, ne, sql } from 'drizzle-orm'
import { normalizePhone, toAsciiDigits, waIdToE164 } from './phone'
import { createCase, transitionCase, updateCaseFields, type Actor, type ConsultationStatus } from './transitions'
import { enqueueOutboundJob, type EnqueuedJob } from './outbound'

export interface InboundMessage {
  wamid: string
  from: string // E.164
  type: string
  text: string | null
}

// Minimal, permissive shape of a forwarded Meta Cloud API webhook
const metaMessageSchema = z
  .object({
    id: z.string().min(1).max(256),
    from: z.string().min(5).max(32),
    type: z.string().min(1).max(32),
    text: z.object({ body: z.string() }).partial().optional(),
    button: z.object({ text: z.string() }).partial().optional(),
    interactive: z
      .object({
        button_reply: z.object({ title: z.string() }).partial().optional(),
        list_reply: z.object({ title: z.string() }).partial().optional(),
      })
      .partial()
      .optional(),
  })
  .passthrough()

const metaValueSchema = z.object({ messages: z.array(z.unknown()).optional() }).passthrough()
const metaBodySchema = z
  .object({
    entry: z.array(
      z
        .object({ changes: z.array(z.object({ value: metaValueSchema }).passthrough()).optional() })
        .passthrough(),
    ),
  })
  .passthrough()

function messageText(m: z.infer<typeof metaMessageSchema>): string | null {
  const raw =
    m.text?.body ?? m.button?.text ?? m.interactive?.button_reply?.title ?? m.interactive?.list_reply?.title
  return typeof raw === 'string' ? raw : null
}

/**
 * Extract inbound messages from the forwarded payload. Accepts the full Meta
 * webhook body, a single `value` object, or n8n's `{ body: … }` wrapper.
 * Status-only webhooks yield an empty list.
 */
export function extractInboundMessages(payload: unknown): InboundMessage[] {
  let root: unknown = payload
  if (root && typeof root === 'object' && 'body' in root && !('entry' in root) && !('messages' in root)) {
    root = (root as { body: unknown }).body
  }

  const rawMessages: unknown[] = []
  const full = metaBodySchema.safeParse(root)
  if (full.success) {
    for (const entry of full.data.entry) {
      for (const change of entry.changes ?? []) rawMessages.push(...(change.value.messages ?? []))
    }
  } else {
    const value = metaValueSchema.safeParse(root)
    if (value.success) rawMessages.push(...(value.data.messages ?? []))
  }

  const out: InboundMessage[] = []
  for (const raw of rawMessages) {
    const parsed = metaMessageSchema.safeParse(raw)
    if (!parsed.success) continue
    const from = waIdToE164(parsed.data.from)
    if (!from) continue
    out.push({ wamid: parsed.data.id, from, type: parsed.data.type, text: messageText(parsed.data) })
  }
  return out
}

/** Reasonable patient name: letters required, no digits/URLs, 2–80 chars. */
export function sanitizePatientName(text: string | null): string | null {
  if (!text) return null
  // eslint-disable-next-line no-control-regex
  const cleaned = text.replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim()
  if (cleaned.length < 2 || cleaned.length > 80) return null
  if (/\d/.test(toAsciiDigits(cleaned))) return null
  if (/https?:|www\./i.test(cleaned)) return null
  if (!/\p{L}/u.test(cleaned)) return null
  return cleaned
}

export type IntakeOutcome =
  | 'duplicate'
  | 'asked_name'
  | 'asked_name_again'
  | 'name_saved_asked_phone'
  | 'asked_phone_again'
  | 'phone_saved_admin_intake'
  | 'case_in_progress'

export interface InboundResult {
  wamid: string
  duplicate: boolean
  outcome: IntakeOutcome
  consultationId: string | null
  status: ConsultationStatus | null
  jobs: EnqueuedJob[]
}

const PATIENT: Actor = { type: 'PATIENT', id: null }
const SYSTEM: Actor = { type: 'SYSTEM', id: null }

/**
 * Process one inbound message atomically. The wamid ledger row is inserted in
 * the same transaction, so a duplicate delivery (even concurrent) is a no-op
 * and a failed processing attempt can be retried by Meta/n8n.
 */
export async function processInboundMessage(msg: InboundMessage): Promise<InboundResult> {
  return db.transaction(async (tx) => {
    const ledger = await tx
      .insert(whatsappEvents)
      .values({ wamid: msg.wamid, senderPhone: msg.from, eventType: msg.type })
      .onConflictDoNothing({ target: whatsappEvents.wamid })
      .returning({ id: whatsappEvents.id })
    const ledgerId = ledger[0]?.id
    if (!ledgerId) {
      return { wamid: msg.wamid, duplicate: true, outcome: 'duplicate', consultationId: null, status: null, jobs: [] }
    }

    // Serialise processing per sender (ordering of name → phone, and a single
    // open case per sender). Backed by the partial unique index on whatsapp_phone.
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${'etabib:wa:' + msg.from}))`)

    const jobs: EnqueuedJob[] = []
    const meta = { wamid: msg.wamid }
    let outcome: IntakeOutcome

    const existing = await tx
      .select()
      .from(consultationCases)
      .where(and(eq(consultationCases.whatsappPhone, msg.from), ne(consultationCases.status, 'COMPLETED')))
      .limit(1)
      .for('update')
    let current: ConsultationCase | undefined = existing[0]

    if (!current) {
      current = await createCase(tx, { whatsappPhone: msg.from }, PATIENT, { ...meta, source: 'whatsapp' })
      jobs.push(
        await enqueueOutboundJob(tx, {
          type: 'ASK_PATIENT_NAME',
          consultationId: current.id,
          dedupeKey: msg.wamid,
          recipientPhone: msg.from,
        }),
      )
      outcome = 'asked_name'
    } else if (current.status !== 'NEW') {
      // ADMIN_INTAKE or beyond: never restart onboarding, never ask clinical
      // questions. Acknowledge at most once per stage.
      jobs.push(
        await enqueueOutboundJob(tx, {
          type: 'PATIENT_CASE_IN_PROGRESS',
          consultationId: current.id,
          dedupeKey: `${current.id}:${current.status}`,
          recipientPhone: msg.from,
        }),
      )
      outcome = 'case_in_progress'
    } else if (!current.patientName) {
      const name = sanitizePatientName(msg.text)
      if (name) {
        current = await updateCaseFields(tx, {
          caseId: current.id,
          patch: { patientName: name },
          eventType: 'PATIENT_NAME_RECEIVED',
          actor: PATIENT,
          metadata: meta,
        })
        jobs.push(
          await enqueueOutboundJob(tx, {
            type: 'ASK_PATIENT_PHONE',
            consultationId: current.id,
            dedupeKey: msg.wamid,
            recipientPhone: msg.from,
          }),
        )
        outcome = 'name_saved_asked_phone'
      } else {
        jobs.push(
          await enqueueOutboundJob(tx, {
            type: 'ASK_PATIENT_NAME',
            consultationId: current.id,
            dedupeKey: msg.wamid,
            recipientPhone: msg.from,
            messageKey: 'invalid',
          }),
        )
        outcome = 'asked_name_again'
      }
    } else {
      const phone = current.patientPhone ?? (msg.text ? normalizePhone(msg.text) : null)
      if (phone) {
        if (!current.patientPhone) {
          current = await updateCaseFields(tx, {
            caseId: current.id,
            patch: { patientPhone: phone },
            eventType: 'PATIENT_PHONE_RECEIVED',
            actor: PATIENT,
            metadata: meta,
          })
        }
        current = await transitionCase(tx, {
          caseId: current.id,
          to: 'ADMIN_INTAKE',
          expectedFrom: 'NEW',
          actor: SYSTEM,
          metadata: meta,
        })
        jobs.push(
          await enqueueOutboundJob(tx, { type: 'ADMIN_NEW_CASE', consultationId: current.id, dedupeKey: current.id }),
        )
        jobs.push(
          await enqueueOutboundJob(tx, {
            type: 'PATIENT_ACKNOWLEDGED',
            consultationId: current.id,
            dedupeKey: current.id,
            recipientPhone: msg.from,
          }),
        )
        outcome = 'phone_saved_admin_intake'
      } else {
        jobs.push(
          await enqueueOutboundJob(tx, {
            type: 'ASK_PATIENT_PHONE',
            consultationId: current.id,
            dedupeKey: msg.wamid,
            recipientPhone: msg.from,
            messageKey: 'invalid',
          }),
        )
        outcome = 'asked_phone_again'
      }
    }

    await tx
      .update(whatsappEvents)
      .set({ consultationId: current.id, processedAt: new Date() })
      .where(eq(whatsappEvents.id, ledgerId))

    return {
      wamid: msg.wamid,
      duplicate: false,
      outcome,
      consultationId: current.id,
      status: current.status,
      jobs,
    }
  })
}
