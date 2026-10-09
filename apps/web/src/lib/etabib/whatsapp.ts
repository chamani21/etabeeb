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
import { consultationCases, notificationOutbox, whatsappEvents } from '@etabeeb/db/schema'
import type { ConsultationCase } from '@etabeeb/db'
import { and, eq, inArray, notInArray, sql } from 'drizzle-orm'
import { toAsciiDigits, waIdToE164 } from './phone'
import { CLOSED_STATUSES, createCase, transitionCase, updateCaseFields, type Actor, type ConsultationStatus } from './transitions'
import { enqueueOutboundJob, type EnqueuedJob } from './outbound'
import { evaluateInboundSender, type InboundDisposition } from './inbound-policy'
import { ensureConversation, isInboxEnabled } from './inbox/core'
import { recordInboundMessage } from './inbox/inbound'

export interface InboundMedia {
  /** Meta media id (the download URL is resolved later, never stored) */
  id: string
  mimeType: string | null
  filename: string | null
  caption: string | null
}

export interface InboundMessage {
  wamid: string
  from: string // E.164
  type: string
  text: string | null
  // Inbox fields (optional; absent in legacy callers/tests)
  providerTimestamp?: Date | null
  media?: InboundMedia | null
  replyTo?: string | null
  profileName?: string | null
  businessPhoneNumberId?: string | null
}

const mediaSchema = z
  .object({ id: z.string().min(1).max(128), mime_type: z.string().max(128).optional(), filename: z.string().max(512).optional(), caption: z.string().max(4096).optional() })
  .passthrough()

// Minimal, permissive shape of a forwarded Meta Cloud API webhook
const metaMessageSchema = z
  .object({
    id: z.string().min(1).max(256),
    from: z.string().min(5).max(32),
    type: z.string().min(1).max(32),
    timestamp: z.string().regex(/^\d{1,12}$/).optional(),
    text: z.object({ body: z.string() }).partial().optional(),
    button: z.object({ text: z.string() }).partial().optional(),
    interactive: z
      .object({
        button_reply: z.object({ title: z.string() }).partial().optional(),
        list_reply: z.object({ title: z.string() }).partial().optional(),
      })
      .partial()
      .optional(),
    image: mediaSchema.optional(),
    document: mediaSchema.optional(),
    audio: mediaSchema.optional(),
    video: mediaSchema.optional(),
    sticker: mediaSchema.optional(),
    reaction: z.object({ message_id: z.string().max(256).optional(), emoji: z.string().max(32).optional() }).passthrough().optional(),
    context: z.object({ id: z.string().max(256).optional() }).passthrough().optional(),
  })
  .passthrough()

const metaValueSchema = z
  .object({
    messages: z.array(z.unknown()).optional(),
    metadata: z.object({ phone_number_id: z.string().max(64).optional() }).passthrough().optional(),
    contacts: z.array(z.object({ wa_id: z.string().max(32).optional(), profile: z.object({ name: z.string().max(256).optional() }).passthrough().optional() }).passthrough()).optional(),
  })
  .passthrough()
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

function messageMedia(m: z.infer<typeof metaMessageSchema>): InboundMedia | null {
  const media = m.image ?? m.document ?? m.audio ?? m.video ?? m.sticker
  if (!media) return null
  return { id: media.id, mimeType: media.mime_type ?? null, filename: media.filename ?? null, caption: media.caption ?? null }
}

type MetaValue = z.infer<typeof metaValueSchema>
interface RawWithContext {
  raw: unknown
  value: MetaValue | null
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

  const rawMessages: RawWithContext[] = []
  const full = metaBodySchema.safeParse(root)
  if (full.success) {
    for (const entry of full.data.entry) {
      for (const change of entry.changes ?? []) for (const raw of change.value.messages ?? []) rawMessages.push({ raw, value: change.value })
    }
  } else {
    const value = metaValueSchema.safeParse(root)
    if (value.success) for (const raw of value.data.messages ?? []) rawMessages.push({ raw, value: value.data })
  }

  const out: InboundMessage[] = []
  for (const { raw, value } of rawMessages) {
    const parsed = metaMessageSchema.safeParse(raw)
    if (!parsed.success) continue
    const from = waIdToE164(parsed.data.from)
    if (!from) continue
    const m = parsed.data
    const profile = value?.contacts?.find((c) => c.wa_id === m.from)?.profile?.name ?? null
    const media = messageMedia(m)
    out.push({
      wamid: m.id,
      from,
      type: m.type,
      text: messageText(m) ?? (m.type === 'reaction' ? (m.reaction?.emoji ?? null) : null),
      providerTimestamp: m.timestamp ? new Date(Number(m.timestamp) * 1000) : null,
      media,
      replyTo: m.context?.id ?? (m.type === 'reaction' ? (m.reaction?.message_id ?? null) : null),
      profileName: profile,
      businessPhoneNumberId: value?.metadata?.phone_number_id ?? null,
    })
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
  | 'ignored'
  | 'asked_name'
  | 'asked_name_again'
  | 'name_saved_admin_intake'
  | 'phone_saved_admin_intake'
  | 'case_in_progress'
  | 'already_acknowledged'
  | 'released_held_media'
  /** Inbox: a human owns the conversation — stored, no bot reply */
  | 'staff_owned'
  /** Inbox: sent before staff returned the chat to the bot — stored, never drives the new intake */
  | 'before_reset'

export interface InboundResult {
  wamid: string
  duplicate: boolean
  outcome: IntakeOutcome
  consultationId: string | null
  status: ConsultationStatus | null
  jobs: EnqueuedJob[]
  /** Inbound gate result; absent for duplicates (decided on first delivery). */
  disposition?: InboundDisposition
  /** Inbox: attachments to download after commit */
  mediaFetchIds?: string[]
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

    // P1 gate: kill switch, inbound mode, staff exclusion, allow/block list.
    // An ignored message keeps its ledger row (so redeliveries stay duplicates)
    // but creates no case, advances no state and enqueues no message.
    const disposition = await evaluateInboundSender(tx, msg.from)
    if (disposition !== 'processed') {
      await tx
        .update(whatsappEvents)
        .set({ disposition, processedAt: new Date() })
        .where(eq(whatsappEvents.id, ledgerId))
      return { wamid: msg.wamid, duplicate: false, outcome: 'ignored', consultationId: null, status: null, jobs: [], disposition }
    }

    // Serialise processing per sender (ordering of name → phone, and a single
    // open case per sender). Backed by the partial unique index on whatsapp_phone.
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${'etabib:wa:' + msg.from}))`)

    const jobs: EnqueuedJob[] = []
    const meta = { wamid: msg.wamid }
    let outcome: IntakeOutcome

    // Shared inbox (feature flag): every processed message is stored durably in
    // the contact's conversation; a human owner suppresses the bot's replies.
    const conv = isInboxEnabled() ? await ensureConversation(tx, msg.from, msg.profileName) : null
    const mediaFetchIds: string[] = []
    const recordForInbox = async (caseId: string | null) => {
      if (!conv) return
      const r = await recordInboundMessage(tx, conv, msg, caseId)
      mediaFetchIds.push(...r.fetchIds)
    }

    // Name collected → admin intake: notify the admin and acknowledge the patient (once per case)
    const toAdminIntake = async (c: ConsultationCase): Promise<ConsultationCase> => {
      const moved = await transitionCase(tx, { caseId: c.id, to: 'ADMIN_INTAKE', expectedFrom: 'NEW', actor: SYSTEM, metadata: meta })
      jobs.push(await enqueueOutboundJob(tx, { type: 'ADMIN_NEW_CASE', consultationId: moved.id, dedupeKey: moved.id }))
      jobs.push(await enqueueOutboundJob(tx, { type: 'PATIENT_ACKNOWLEDGED', consultationId: moved.id, dedupeKey: moved.id, recipientPhone: msg.from }))
      return moved
    }

    const existing = await tx
      .select()
      .from(consultationCases)
      .where(and(eq(consultationCases.whatsappPhone, msg.from), notInArray(consultationCases.status, [...CLOSED_STATUSES])))
      .limit(1)
      .for('update')
    let current: ConsultationCase | undefined = existing[0]

    // A reply to a prescription sent outside the 24-hour window (e.g. "send me the
    // voice advice") must not restart onboarding: it only releases the held media.
    const held = current
      ? undefined
      : (
          await tx
            .select({ caseId: consultationCases.id, status: consultationCases.status })
            .from(consultationCases)
            .innerJoin(notificationOutbox, sql`(${notificationOutbox.templateVariables}::jsonb ->> 'consultationId') = ${consultationCases.id}::text`)
            .where(
              and(
                eq(consultationCases.whatsappPhone, msg.from),
                eq(notificationOutbox.status, 'pending'),
                inArray(notificationOutbox.templateKey, ['PRESCRIPTION_IMAGE', 'PRESCRIPTION_VOICE']),
                sql`${notificationOutbox.createdAt} > now() - interval '7 days'`,
              ),
            )
            .limit(1)
        )[0]

    if (conv && conv.owner !== 'BOT') {
      // Staff own this conversation: store only. No case is created, no intake
      // step advances, no conversational reply is queued. Held prescription media
      // is still released by the caller (transactional delivery, not a bot reply).
      const caseId = current?.id ?? held?.caseId ?? null
      await recordForInbox(current?.id ?? null)
      await tx.update(whatsappEvents).set({ consultationId: caseId, processedAt: new Date(), disposition }).where(eq(whatsappEvents.id, ledgerId))
      return { wamid: msg.wamid, duplicate: false, outcome: 'staff_owned', consultationId: caseId, status: current?.status ?? held?.status ?? null, jobs: [], disposition, mediaFetchIds }
    }

    // "Return to bot" boundary: only messages SENT after it start/continue the new intake
    const resetAt = conv?.botResetAt ?? null
    if (resetAt) {
      const sentAt = msg.providerTimestamp ?? new Date()
      if (Math.floor(sentAt.getTime() / 1000) < Math.floor(resetAt.getTime() / 1000)) {
        await recordForInbox(current?.id ?? null)
        await tx.update(whatsappEvents).set({ consultationId: current?.id ?? null, processedAt: new Date(), disposition }).where(eq(whatsappEvents.id, ledgerId))
        return { wamid: msg.wamid, duplicate: false, outcome: 'before_reset', consultationId: current?.id ?? null, status: current?.status ?? null, jobs: [], disposition, mediaFetchIds }
      }
    }
    // A reset is waiting for its first message (no case created since): start the intake, not a held-media release
    const restartPending = Boolean(resetAt) && (!current || current.createdAt.getTime() < resetAt!.getTime())

    if (!current && held && !restartPending) {
      await recordForInbox(null)
      await tx.update(whatsappEvents).set({ consultationId: held.caseId, processedAt: new Date(), disposition }).where(eq(whatsappEvents.id, ledgerId))
      return { wamid: msg.wamid, duplicate: false, outcome: 'released_held_media', consultationId: held.caseId, status: held.status, jobs: [], disposition, mediaFetchIds }
    }

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
    } else if (current.status === 'ADMIN_INTAKE') {
      // The registration acknowledgement was just sent and the admin takes over:
      // no second "waiting" message (one acknowledgement after the phone number).
      outcome = 'already_acknowledged'
    } else if (current.status !== 'NEW') {
      // Later stages: never restart onboarding, never ask clinical
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
    } else if (
      restartPending &&
      !current.patientName &&
      !(
        await tx
          .select({ id: notificationOutbox.id })
          .from(notificationOutbox)
          .where(
            and(
              eq(notificationOutbox.templateKey, 'ASK_PATIENT_NAME'),
              sql`(${notificationOutbox.templateVariables}::jsonb ->> 'consultationId') = ${current.id}`,
              sql`${notificationOutbox.createdAt} >= ${resetAt!.toISOString()}::timestamptz`,
            ),
          )
          .limit(1)
      )[0]
    ) {
      // Restarted intake reusing an empty NEW case: this first message is a greeting, not the name
      jobs.push(await enqueueOutboundJob(tx, { type: 'ASK_PATIENT_NAME', consultationId: current.id, dedupeKey: msg.wamid, recipientPhone: msg.from }))
      outcome = 'asked_name'
    } else if (!current.patientName) {
      const name = sanitizePatientName(msg.text)
      if (name) {
        // The patient's WhatsApp number is their contact phone (not asked; the admin can correct it in intake)
        current = await updateCaseFields(tx, {
          caseId: current.id,
          patch: { patientName: name, ...(current.patientPhone ? {} : { patientPhone: msg.from }) },
          eventType: 'PATIENT_NAME_RECEIVED',
          actor: PATIENT,
          metadata: { ...meta, phoneFromWhatsapp: !current.patientPhone },
        })
        current = await toAdminIntake(current)
        outcome = 'name_saved_admin_intake'
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
      // Older intakes that already have the name but no phone: use the WhatsApp number
      if (!current.patientPhone) {
        current = await updateCaseFields(tx, {
          caseId: current.id,
          patch: { patientPhone: msg.from },
          eventType: 'PATIENT_PHONE_RECEIVED',
          actor: PATIENT,
          metadata: { ...meta, phoneFromWhatsapp: true },
        })
      }
      current = await toAdminIntake(current)
      outcome = 'phone_saved_admin_intake'
    }

    await tx
      .update(whatsappEvents)
      .set({ consultationId: current.id, processedAt: new Date(), disposition })
      .where(eq(whatsappEvents.id, ledgerId))
    await recordForInbox(current.id)

    return {
      wamid: msg.wamid,
      duplicate: false,
      outcome,
      consultationId: current.id,
      status: current.status,
      jobs,
      disposition,
      ...(conv ? { mediaFetchIds } : {}),
    }
  })
}
