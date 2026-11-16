/**
 * Room-join WhatsApp notices (synthetic data, local test DB): a verified LiveKit
 * participant_joined for the doctor notifies the patient and vice versa — once
 * per role per consultation, never for observers / other rooms / closed cases,
 * never outside WhatsApp's rules, and never blocking the webhook.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'

vi.mock('@/lib/auth-helpers', () => ({ getCurrentUser: vi.fn() }))

import { createHash, randomBytes } from 'crypto'
import { AccessToken } from 'livekit-server-sdk'
import { NextRequest } from 'next/server'
import { db } from '@etabeeb/db'
import { consultationJoinTokens, consultationVideoSessions, notificationOutbox, whatsappEvents } from '@etabeeb/db/schema'
import { eq, inArray } from 'drizzle-orm'
import { cancelConsultation } from '@/lib/etabib/cases'
import { dispatchPendingOutboundJobs } from '@/lib/etabib/outbound'
import { hashJoinToken, mintPatientJoinLink } from '@/lib/etabib/video'
import { TEMPLATE_DEFINITIONS } from '@/lib/etabib/templates'
import { joinNoticeDispatchesSettled } from '@/lib/etabib/video-webhook'
import { POST as webhookRoute } from '@/app/api/video/livekit-webhook/route'
import { POST as patientTokenRoute } from '@/app/api/video/patient/token/route'
import { caseAt, createUser, eventsFor, getCase, hasTestDb, jobsOfType, jsonRequest, resetDb } from './helpers'

const LK = { url: 'wss://livekit.example.test', key: 'APItestkey', secret: 'test-livekit-secret-not-real-0123456789abcdef' }
const DOCTOR_PHONE = '+923009990001'
const APP = 'https://staging.example.test'
const NOTICE_TYPES = ['VIDEO_DOCTOR_JOINED_PATIENT', 'VIDEO_PATIENT_JOINED_DOCTOR']

async function signedWebhook(body: object) {
  const raw = JSON.stringify(body)
  const at = new AccessToken(LK.key, LK.secret)
  at.sha256 = createHash('sha256').update(raw).digest('base64')
  return webhookRoute(new NextRequest('http://localhost/api/video/livekit-webhook', { method: 'POST', body: raw, headers: { authorization: await at.toJwt(), 'content-type': 'application/webhook+json' } }))
}

const session = async (caseId: string) => (await db.select().from(consultationVideoSessions).where(eq(consultationVideoSessions.consultationId, caseId)))[0]!
const jobRow = async (id: string) => (await db.select().from(notificationOutbox).where(eq(notificationOutbox.id, id)))[0]!
const noticeJobs = async () => (await db.select().from(notificationOutbox).where(inArray(notificationOutbox.templateKey, NOTICE_TYPES)))
const tokenOf = (text: string) => text.match(/\/consult\/([A-Za-z0-9_-]{43})/)?.[1] ?? null
const patientToken = (token: string) => patientTokenRoute(jsonRequest('/x', { token }))

describe.skipIf(!hasTestDb)('LiveKit room-join notices', () => {
  let adminId: string
  let doctorId: string
  let fetchMock: ReturnType<typeof vi.fn>

  beforeEach(async () => {
    await resetDb()
    adminId = await createUser('Synthetic Admin')
    doctorId = await createUser('Synthetic Doctor')
    Object.assign(process.env, {
      ETABIB_V1_DOCTOR_USER_ID: doctorId,
      ETABIB_DOCTOR_WHATSAPP: DOCTOR_PHONE,
      LIVEKIT_URL: LK.url,
      LIVEKIT_API_KEY: LK.key,
      LIVEKIT_API_SECRET: LK.secret,
      NEXT_PUBLIC_APP_URL: APP,
      ETABIB_N8N_OUTBOUND_URL: 'https://n8n.example.test/webhook/outbound',
      ETABIB_N8N_OUTBOUND_KEY: 'test-outbound-key',
    })
    fetchMock = vi.fn().mockResolvedValue(new Response('{}', { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)
  })
  afterEach(async () => {
    await joinNoticeDispatchesSettled()
    vi.unstubAllGlobals()
    for (const k of ['ETABIB_DOCTOR_WHATSAPP', 'LIVEKIT_URL', 'LIVEKIT_API_KEY', 'LIVEKIT_API_SECRET', 'NEXT_PUBLIC_APP_URL', 'ETABIB_N8N_OUTBOUND_URL', 'ETABIB_N8N_OUTBOUND_KEY', 'ETABIB_WA_TEMPLATES']) delete process.env[k]
  })

  /** A confirmed case whose consultation time is now; the patient's confirmation link is already out. */
  async function liveCase(status: 'CONFIRMED' | 'IN_CONSULTATION' = 'CONFIRMED', minutesFromNow = -5) {
    const c = await caseAt(status, { adminId, doctorId })
    // earlier lifecycle messages count as already delivered (a re-sent confirmation would rotate the link)
    await db.update(notificationOutbox).set({ status: 'sent' }).where(eq(notificationOutbox.status, 'pending'))
    await db.update(consultationVideoSessions).set({ scheduledAt: new Date(Date.now() + minutesFromNow * 60_000) }).where(eq(consultationVideoSessions.consultationId, c.id))
    const confirmationLink = tokenOf((await mintPatientJoinLink(c.id))!.url)!
    // the doctor wrote to eTabeeb recently (24-hour window open), unless a test says otherwise
    await db.insert(whatsappEvents).values({ wamid: `wamid.DOC.${randomBytes(6).toString('hex')}`, senderPhone: DOCTOR_PHONE, eventType: 'text' })
    const s = await session(c.id)
    return { ...c, room: s.roomName, sessionId: s.id, confirmationLink }
  }

  type Who = 'patient' | 'doctor'
  function participant(c: { sessionId: string }, who: Who, sid: string, over: Record<string, unknown> = {}) {
    const identity = who === 'patient' ? `patient-${c.sessionId.slice(0, 8)}` : `doctor-${doctorId.slice(0, 8)}`
    return { identity, sid, metadata: JSON.stringify({ role: who.toUpperCase() }), ...over }
  }
  let seq = 0
  const event = (event: string, room: string, p?: object, id = `EV_${++seq}_${randomBytes(4).toString('hex')}`) =>
    signedWebhook({ event, id, createdAt: String(Math.floor(Date.now() / 1000)), room: { name: room }, ...(p ? { participant: p } : {}) })
  const join = (c: { room: string; sessionId: string }, who: Who, sid = `PA_${who}_1`, over?: Record<string, unknown>) => event('participant_joined', c.room, participant(c, who, sid, over))
  const leave = (c: { room: string; sessionId: string }, who: Who, sid = `PA_${who}_1`) => event('participant_left', c.room, participant(c, who, sid))

  /** Bodies posted to n8n for room-join notices. */
  const sentNotices = () =>
    fetchMock.mock.calls.map((call) => JSON.parse(String((call[1] as RequestInit).body))).filter((b: { type: string }) => NOTICE_TYPES.includes(b.type))
  /** Wait for the dispatches the webhook started without awaiting them. */
  const settled = () => joinNoticeDispatchesSettled()

  it('1. doctor joins first → the patient gets the Pashto notice with a working link; the earlier link still works', async () => {
    const c = await liveCase()
    expect((await join(c, 'doctor')).status).toBe(200)
    await settled()
    const [n] = sentNotices()
    expect(sentNotices()).toHaveLength(1)
    expect(n).toMatchObject({ type: 'VIDEO_DOCTOR_JOINED_PATIENT', audience: 'PATIENT', messageKind: 'text', to: c.sender })
    expect(n.text).toContain('🟢 ډاکټر ستاسو د آنلاین مشورې خونې ته داخل شو.')
    expect(n.text).toContain('ستاسو په تمه دی.')
    expect(n.text).toContain('🎥 د مشورې لپاره لاندې لینک کېکاږئ:')
    expect(n.text).not.toMatch(/eyJ[A-Za-z0-9_-]+\./) // never a LiveKit JWT
    const link = tokenOf(n.text)!
    expect(n.text).toContain(`${APP}/consult/${link}`)
    expect((await patientToken(link)).status).toBe(200)
    expect((await patientToken(c.confirmationLink)).status).toBe(200) // not revoked
    // same restrictions as the confirmation link: same session, role and expiry
    const rows = await db.select().from(consultationJoinTokens).where(inArray(consultationJoinTokens.tokenHash, [hashJoinToken(link), hashJoinToken(c.confirmationLink)]))
    expect(new Set(rows.map((r) => `${r.sessionId}|${r.role}|${r.expiresAt.toISOString()}`)).size).toBe(1)
    // then the patient joins: the doctor is there → no "waiting" message to the doctor
    await join(c, 'patient')
    await settled()
    expect(sentNotices()).toHaveLength(1)
    const events = await eventsFor(c.id)
    expect(events.filter((e) => e.eventType === 'VIDEO_JOIN_NOTICE_SKIPPED').map((e) => e.metadata)).toEqual([expect.objectContaining({ joinedRole: 'PATIENT', reason: 'recipient_already_connected' })])
    for (const e of events) expect(JSON.stringify(e.metadata)).not.toContain(link)
    expect((await getCase(c.id)).status).toBe('CONFIRMED') // joining never starts the consultation
  })

  it('2. patient joins first → the doctor gets the notice with the dashboard link (no patient token)', async () => {
    const c = await liveCase()
    await join(c, 'patient')
    await settled()
    const [n] = sentNotices()
    expect(n).toMatchObject({ type: 'VIDEO_PATIENT_JOINED_DOCTOR', audience: 'DOCTOR', to: DOCTOR_PHONE, messageKind: 'text' })
    expect(n.text).toBe(`🟢 ناروغ د آنلاین مشورې خونې ته داخل شو.\n\n👤 ناروغ: Synthetic Patient\n\nناروغ اوس ستاسو په تمه دی.\n\n🎥 مشوره پرانیزئ:\n${APP}/doctor/cases/${c.id}`)
    expect(n.text).not.toContain('/consult/')
    await join(c, 'doctor')
    await settled()
    expect(sentNotices()).toHaveLength(1)
  })

  it('3. both join nearly simultaneously → one decision each, no misleading "waiting" message', async () => {
    const c = await liveCase()
    const res = await Promise.all([join(c, 'doctor'), join(c, 'patient')])
    expect(res.map((r) => r.status)).toEqual([200, 200])
    await settled()
    const types = (await eventsFor(c.id)).map((e) => e.eventType)
    expect(types.filter((t) => t === 'VIDEO_JOIN_NOTICE_QUEUED')).toHaveLength(1)
    expect(types.filter((t) => t === 'VIDEO_JOIN_NOTICE_SKIPPED')).toHaveLength(1)
    // the queued notice is re-checked at dispatch; if the other join landed first it is withdrawn
    expect(sentNotices().length).toBeLessThanOrEqual(1)
    const [job] = await noticeJobs()
    if (job!.status === 'cancelled') expect(job!.lastError).toMatch(/^recipient_already_connected/)
    // a third connection (refresh) of either side changes nothing
    await join(c, 'doctor', 'PA_doctor_2')
    await join(c, 'patient', 'PA_patient_2')
    await settled()
    expect(await noticeJobs()).toHaveLength(1)
  })

  it('3b. join webhooks and concurrent link minting (notice dispatch) never deadlock', async () => {
    for (let round = 0; round < 4; round++) {
      const c = await liveCase()
      const results = await Promise.all([
        join(c, 'patient', `PA_p_${round}`),
        mintPatientJoinLink(c.id, undefined, { keepExisting: { jobId: `00000000-0000-4000-8000-00000000000${round}` } }),
        join(c, 'doctor', `PA_d_${round}`),
        mintPatientJoinLink(c.id),
        leave(c, 'patient', `PA_p_${round}`),
      ])
      for (const r of [results[0], results[2], results[4]] as Response[]) expect(r.status).toBe(200)
      await settled()
    }
  })

  it('4. a duplicate webhook delivery (same event id) is handled once', async () => {
    const c = await liveCase()
    const p = participant(c, 'doctor', 'PA_doc')
    const first = await event('participant_joined', c.room, p, 'EV_DUPLICATE')
    const again = await event('participant_joined', c.room, p, 'EV_DUPLICATE')
    expect((await first.json()).handled).toBe(true)
    expect(await again.json()).toMatchObject({ handled: true, duplicate: true })
    await settled()
    expect((await eventsFor(c.id)).filter((e) => e.eventType === 'DOCTOR_VIDEO_JOINED')).toHaveLength(1)
    expect(await noticeJobs()).toHaveLength(1)
    expect(sentNotices()).toHaveLength(1)
  })

  it('5. doctor reconnects / refreshes → still one patient notice', async () => {
    const c = await liveCase()
    await join(c, 'doctor', 'PA_d1')
    await settled()
    await leave(c, 'doctor', 'PA_d1') // network drop
    await join(c, 'doctor', 'PA_d2') // reconnect
    await join(c, 'doctor', 'PA_d3') // page refresh: new connection reported before the old one leaves
    await leave(c, 'doctor', 'PA_d2')
    await settled()
    expect(sentNotices()).toHaveLength(1)
    expect(await noticeJobs()).toHaveLength(1)
    // the doctor is still counted as present (PA_d3): the patient joining sends nothing
    await join(c, 'patient')
    await settled()
    expect(sentNotices()).toHaveLength(1)
  })

  it('6. patient reconnects / refreshes → still one doctor notice', async () => {
    const c = await liveCase()
    await join(c, 'patient', 'PA_p1')
    await settled()
    await leave(c, 'patient', 'PA_p1')
    await join(c, 'patient', 'PA_p2')
    await leave(c, 'patient', 'PA_p2')
    await join(c, 'patient', 'PA_p3')
    await settled()
    expect(sentNotices().map((n: { type: string }) => n.type)).toEqual(['VIDEO_PATIENT_JOINED_DOCTOR'])
  })

  it('7. unverified participants never notify (foreign identity, forged role, agent/recorder, another doctor)', async () => {
    const c = await liveCase()
    const otherDoctor = await createUser('Synthetic Other Doctor')
    for (const over of [
      { identity: 'patient-abc' }, // not issued for this room
      { metadata: JSON.stringify({ role: 'DOCTOR' }) }, // patient identity, wrong role
      { metadata: 'not json' },
      { metadata: '' },
      { kind: 'AGENT' },
      { kind: 'EGRESS' },
      { identity: `doctor-${otherDoctor.slice(0, 8)}`, metadata: JSON.stringify({ role: 'DOCTOR' }) },
      { identity: 'admin-observer', metadata: JSON.stringify({ role: 'DOCTOR' }) },
    ]) {
      expect((await join(c, 'patient', `PA_x_${++seq}`, over)).status).toBe(200)
    }
    await settled()
    expect(await noticeJobs()).toHaveLength(0)
    expect(sentNotices()).toHaveLength(0)
    expect((await eventsFor(c.id)).some((e) => e.eventType.startsWith('VIDEO_JOIN_NOTICE'))).toBe(false)
    // an unsigned or forged webhook is rejected outright
    const forged = await webhookRoute(new NextRequest('http://localhost/x', { method: 'POST', body: JSON.stringify({ event: 'participant_joined' }) }))
    expect(forged.status).toBe(401)
  })

  it('8. a participant of another consultation, or an unknown room, never notifies', async () => {
    const a = await liveCase()
    const b = await liveCase()
    // case A's patient identity reported in case B's room
    expect((await event('participant_joined', b.room, participant(a, 'patient', 'PA_a'))).status).toBe(200)
    const unknown = await event('participant_joined', 'etb-unknown', participant(a, 'doctor', 'PA_u'))
    expect((await unknown.json()).handled).toBe(false)
    await settled()
    expect(await noticeJobs()).toHaveLength(0)
  })

  it('9. completed or cancelled consultations never get join notices (also when it closes before dispatch)', async () => {
    const done = await caseAt('COMPLETED', { adminId, doctorId })
    const s = await session(done.id)
    await join({ room: s.roomName, sessionId: s.id }, 'doctor')
    const cancelled = await liveCase()
    await cancelConsultation(cancelled.id, { reason: 'PATIENT_REQUESTED' }, { type: 'ADMIN', id: adminId })
    await join(cancelled, 'doctor')
    await settled()
    expect(await noticeJobs()).toHaveLength(0)
    // queued while n8n is unreachable, cancelled before it could be sent → withdrawn
    delete process.env.ETABIB_N8N_OUTBOUND_URL
    const raced = await liveCase()
    await join(raced, 'patient')
    const [queued] = await noticeJobs()
    expect(queued).toMatchObject({ status: 'pending' })
    await cancelConsultation(raced.id, { reason: 'DOCTOR_UNAVAILABLE' }, { type: 'DOCTOR', id: doctorId })
    expect(await jobRow(queued!.id)).toMatchObject({ status: 'cancelled' })
    process.env.ETABIB_N8N_OUTBOUND_URL = 'https://n8n.example.test/webhook/outbound'
    await dispatchPendingOutboundJobs()
    expect(sentNotices()).toHaveLength(0)
  })

  it('10. WhatsApp/n8n failure: the webhook still answers at once, the job is retried safely, the call is unaffected', async () => {
    const c = await liveCase()
    let release!: () => void
    fetchMock.mockImplementationOnce(() => new Promise((resolve) => (release = () => resolve(new Response('busy', { status: 503 })))))
    const res = await join(c, 'doctor') // n8n is hanging: the webhook does not wait for it
    expect(res.status).toBe(200)
    expect((await getCase(c.id)).status).toBe('CONFIRMED')
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1))
    release()
    const [job] = await noticeJobs()
    await vi.waitFor(async () => expect((await jobRow(job!.id)).lastError).toBe('http_503'))
    expect(await jobRow(job!.id)).toMatchObject({ status: 'pending', attempts: 1 })
    const failedLink = tokenOf(JSON.parse(String((fetchMock.mock.calls[0]![1] as RequestInit).body)).text)!
    // the scheduler retries: one notice, the link minted by the failed attempt is revoked, the confirmation link is not
    await dispatchPendingOutboundJobs()
    const sent = sentNotices()
    expect(sent).toHaveLength(2) // attempt 1 (503) + attempt 2
    const link = tokenOf(sent[1].text)!
    expect(link).not.toBe(failedLink)
    expect((await patientToken(failedLink)).status).toBe(410)
    expect((await patientToken(link)).status).toBe(200)
    expect((await patientToken(c.confirmationLink)).status).toBe(200)
    // a network error is contained the same way
    const d = await liveCase()
    fetchMock.mockRejectedValueOnce(new TypeError('fetch failed'))
    expect((await join(d, 'patient')).status).toBe(200)
    await vi.waitFor(async () => expect((await noticeJobs()).find((j) => j.templateKey === 'VIDEO_PATIENT_JOINED_DOCTOR' && j.lastError)?.lastError).toMatch(/^dispatch_error/))
  })

  it('11. closed 24-hour window: no free-form send; the approved template is used once configured', async () => {
    const c = await liveCase()
    await db.update(whatsappEvents).set({ createdAt: new Date(Date.now() - 30 * 3600_000) }) // nobody wrote for 30 h
    await join(c, 'doctor')
    await settled()
    const [patientJob] = await noticeJobs()
    expect(patientJob).toMatchObject({ status: 'failed' })
    expect(patientJob!.lastError).toBe('template_required: 24-hour window closed and etabib_doctor_joined_ps is not approved/configured')
    expect(sentNotices()).toHaveLength(0)
    expect(await db.select().from(consultationJoinTokens).where(eq(consultationJoinTokens.sessionId, c.sessionId))).toHaveLength(1) // no link minted for an unsent notice

    const d = await liveCase()
    await db.update(whatsappEvents).set({ createdAt: new Date(Date.now() - 30 * 3600_000) })
    process.env.ETABIB_WA_TEMPLATES = JSON.stringify({
      PATIENT_DOCTOR_JOINED: { name: TEMPLATE_DEFINITIONS.PATIENT_DOCTOR_JOINED.proposedName, language: 'ps_AF' },
      DOCTOR_PATIENT_JOINED: { name: TEMPLATE_DEFINITIONS.DOCTOR_PATIENT_JOINED.proposedName, language: 'ps_AF' },
    })
    await join(d, 'patient')
    await settled()
    const [t] = sentNotices()
    expect(t).toMatchObject({ type: 'VIDEO_PATIENT_JOINED_DOCTOR', messageKind: 'template', to: DOCTOR_PHONE, template: { name: 'etabib_patient_joined_ps', language: 'ps_AF' } })
    expect(t.text).toBeUndefined()
    expect(t.template.components[0].parameters.map((p: { text: string }) => p.text)).toEqual(['Synthetic Patient', `${APP}/doctor/cases/${d.id}`])
  })

  it('12. doctor in the room before the patient link opens: the notice waits, then goes out when the link works', async () => {
    const c = await liveCase('CONFIRMED', 50) // doctors may enter up to 60 min early, patients 15
    await join(c, 'doctor')
    await settled()
    const [job] = await noticeJobs()
    expect(job).toMatchObject({ status: 'pending', attempts: 0 })
    expect(job!.lastError).toMatch(/^waiting_for_patient_join_window/)
    expect(sentNotices()).toHaveLength(0)
    await db.update(consultationVideoSessions).set({ scheduledAt: new Date(Date.now() + 10 * 60_000) }).where(eq(consultationVideoSessions.id, c.sessionId))
    await dispatchPendingOutboundJobs()
    const [n] = sentNotices()
    expect((await patientToken(tokenOf(n.text)!)).status).toBe(200)
    // a doctor who left before the window opened sends nothing
    const d = await liveCase('CONFIRMED', 50)
    await join(d, 'doctor', 'PA_early')
    await settled()
    await leave(d, 'doctor', 'PA_early')
    await db.update(consultationVideoSessions).set({ scheduledAt: new Date(Date.now() + 10 * 60_000) }).where(eq(consultationVideoSessions.id, d.sessionId))
    await dispatchPendingOutboundJobs()
    expect(sentNotices()).toHaveLength(1)
    expect((await noticeJobs()).find((j) => j.id !== job!.id)!.lastError).toMatch(/^joined_party_left/)
  })

  it('12b. a notice withdrawn because the joiner left is re-armed: the next real join still notifies the other side (once)', async () => {
    // doctor peeks in early, leaves before the patient link opens, comes back at the consultation time
    const c = await liveCase('CONFIRMED', 50)
    await join(c, 'doctor', 'PA_early')
    await settled()
    await leave(c, 'doctor', 'PA_early')
    await db.update(consultationVideoSessions).set({ scheduledAt: new Date(Date.now() + 10 * 60_000) }).where(eq(consultationVideoSessions.id, c.sessionId))
    await dispatchPendingOutboundJobs()
    expect(sentNotices()).toHaveLength(0)
    await join(c, 'doctor', 'PA_back')
    await settled()
    const sent = sentNotices()
    expect(sent.map((n: { type: string }) => n.type)).toEqual(['VIDEO_DOCTOR_JOINED_PATIENT'])
    expect((await patientToken(tokenOf(sent[0].text)!)).status).toBe(200)
    // once delivered, later reconnects never notify again
    await leave(c, 'doctor', 'PA_back')
    await join(c, 'doctor', 'PA_again')
    await settled()
    expect(sentNotices()).toHaveLength(1)

    // same for the patient: n8n was down, the patient gave up before the retry, then came back
    const d = await liveCase()
    delete process.env.ETABIB_N8N_OUTBOUND_URL
    await join(d, 'patient', 'PA_p1')
    await settled()
    await leave(d, 'patient', 'PA_p1')
    process.env.ETABIB_N8N_OUTBOUND_URL = 'https://n8n.example.test/webhook/outbound'
    await dispatchPendingOutboundJobs()
    expect(sentNotices().filter((n: { type: string }) => n.type === 'VIDEO_PATIENT_JOINED_DOCTOR')).toHaveLength(0)
    await join(d, 'patient', 'PA_p2')
    await settled()
    expect(sentNotices().filter((n: { type: string }) => n.type === 'VIDEO_PATIENT_JOINED_DOCTOR')).toHaveLength(1)
  })

  it('13. join notices leave the existing workflow untouched (statuses, confirmation messages, IN_CONSULTATION rejoin)', async () => {
    const c = await liveCase('IN_CONSULTATION')
    const before = (await jobsOfType('CONSULTATION_CONFIRMED_PATIENT')).length
    await join(c, 'patient')
    await join(c, 'doctor')
    await settled()
    expect((await getCase(c.id)).status).toBe('IN_CONSULTATION')
    expect((await jobsOfType('CONSULTATION_CONFIRMED_PATIENT')).length).toBe(before)
    expect(sentNotices().map((n: { type: string }) => n.type)).toEqual(['VIDEO_PATIENT_JOINED_DOCTOR'])
    const s = await session(c.id)
    expect(s.status).toBe('IN_PROGRESS')
    expect((await patientToken(c.confirmationLink)).status).toBe(200)
  })
})
