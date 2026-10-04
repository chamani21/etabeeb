/**
 * eTabib V1 — video consultation (Phase 6.6). One LiveKit room per case.
 *
 * Access model
 *  - The session (room) is created in the SAME transaction that moves a case to
 *    CONFIRMED, i.e. only after manual payment + explicit doctor approval.
 *  - Patients never get a LiveKit token in WhatsApp. They get an app URL
 *    /consult/<token>; the token is 32 random bytes, only its SHA-256 is stored,
 *    it expires (scheduled time + ETABIB_VIDEO_LINK_TTL_HOURS) and is revocable.
 *    The raw token is minted when the confirmation message is dispatched and
 *    exists only in that message.
 *  - The server exchanges a valid link for a short-lived (15 min) LiveKit JWT
 *    that can join exactly one room. Clients never choose the room.
 *  - The doctor joins from the authenticated dashboard (no public doctor link).
 *  - Join windows: patient from scheduled − EARLY until scheduled + LATE; once
 *    the doctor has started the consultation (IN_CONSULTATION) the patient may
 *    rejoin until the case completes. Doctor: from scheduled − DOCTOR_EARLY
 *    while the case is CONFIRMED or IN_CONSULTATION.
 *  - Joining never changes the clinical state; "Start consultation" stays the
 *    only CONFIRMED → IN_CONSULTATION transition. On COMPLETED the session ends,
 *    links are revoked and no new tokens are issued.
 */
import { createHash, randomBytes } from 'crypto'
import { AccessToken, RoomServiceClient, WebhookReceiver } from 'livekit-server-sdk'
import { db } from '@etabeeb/db'
import { consultationCases, consultationJoinTokens, consultationVideoSessions, practitioners } from '@etabeeb/db/schema'
import type { ConsultationCase } from '@etabeeb/db'
import { and, eq, gt, isNull, sql } from 'drizzle-orm'
import { getAppUrl, getLiveKitConfig, getV1DoctorUserId, getVideoWindows } from './config'
import { EtabibError } from './errors'
import { recordCaseEvent, type Actor, type Tx } from './transitions'

export type VideoSession = typeof consultationVideoSessions.$inferSelect

export const LIVEKIT_TOKEN_TTL_SECONDS = 15 * 60
const MINUTE = 60_000
const SYSTEM: Actor = { type: 'SYSTEM', id: null }

export function hashJoinToken(token: string): string {
  return createHash('sha256').update(token, 'utf8').digest('hex')
}

/** Opaque room name: no case id, patient name or phone. */
export function newRoomName(): string {
  return `etb-${randomBytes(16).toString('hex')}`
}

export function patientJoinUrl(token: string): string {
  return `${getAppUrl() ?? ''}/consult/${token}`
}

// ------------------------------------------------------------------
// Session lifecycle (called inside case transactions)
// ------------------------------------------------------------------

/** Create the case's video session when it becomes CONFIRMED (idempotent). */
export async function createVideoSessionTx(tx: Tx, c: ConsultationCase, actor: Actor): Promise<VideoSession> {
  if (c.status !== 'CONFIRMED' || !c.doctorApprovedTime || !c.paymentReceived || c.doctorDecision !== 'APPROVED') {
    throw new EtabibError('video_not_allowed', 'A video session requires a confirmed, paid and approved case', 409)
  }
  const inserted = await tx
    .insert(consultationVideoSessions)
    .values({ consultationId: c.id, roomName: newRoomName(), scheduledAt: c.doctorApprovedTime, status: 'CREATED' })
    .onConflictDoNothing({ target: consultationVideoSessions.consultationId })
    .returning()
  if (inserted[0]) {
    await recordCaseEvent(tx, {
      caseId: c.id,
      eventType: 'VIDEO_SESSION_CREATED',
      oldStatus: c.status,
      newStatus: c.status,
      actor,
      metadata: { videoSessionId: inserted[0].id },
    })
    return inserted[0]
  }
  const [existing] = await tx.select().from(consultationVideoSessions).where(eq(consultationVideoSessions.consultationId, c.id))
  return existing!
}

async function sessionForCase(tx: Tx, caseId: string): Promise<VideoSession | null> {
  const [s] = await tx.select().from(consultationVideoSessions).where(eq(consultationVideoSessions.consultationId, caseId)).limit(1)
  return s ?? null
}

/** Revoke every still-valid patient link of a session. Returns how many were revoked. */
async function revokeActiveLinks(tx: Tx, session: VideoSession, c: ConsultationCase, actor: Actor, reason: string): Promise<number> {
  const revoked = await tx
    .update(consultationJoinTokens)
    .set({ revokedAt: new Date() })
    .where(and(eq(consultationJoinTokens.sessionId, session.id), isNull(consultationJoinTokens.revokedAt)))
    .returning({ id: consultationJoinTokens.id })
  if (revoked.length > 0) {
    await recordCaseEvent(tx, {
      caseId: c.id,
      eventType: 'VIDEO_LINK_REVOKED',
      oldStatus: c.status,
      newStatus: c.status,
      actor,
      metadata: { videoSessionId: session.id, count: revoked.length, reason },
    })
  }
  return revoked.length
}

/**
 * Mint a fresh patient link (revoking older ones). Used at dispatch time of the
 * patient confirmation message, so only the link actually being sent is valid.
 * Returns null when the case has no (active) video session.
 */
export async function mintPatientJoinLink(caseId: string, actor: Actor = SYSTEM): Promise<{ url: string; expiresAt: Date } | null> {
  return db.transaction(async (tx) => {
    const [c] = await tx.select().from(consultationCases).where(eq(consultationCases.id, caseId)).limit(1).for('update')
    if (!c || (c.status !== 'CONFIRMED' && c.status !== 'IN_CONSULTATION')) return null
    const session = await sessionForCase(tx, caseId)
    if (!session || session.status === 'ENDED' || session.status === 'EXPIRED') return null
    await revokeActiveLinks(tx, session, c, actor, 'superseded')
    const token = randomBytes(32).toString('base64url')
    const expiresAt = new Date(session.scheduledAt.getTime() + getVideoWindows().linkTtlHours * 3600_000)
    const [row] = await tx
      .insert(consultationJoinTokens)
      .values({ sessionId: session.id, role: 'PATIENT', tokenHash: hashJoinToken(token), expiresAt })
      .returning({ id: consultationJoinTokens.id })
    await recordCaseEvent(tx, {
      caseId: c.id,
      eventType: 'VIDEO_LINK_CREATED',
      oldStatus: c.status,
      newStatus: c.status,
      actor,
      metadata: { videoSessionId: session.id, joinTokenId: row!.id, expiresAt: expiresAt.toISOString() },
    })
    return { url: patientJoinUrl(token), expiresAt }
  })
}

/** Admin action: revoke all patient links (the caller enqueues a new message). */
export async function revokePatientLinksTx(tx: Tx, c: ConsultationCase, actor: Actor): Promise<VideoSession> {
  const session = await sessionForCase(tx, c.id)
  if (!session) throw new EtabibError('no_video_session', 'This case has no video session', 409)
  if (session.status === 'ENDED' || session.status === 'EXPIRED') {
    throw new EtabibError('video_session_closed', 'The video session has ended', 409)
  }
  await revokeActiveLinks(tx, session, c, actor, 'admin_rotation')
  return session
}

/** Close the session when the case completes: no further tokens, links revoked. */
export async function endVideoSessionTx(tx: Tx, c: ConsultationCase, actor: Actor): Promise<VideoSession | null> {
  const session = await sessionForCase(tx, c.id)
  if (!session || session.status === 'ENDED') return session
  await revokeActiveLinks(tx, session, c, actor, 'case_completed')
  const [ended] = await tx
    .update(consultationVideoSessions)
    .set({ status: 'ENDED', endedAt: new Date(), updatedAt: new Date() })
    .where(eq(consultationVideoSessions.id, session.id))
    .returning()
  await recordCaseEvent(tx, {
    caseId: c.id,
    eventType: 'VIDEO_SESSION_ENDED',
    oldStatus: c.status,
    newStatus: c.status,
    actor,
    metadata: { videoSessionId: session.id },
  })
  return ended ?? null
}

/** Best effort: disconnect everyone from a closed room (after commit). */
export async function closeLiveKitRoom(roomName: string): Promise<void> {
  const cfg = getLiveKitConfig()
  if (!cfg) return
  try {
    await new RoomServiceClient(cfg.httpUrl, cfg.apiKey, cfg.apiSecret).deleteRoom(roomName)
  } catch (error) {
    // Room may not exist (nobody joined) — not an error worth surfacing
    console.warn(`[etabib:video] closeRoom: ${error instanceof Error ? error.name : 'error'}`)
  }
}

// ------------------------------------------------------------------
// Patient access (public link → short-lived LiveKit token)
// ------------------------------------------------------------------

export type PatientAccessStatus =
  | 'ok'
  | 'invalid'
  | 'revoked'
  | 'expired'
  | 'too_early'
  | 'ended'
  | 'not_configured'

export interface PatientAccess {
  status: PatientAccessStatus
  /** Display info for the Pashto pre-join page (no case id, no clinical data). */
  info?: { doctorName: string; scheduledAt: string; opensAt: string }
}

interface ResolvedLink {
  tokenId: string
  session: VideoSession
  c: ConsultationCase
}

async function resolveLink(rawToken: string): Promise<{ status: PatientAccessStatus; link?: ResolvedLink }> {
  if (!/^[A-Za-z0-9_-]{40,64}$/.test(rawToken)) return { status: 'invalid' }
  const [row] = await db
    .select({ token: consultationJoinTokens, session: consultationVideoSessions, c: consultationCases })
    .from(consultationJoinTokens)
    .innerJoin(consultationVideoSessions, eq(consultationVideoSessions.id, consultationJoinTokens.sessionId))
    .innerJoin(consultationCases, eq(consultationCases.id, consultationVideoSessions.consultationId))
    .where(and(eq(consultationJoinTokens.tokenHash, hashJoinToken(rawToken)), eq(consultationJoinTokens.role, 'PATIENT')))
    .limit(1)
  if (!row) return { status: 'invalid' }
  const link = { tokenId: row.token.id, session: row.session, c: row.c }
  if (row.c.status === 'PRESCRIPTION_SENT' || row.c.status === 'COMPLETED' || row.session.status === 'ENDED') return { status: 'ended', link }
  if (row.token.revokedAt) return { status: 'revoked', link }
  if (row.token.expiresAt.getTime() <= Date.now() || row.session.status === 'EXPIRED') return { status: 'expired', link }
  if (row.c.status !== 'CONFIRMED' && row.c.status !== 'IN_CONSULTATION') return { status: 'invalid' }
  const w = getVideoWindows()
  const scheduled = row.session.scheduledAt.getTime()
  if (Date.now() < scheduled - w.joinEarlyMinutes * MINUTE) return { status: 'too_early', link }
  // Late cut-off applies only while the consultation has not been started
  if (row.c.status === 'CONFIRMED' && Date.now() > scheduled + w.joinLateMinutes * MINUTE) return { status: 'expired', link }
  return { status: 'ok', link }
}

async function doctorDisplayName(): Promise<string> {
  const doctorId = getV1DoctorUserId()
  if (doctorId) {
    const [p] = await db.select({ ps: practitioners.displayNamePashto }).from(practitioners).where(eq(practitioners.userId, doctorId)).limit(1)
    if (p?.ps) return p.ps
  }
  return 'ډاکټر جلال الدین'
}

export async function getPatientAccess(rawToken: string): Promise<PatientAccess> {
  const { status, link } = await resolveLink(rawToken)
  if (!link || status === 'invalid' || status === 'revoked') return { status }
  const w = getVideoWindows()
  const info = {
    doctorName: await doctorDisplayName(),
    scheduledAt: link.session.scheduledAt.toISOString(),
    opensAt: new Date(link.session.scheduledAt.getTime() - w.joinEarlyMinutes * MINUTE).toISOString(),
  }
  if (status === 'ok' && !getLiveKitConfig()) return { status: 'not_configured', info }
  return { status, info }
}

export interface IssuedVideoToken {
  serverUrl: string
  participantToken: string
  expiresInSeconds: number
}

async function signLiveKitToken(input: { identity: string; name: string; room: string; role: 'PATIENT' | 'DOCTOR' }): Promise<IssuedVideoToken> {
  const cfg = getLiveKitConfig()
  if (!cfg) throw new EtabibError('video_not_configured', 'Video is not available yet', 503)
  const at = new AccessToken(cfg.apiKey, cfg.apiSecret, {
    identity: input.identity,
    name: input.name,
    ttl: LIVEKIT_TOKEN_TTL_SECONDS,
    metadata: JSON.stringify({ role: input.role }),
  })
  // Join exactly this room; no create/list/admin/record privileges
  at.addGrant({ roomJoin: true, room: input.room, canPublish: true, canSubscribe: true, canPublishData: false })
  return { serverUrl: cfg.url, participantToken: await at.toJwt(), expiresInSeconds: LIVEKIT_TOKEN_TTL_SECONDS }
}

const ACCESS_ERRORS: Record<Exclude<PatientAccessStatus, 'ok'>, [string, number]> = {
  invalid: ['This link is not valid', 404],
  revoked: ['This link is no longer valid', 410],
  expired: ['This link has expired', 410],
  too_early: ['It is too early to join', 425],
  ended: ['The consultation has ended', 410],
  not_configured: ['Video is not available yet', 503],
}

export async function issuePatientVideoToken(rawToken: string): Promise<IssuedVideoToken> {
  const { status, link } = await resolveLink(rawToken)
  if (status !== 'ok' || !link) {
    const [message, http] = ACCESS_ERRORS[status as Exclude<PatientAccessStatus, 'ok'>]
    throw new EtabibError(`video_${status}`, message, http)
  }
  const issued = await signLiveKitToken({
    identity: `patient-${link.session.id.slice(0, 8)}`,
    name: link.c.patientName ?? 'Patient',
    room: link.session.roomName,
    role: 'PATIENT',
  })
  const now = new Date()
  await db.update(consultationJoinTokens).set({ lastUsedAt: now }).where(eq(consultationJoinTokens.id, link.tokenId))
  await db
    .update(consultationVideoSessions)
    .set({ status: sql`CASE WHEN ${consultationVideoSessions.status} = 'CREATED' THEN 'OPEN'::video_session_status ELSE ${consultationVideoSessions.status} END`, openedAt: sql`coalesce(${consultationVideoSessions.openedAt}, now())`, updatedAt: now })
    .where(eq(consultationVideoSessions.id, link.session.id))
  return issued
}

// ------------------------------------------------------------------
// Doctor access (authenticated dashboard)
// ------------------------------------------------------------------

export async function issueDoctorVideoToken(caseId: string, doctor: { id: string; name: string }): Promise<IssuedVideoToken> {
  const [c] = await db.select().from(consultationCases).where(eq(consultationCases.id, caseId)).limit(1)
  if (!c) throw new EtabibError('not_found', 'Consultation not found', 404)
  if (c.status !== 'CONFIRMED' && c.status !== 'IN_CONSULTATION') {
    throw new EtabibError('video_not_allowed', `Video is not available while the case is ${c.status}`, 409)
  }
  const session = await db.transaction((tx) => sessionForCase(tx, caseId))
  if (!session || session.status === 'ENDED' || session.status === 'EXPIRED') {
    throw new EtabibError('no_video_session', 'No active video session for this case', 409)
  }
  if (Date.now() < session.scheduledAt.getTime() - getVideoWindows().doctorEarlyMinutes * MINUTE) {
    throw new EtabibError('video_too_early', 'It is too early to open the consultation room', 425)
  }
  return signLiveKitToken({ identity: `doctor-${doctor.id.slice(0, 8)}`, name: doctor.name, room: session.roomName, role: 'DOCTOR' })
}

/** Video summary for the admin/doctor case pages (never tokens or room names for patients). */
export async function getVideoSummary(caseId: string) {
  const [session] = await db.select().from(consultationVideoSessions).where(eq(consultationVideoSessions.consultationId, caseId)).limit(1)
  if (!session) return null
  const [links] = await db
    .select({
      total: sql<number>`count(*)`.mapWith(Number),
      active: sql<number>`count(*) filter (where ${consultationJoinTokens.revokedAt} is null and ${consultationJoinTokens.expiresAt} > now())`.mapWith(Number),
      lastCreatedAt: sql<Date | null>`max(${consultationJoinTokens.createdAt})`,
      lastUsedAt: sql<Date | null>`max(${consultationJoinTokens.lastUsedAt})`,
      activeExpiresAt: sql<Date | null>`max(${consultationJoinTokens.expiresAt}) filter (where ${consultationJoinTokens.revokedAt} is null)`,
    })
    .from(consultationJoinTokens)
    .where(and(eq(consultationJoinTokens.sessionId, session.id), gt(consultationJoinTokens.createdAt, new Date(0))))
  return {
    status: session.status,
    scheduledAt: session.scheduledAt,
    openedAt: session.openedAt,
    startedAt: session.startedAt,
    endedAt: session.endedAt,
    patientJoinedAt: session.patientJoinedAt,
    doctorJoinedAt: session.doctorJoinedAt,
    lastActivityAt: session.lastActivityAt,
    links: { generated: links?.total ?? 0, active: links?.active ?? 0, lastCreatedAt: links?.lastCreatedAt ?? null, lastUsedAt: links?.lastUsedAt ?? null, expiresAt: links?.activeExpiresAt ?? null },
    configured: Boolean(getLiveKitConfig()),
  }
}

/** Live participant presence for the doctor's room status (server-side, best effort). */
export async function getRoomPresence(caseId: string): Promise<{ patient: boolean; doctor: boolean } | null> {
  const cfg = getLiveKitConfig()
  const [session] = await db.select().from(consultationVideoSessions).where(eq(consultationVideoSessions.consultationId, caseId)).limit(1)
  if (!cfg || !session || session.status === 'ENDED') return null
  try {
    const participants = await new RoomServiceClient(cfg.httpUrl, cfg.apiKey, cfg.apiSecret).listParticipants(session.roomName)
    return {
      patient: participants.some((p) => p.identity.startsWith('patient-')),
      doctor: participants.some((p) => p.identity.startsWith('doctor-')),
    }
  } catch {
    return { patient: false, doctor: false } // room not created yet
  }
}

// ------------------------------------------------------------------
// LiveKit webhooks → audit events (participant joined/left, room finished)
// ------------------------------------------------------------------

export async function handleLiveKitWebhook(rawBody: string, authHeader: string | null): Promise<{ handled: boolean }> {
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
  return db.transaction(async (tx) => {
    const [session] = await tx.select().from(consultationVideoSessions).where(eq(consultationVideoSessions.roomName, roomName)).limit(1).for('update')
    if (!session) return { handled: false } // not one of ours
    const [c] = await tx.select().from(consultationCases).where(eq(consultationCases.id, session.consultationId)).limit(1)
    if (!c) return { handled: false }
    const now = new Date()
    const identity = event.participant?.identity ?? ''
    const role = identity.startsWith('patient-') ? 'PATIENT' : identity.startsWith('doctor-') ? 'DOCTOR' : null
    const base = { caseId: c.id, oldStatus: c.status, newStatus: c.status, metadata: { videoSessionId: session.id } }

    if ((event.event === 'participant_joined' || event.event === 'participant_left') && role) {
      const joined = event.event === 'participant_joined'
      await recordCaseEvent(tx, {
        ...base,
        eventType: `${role}_VIDEO_${joined ? 'JOINED' : 'LEFT'}` as 'PATIENT_VIDEO_JOINED',
        actor: { type: role, id: null },
      })
      const patch: Partial<VideoSession> = { lastActivityAt: now, updatedAt: now }
      if (joined && role === 'PATIENT' && !session.patientJoinedAt) patch.patientJoinedAt = now
      if (joined && role === 'DOCTOR' && !session.doctorJoinedAt) patch.doctorJoinedAt = now
      if (joined && session.status !== 'ENDED') {
        patch.status = 'IN_PROGRESS'
        if (!session.startedAt) patch.startedAt = now
      }
      await tx.update(consultationVideoSessions).set(patch).where(eq(consultationVideoSessions.id, session.id))
      return { handled: true }
    }
    if (event.event === 'room_finished') {
      await tx.update(consultationVideoSessions).set({ lastActivityAt: now, updatedAt: now }).where(eq(consultationVideoSessions.id, session.id))
      return { handled: true }
    }
    return { handled: false }
  })
}
