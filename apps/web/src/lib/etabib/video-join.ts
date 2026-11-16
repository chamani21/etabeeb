/**
 * eTabib V1 — room-join notices: who really is in a consultation room.
 *
 * Source of truth is the verified LiveKit webhook stream recorded as case events
 * (PATIENT_/DOCTOR_VIDEO_JOINED|LEFT, each with the LiveKit participant sid). A
 * participant counts only when the server issued its identity for THIS room:
 *   patient  identity `patient-<session id prefix>`  + token metadata role PATIENT
 *   doctor   identity `doctor-<V1 doctor id prefix>` + token metadata role DOCTOR
 * Both are set in the server-signed LiveKit token (participants cannot change
 * them), so a client cannot claim a role. Agents, recorders, SIP and any other
 * identity are ignored. No outbound import here (outbound.ts uses the gate).
 */
import { db } from '@etabeeb/db'
import { caseEvents, consultationCases, consultationVideoSessions } from '@etabeeb/db/schema'
import { and, asc, eq, inArray } from 'drizzle-orm'
import { getV1DoctorUserId, getVideoWindows } from './config'
import type { Tx } from './transitions'

export type JoinRole = 'PATIENT' | 'DOCTOR'
type SessionRef = { id: string }

/** Who joined → which notice is queued (and to whom). */
export const JOIN_NOTICE_JOB = { DOCTOR: 'VIDEO_DOCTOR_JOINED_PATIENT', PATIENT: 'VIDEO_PATIENT_JOINED_DOCTOR' } as const
export type JoinNoticeJobType = (typeof JOIN_NOTICE_JOB)[JoinRole]
export const JOIN_NOTICE_JOB_TYPES: ReadonlySet<string> = new Set(Object.values(JOIN_NOTICE_JOB))
export const joinerOf = (jobType: JoinNoticeJobType): JoinRole => (jobType === JOIN_NOTICE_JOB.DOCTOR ? 'DOCTOR' : 'PATIENT')
export const otherRole = (role: JoinRole): JoinRole => (role === 'DOCTOR' ? 'PATIENT' : 'DOCTOR')

/** Only these case states have a live consultation room. */
export const LIVE_CASE_STATUSES: ReadonlySet<string> = new Set(['CONFIRMED', 'IN_CONSULTATION'])

export const patientIdentity = (session: SessionRef) => `patient-${session.id.slice(0, 8)}`
export const doctorIdentity = (doctorUserId: string) => `doctor-${doctorUserId.slice(0, 8)}`

interface ParticipantLike {
  identity?: string
  metadata?: string
  /** LiveKit ParticipantInfo.Kind: 0 = STANDARD (a person); ingress/egress/SIP/agent otherwise */
  kind?: number
}

/** The server-verified role of a LiveKit participant for this session, or null (not a consultation participant). */
export function verifiedParticipantRole(session: SessionRef, participant: ParticipantLike | undefined): JoinRole | null {
  if (!participant?.identity) return null
  if ((participant.kind ?? 0) !== 0) return null
  let role: unknown
  try {
    role = (JSON.parse(participant.metadata || '{}') as { role?: unknown }).role
  } catch {
    return null
  }
  if (participant.identity === patientIdentity(session) && role === 'PATIENT') return 'PATIENT'
  const doctorId = getV1DoctorUserId()
  if (doctorId && participant.identity === doctorIdentity(doctorId) && role === 'DOCTOR') return 'DOCTOR'
  return null
}

/**
 * Is anyone of `role` connected right now? Replays the recorded joins/leaves per
 * LiveKit connection (participant sid), so a reconnect whose `joined` arrives
 * before the old connection's `left` still counts as connected.
 */
export async function roleConnected(tx: Tx | typeof db, caseId: string, role: JoinRole): Promise<boolean> {
  const rows = await tx
    .select({ type: caseEvents.eventType, metadata: caseEvents.metadata })
    .from(caseEvents)
    .where(and(eq(caseEvents.consultationId, caseId), inArray(caseEvents.eventType, [`${role}_VIDEO_JOINED`, `${role}_VIDEO_LEFT`])))
    .orderBy(asc(caseEvents.createdAt), asc(caseEvents.id))
  const open = new Set<string>()
  for (const r of rows) {
    const sid = typeof r.metadata?.participantSid === 'string' ? r.metadata.participantSid : 'legacy'
    if (r.type.endsWith('_JOINED')) open.add(sid)
    else open.delete(sid)
  }
  return open.size > 0
}

export type JoinNoticeGate = { action: 'send' } | { action: 'hold' | 'cancel'; reason: string }

/**
 * Dispatch-time re-check of a queued room-join notice (state may have moved on
 * since the webhook): the case and room are still live, the person who joined
 * is still there, the recipient has not joined meanwhile, and — for the patient —
 * their link opens now (doctors may enter up to an hour early: the notice then
 * waits, without counting as an attempt, until the patient's join window opens).
 */
export async function joinNoticeGate(caseId: string, jobType: JoinNoticeJobType): Promise<JoinNoticeGate> {
  const [row] = await db
    .select({ status: consultationCases.status, session: consultationVideoSessions })
    .from(consultationCases)
    .leftJoin(consultationVideoSessions, eq(consultationVideoSessions.consultationId, consultationCases.id))
    .where(eq(consultationCases.id, caseId))
    .limit(1)
  if (!row || !LIVE_CASE_STATUSES.has(row.status)) return { action: 'cancel', reason: 'case_closed: the consultation is no longer active' }
  if (!row.session || row.session.status === 'ENDED' || row.session.status === 'EXPIRED') return { action: 'cancel', reason: 'room_closed: the video session has ended' }
  const joiner = joinerOf(jobType)
  if (!(await roleConnected(db, caseId, joiner))) return { action: 'cancel', reason: `joined_party_left: the ${joiner.toLowerCase()} is no longer in the room` }
  if (await roleConnected(db, caseId, otherRole(joiner))) return { action: 'cancel', reason: 'recipient_already_connected: both are in the room' }
  if (jobType === JOIN_NOTICE_JOB.DOCTOR) {
    const w = getVideoWindows()
    const scheduled = row.session.scheduledAt.getTime()
    if (row.status === 'CONFIRMED' && Date.now() > scheduled + w.joinLateMinutes * 60_000) return { action: 'cancel', reason: 'patient_link_closed: past the late join limit' }
    if (Date.now() < scheduled - w.joinEarlyMinutes * 60_000) return { action: 'hold', reason: "waiting_for_patient_join_window: sent when the patient's link opens" }
  }
  return { action: 'send' }
}
