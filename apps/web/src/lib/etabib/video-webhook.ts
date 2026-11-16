/**
 * eTabib V1 — LiveKit webhooks (signed with the API key/secret, verified by
 * WebhookReceiver): participant joined/left audit events and room-join notices.
 *
 * Room-join notices (doctor joined → patient; patient joined → doctor):
 *  - only on a verified `participant_joined` for a live case (CONFIRMED /
 *    IN_CONSULTATION) whose participant the server issued for THIS room
 *    (video-join.ts); never on room creation, page opens or failed connections
 *  - one decision per role per consultation (VIDEO_JOIN_NOTICE_QUEUED/SKIPPED):
 *    reconnects, page refreshes and webhook retries never send again
 *  - no notice when the recipient is already in the room
 *  - LiveKit retries are de-duplicated by webhook event id; all of this runs in
 *    one transaction under the session row lock, so near-simultaneous joins are
 *    decided one after the other
 *  - the job goes through the transactional outbox (idempotency key per case and
 *    role) and is dispatched after commit without delaying the webhook answer
 */
import { WebhookReceiver } from 'livekit-server-sdk'
import { db } from '@etabeeb/db'
import { caseEvents, consultationCases, consultationVideoSessions, notificationOutbox } from '@etabeeb/db/schema'
import { and, eq, inArray, sql } from 'drizzle-orm'
import { getDoctorWhatsapp, getLiveKitConfig } from './config'
import { EtabibError } from './errors'
import { dispatchOutboundJobs, enqueueOutboundJob } from './outbound'
import { recordCaseEvent, type Tx } from './transitions'
import type { VideoSession } from './video'
import { JOIN_NOTICE_JOB, LIVE_CASE_STATUSES, otherRole, roleConnected, verifiedParticipantRole, type JoinRole } from './video-join'

/** A join reported this late (LiveKit retry backlog) is still audited but never notifies. */
const JOIN_NOTICE_MAX_EVENT_AGE_MS = 5 * 60_000
/** Upper bound on notices per role per consultation (re-armed only after an unsent, withdrawn one). */
const JOIN_NOTICE_MAX_REARMS = 5

export interface LiveKitWebhookResult {
  handled: boolean
  duplicate?: boolean
  /** Outbox jobs queued by this event (dispatched after commit). */
  noticeJobIds?: string[]
}

export async function handleLiveKitWebhook(rawBody: string, authHeader: string | null): Promise<LiveKitWebhookResult> {
  const cfg = getLiveKitConfig()
  if (!cfg) throw new EtabibError('video_not_configured', 'Video is not configured', 503)
  let event
  try {
    event = await new WebhookReceiver(cfg.apiKey, cfg.apiSecret).receive(rawBody, authHeader ?? undefined)
  } catch (error) {
    // Reason only (no header, token or body) so a misconfigured LiveKit webhook is diagnosable.
    const e = error as { code?: unknown; claim?: unknown; message?: unknown }
    const reason = !authHeader ? 'missing_authorization' : [e.code, e.claim, e.message].filter((v) => typeof v === 'string').join(' ').slice(0, 160)
    console.warn(`[etabib:video/livekit-webhook] rejected: ${reason || 'unknown'}`)
    throw new EtabibError('unauthorized', 'Unauthorized', 401)
  }
  const roomName = event.room?.name
  console.info(`[etabib:video/livekit-webhook] event=${event.event} ours=${roomName?.startsWith('etb-') ? 'maybe' : 'no'}`)
  if (!roomName) return { handled: false }
  const result = await db.transaction(async (tx): Promise<LiveKitWebhookResult> => {
    const [ref] = await tx.select({ consultationId: consultationVideoSessions.consultationId }).from(consultationVideoSessions).where(eq(consultationVideoSessions.roomName, roomName)).limit(1)
    if (!ref) return { handled: false } // not one of ours
    // Lock order case → session, as everywhere else (transitions, link minting): webhooks
    // of one room run one after the other and never deadlock with a concurrent dispatch
    const [c] = await tx.select().from(consultationCases).where(eq(consultationCases.id, ref.consultationId)).limit(1).for('update')
    if (!c) return { handled: false }
    const [session] = await tx.select().from(consultationVideoSessions).where(eq(consultationVideoSessions.roomName, roomName)).limit(1).for('update')
    if (!session) return { handled: false }
    const now = new Date()
    const identity = event.participant?.identity ?? ''
    const role = identity.startsWith('patient-') ? 'PATIENT' : identity.startsWith('doctor-') ? 'DOCTOR' : null
    const base = { caseId: c.id, oldStatus: c.status, newStatus: c.status }

    if ((event.event === 'participant_joined' || event.event === 'participant_left') && role) {
      const eventId = event.id || null
      if (eventId) {
        // LiveKit retries a webhook it considers undelivered: same event id → already handled
        const [seen] = await tx
          .select({ id: caseEvents.id })
          .from(caseEvents)
          .where(and(eq(caseEvents.consultationId, c.id), sql`${caseEvents.metadata} ->> 'livekitEventId' = ${eventId}`))
          .limit(1)
        if (seen) return { handled: true, duplicate: true }
      }
      const joined = event.event === 'participant_joined'
      await recordCaseEvent(tx, {
        ...base,
        eventType: `${role}_VIDEO_${joined ? 'JOINED' : 'LEFT'}` as 'PATIENT_VIDEO_JOINED',
        actor: { type: role, id: null },
        metadata: {
          videoSessionId: session.id,
          ...(eventId ? { livekitEventId: eventId } : {}),
          ...(event.participant?.sid ? { participantSid: event.participant.sid } : {}),
        },
      })
      const patch: Partial<VideoSession> = { lastActivityAt: now, updatedAt: now }
      if (joined && role === 'PATIENT' && !session.patientJoinedAt) patch.patientJoinedAt = now
      if (joined && role === 'DOCTOR' && !session.doctorJoinedAt) patch.doctorJoinedAt = now
      if (joined && session.status !== 'ENDED') {
        patch.status = 'IN_PROGRESS'
        if (!session.startedAt) patch.startedAt = now
      }
      await tx.update(consultationVideoSessions).set(patch).where(eq(consultationVideoSessions.id, session.id))
      if (!joined) return { handled: true }
      const verified = verifiedParticipantRole(session, event.participant)
      if (!verified) return { handled: true }
      const createdAtMs = Number(event.createdAt ?? 0) * 1000
      if (createdAtMs > 0 && now.getTime() - createdAtMs > JOIN_NOTICE_MAX_EVENT_AGE_MS) {
        console.info(`[etabib:video/join-notice] stale ${verified.toLowerCase()} join ignored`)
        return { handled: true }
      }
      const jobId = await decideJoinNotice(tx, c, session, verified)
      return { handled: true, ...(jobId ? { noticeJobIds: [jobId] } : {}) }
    }
    if (event.event === 'room_finished') {
      await tx.update(consultationVideoSessions).set({ lastActivityAt: now, updatedAt: now }).where(eq(consultationVideoSessions.id, session.id))
      return { handled: true }
    }
    return { handled: false }
  })
  if (result.noticeJobIds?.length) {
    // After commit, without holding up LiveKit's webhook (the outbox scheduler retries anything left pending)
    const run = dispatchOutboundJobs(result.noticeJobIds)
      .then(() => undefined)
      .catch((error) => {
        console.warn(`[etabib:video/join-notice] dispatch failed: ${error instanceof Error ? error.name : 'error'}`)
      })
      .finally(() => inFlight.delete(run))
    inFlight.add(run)
  }
  return result
}

const inFlight = new Set<Promise<void>>()
/** Resolves once every join-notice dispatch started so far has finished (tests, graceful shutdown). */
export async function joinNoticeDispatchesSettled(): Promise<void> {
  while (inFlight.size > 0) await Promise.all([...inFlight])
}

/**
 * First verified join of `role` in this consultation: queue the notice for the
 * other side, or record why not. Later joins of the same role do nothing.
 */
async function decideJoinNotice(
  tx: Tx,
  c: typeof consultationCases.$inferSelect,
  session: VideoSession,
  role: JoinRole,
): Promise<string | null> {
  const decisions = await tx
    .select({ type: caseEvents.eventType, jobId: sql<string | null>`${caseEvents.metadata} ->> 'outboxJobId'` })
    .from(caseEvents)
    .where(
      and(
        eq(caseEvents.consultationId, c.id),
        inArray(caseEvents.eventType, ['VIDEO_JOIN_NOTICE_QUEUED', 'VIDEO_JOIN_NOTICE_SKIPPED']),
        sql`${caseEvents.metadata} ->> 'joinedRole' = ${role}`,
      ),
    )
  if (decisions.some((d) => d.type === 'VIDEO_JOIN_NOTICE_SKIPPED')) return null
  if (decisions.length > 0) {
    // Re-arm only when every earlier notice was withdrawn because the joiner left before it
    // could go out (e.g. the doctor peeked in early): the recipient was never told, so this
    // real join must notify. A sent, pending or otherwise failed notice keeps it at one.
    if (decisions.length >= JOIN_NOTICE_MAX_REARMS) return null
    const jobIds = decisions.map((d) => d.jobId).filter((id): id is string => Boolean(id))
    if (jobIds.length !== decisions.length) return null
    const jobs = await tx.select({ status: notificationOutbox.status, lastError: notificationOutbox.lastError }).from(notificationOutbox).where(inArray(notificationOutbox.id, jobIds))
    const withdrawn = (j: (typeof jobs)[number]) => j.status === 'cancelled' && (j.lastError ?? '').startsWith('joined_party_left')
    if (jobs.length !== jobIds.length || !jobs.every(withdrawn)) return null
  }

  const skip = async (reason: string) => {
    await recordCaseEvent(tx, {
      caseId: c.id,
      eventType: 'VIDEO_JOIN_NOTICE_SKIPPED',
      oldStatus: c.status,
      newStatus: c.status,
      actor: { type: 'SYSTEM', id: null },
      metadata: { videoSessionId: session.id, joinedRole: role, reason },
    })
    return null
  }
  if (!LIVE_CASE_STATUSES.has(c.status) || session.status === 'ENDED' || session.status === 'EXPIRED') return skip('case_not_active')
  if (await roleConnected(tx, c.id, otherRole(role))) return skip('recipient_already_connected')
  if (role === 'PATIENT' && !getDoctorWhatsapp()) return skip('doctor_whatsapp_not_configured')
  const patientPhone = c.whatsappPhone ?? c.patientPhone
  if (role === 'DOCTOR' && !patientPhone) return skip('no_patient_whatsapp')

  const type = JOIN_NOTICE_JOB[role]
  // first notice keeps the plain per-case key; a re-armed one gets its own
  const dedupeKey = decisions.length === 0 ? c.id : `${c.id}:${decisions.length}`
  const job = await enqueueOutboundJob(tx, { type, consultationId: c.id, dedupeKey, recipientPhone: role === 'DOCTOR' ? patientPhone : null })
  await recordCaseEvent(tx, {
    caseId: c.id,
    eventType: 'VIDEO_JOIN_NOTICE_QUEUED',
    oldStatus: c.status,
    newStatus: c.status,
    actor: { type: 'SYSTEM', id: null },
    metadata: { videoSessionId: session.id, joinedRole: role, outboxJobId: job.id },
  })
  return job.created ? job.id : null
}
