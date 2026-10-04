/**
 * eTabib V1 — WhatsApp delivery receipts (Meta webhook `statuses[]`), Phase 6.6.
 *
 * A Meta message id (wamid) proves only that Meta ACCEPTED a message. The real
 * outcome arrives later as status events: sent → delivered → read, or failed.
 * They are correlated to the outbox job by provider_message_id and never create
 * cases. Statuses only move forward; a `failed` receipt after acceptance marks
 * the job failed (non-delivery), except once it was already delivered/read.
 */
import { z } from 'zod'
import { db } from '@etabeeb/db'
import { consultationCases, notificationOutbox } from '@etabeeb/db/schema'
import { eq } from 'drizzle-orm'
import { parseJobRefs } from './outbound'
import { recordCaseEvent } from './transitions'
import { sanitizeErrorText } from './sanitize'

export interface DeliveryStatus {
  wamid: string
  status: 'sent' | 'delivered' | 'read' | 'failed'
  at: Date
  error: string | null
}

const statusSchema = z
  .object({
    id: z.string().min(1).max(256),
    status: z.enum(['sent', 'delivered', 'read', 'failed']),
    timestamp: z.string().regex(/^\d{1,12}$/).optional(),
    errors: z
      .array(z.object({ code: z.union([z.number(), z.string()]).optional(), title: z.string().optional() }).passthrough())
      .optional(),
  })
  .passthrough()

/** Extract status events from a forwarded Meta webhook (full body, value, or n8n wrapper). */
export function extractDeliveryStatuses(payload: unknown): DeliveryStatus[] {
  let root: unknown = payload
  if (root && typeof root === 'object' && 'body' in root && !('entry' in root)) root = (root as { body: unknown }).body
  const raw: unknown[] = []
  const entries = (root as { entry?: Array<{ changes?: Array<{ value?: { statuses?: unknown[] } }> }> })?.entry
  if (Array.isArray(entries)) {
    for (const e of entries) for (const ch of e.changes ?? []) raw.push(...(ch.value?.statuses ?? []))
  } else if (Array.isArray((root as { statuses?: unknown[] })?.statuses)) {
    raw.push(...(root as { statuses: unknown[] }).statuses)
  }
  const out: DeliveryStatus[] = []
  for (const r of raw) {
    const p = statusSchema.safeParse(r)
    if (!p.success) continue
    const e = p.data.errors?.[0]
    out.push({
      wamid: p.data.id,
      status: p.data.status,
      at: p.data.timestamp ? new Date(Number(p.data.timestamp) * 1000) : new Date(),
      error: e ? sanitizeErrorText([e.code, e.title].filter((v) => v !== undefined).join(': '), 200) : null,
    })
  }
  return out
}

const RANK: Record<string, number> = { pending: 0, processing: 0, failed: 0, sent: 1, delivered: 2, read: 3 }

export interface DeliveryUpdate {
  wamid: string
  matched: boolean
  changed: boolean
  jobStatus?: string
}

export async function applyDeliveryStatus(s: DeliveryStatus): Promise<DeliveryUpdate> {
  return db.transaction(async (tx) => {
    const [job] = await tx.select().from(notificationOutbox).where(eq(notificationOutbox.providerMessageId, s.wamid)).limit(1).for('update')
    if (!job || !job.idempotencyKey.startsWith('etabib:')) return { wamid: s.wamid, matched: false, changed: false }
    const now = new Date()
    const current = RANK[job.status] ?? 0

    if (s.status === 'failed') {
      if (job.status === 'failed' || current >= 2) return { wamid: s.wamid, matched: true, changed: false, jobStatus: job.status }
      await tx
        .update(notificationOutbox)
        .set({ status: 'failed', failedAt: s.at, statusUpdatedAt: now, lastError: s.error ?? 'delivery_failed' })
        .where(eq(notificationOutbox.id, job.id))
      const refs = parseJobRefs(job.templateVariables)
      if (refs && job.templateKey === 'PRESCRIPTION_READY') {
        const [c] = await tx.select().from(consultationCases).where(eq(consultationCases.id, refs.consultationId)).limit(1)
        if (c) {
          await recordCaseEvent(tx, {
            caseId: c.id,
            eventType: 'PRESCRIPTION_DELIVERY_FAILED',
            oldStatus: c.status,
            newStatus: c.status,
            actor: { type: 'SYSTEM', id: null },
            metadata: { outboundJobId: job.id, source: 'meta_status' },
          })
        }
      }
      return { wamid: s.wamid, matched: true, changed: true, jobStatus: 'failed' }
    }

    if (RANK[s.status]! <= current) return { wamid: s.wamid, matched: true, changed: false, jobStatus: job.status }
    await tx
      .update(notificationOutbox)
      .set({
        status: s.status,
        statusUpdatedAt: now,
        processedAt: job.processedAt ?? s.at,
        ...(s.status === 'delivered' || s.status === 'read' ? { deliveredAt: job.deliveredAt ?? s.at } : {}),
        ...(s.status === 'read' ? { readAt: s.at } : {}),
      })
      .where(eq(notificationOutbox.id, job.id))
    return { wamid: s.wamid, matched: true, changed: true, jobStatus: s.status }
  })
}
