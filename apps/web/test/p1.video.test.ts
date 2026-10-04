/**
 * Phase 6.6 — video consultation security + function. Synthetic data only;
 * LiveKit credentials are test values (tokens are signed locally and verified
 * with TokenVerifier; no LiveKit server is contacted).
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'

vi.mock('@/lib/auth-helpers', () => ({ getCurrentUser: vi.fn() }))

import { getCurrentUser } from '@/lib/auth-helpers'
import { createHash } from 'crypto'
import { AccessToken, TokenVerifier } from 'livekit-server-sdk'
import { NextRequest } from 'next/server'
import { db } from '@etabeeb/db'
import { consultationCases, consultationJoinTokens, consultationVideoSessions, notificationOutbox } from '@etabeeb/db/schema'
import { eq, sql } from 'drizzle-orm'
import { createVideoSessionTx, mintPatientJoinLink, hashJoinToken, LIVEKIT_TOKEN_TTL_SECONDS } from '@/lib/etabib/video'
import { applyOutboundResult, regeneratePatientVideoLink } from '@/lib/etabib/cases'
import { dispatchOutboundJobs } from '@/lib/etabib/outbound'
import { POST as patientAccessRoute } from '@/app/api/video/patient/access/route'
import { POST as patientTokenRoute } from '@/app/api/video/patient/token/route'
import { POST as doctorTokenRoute } from '@/app/api/doctor/cases/[id]/video/token/route'
import { POST as legacyVideoRoute } from '@/app/api/video/token/route'
import { POST as regenerateRoute } from '@/app/api/admin/cases/[id]/video/regenerate-link/route'
import { POST as webhookRoute } from '@/app/api/video/livekit-webhook/route'
import { POST as whatsappHook } from '@/app/api/hooks/whatsapp/route'
import { POST as outboundResultRoute } from '@/app/api/hooks/outbound-result/route'
import { GET as adminDetailRoute } from '@/app/api/admin/cases/[id]/route'
import { GET as doctorDetailRoute } from '@/app/api/doctor/cases/[id]/route'
import { hasTestDb, HOOK_KEY, resetDb, createUser, jsonRequest, getCase, eventsFor, jobsOfType, caseAt } from './helpers'

const LK = { url: 'wss://livekit.example.test', key: 'APItestkey', secret: 'test-livekit-secret-not-real-0123456789abcdef' }
type SessionUser = NonNullable<Awaited<ReturnType<typeof getCurrentUser>>>
const mockUser = vi.mocked(getCurrentUser)
const loginAs = (id: string | null, role = 'practitioner') =>
  mockUser.mockResolvedValue(id ? ({ id, role, publicId: id, phone: '', displayName: 'Syn', locale: 'en', mustChangePassword: false } as SessionUser) : null)
const p = (id: string) => ({ params: { id } })
const tokenOf = (url: string) => url.split('/consult/')[1]!
const access = async (token: string) => (await patientAccessRoute(jsonRequest('/x', { token }))).json()
const patientToken = (token: string) => patientTokenRoute(jsonRequest('/x', { token }))
const verify = (jwt: string) => new TokenVerifier(LK.key, LK.secret).verify(jwt)
const session = async (caseId: string) => (await db.select().from(consultationVideoSessions).where(eq(consultationVideoSessions.consultationId, caseId)))[0]
const schedule = (caseId: string, minutesFromNow: number) =>
  db.update(consultationVideoSessions).set({ scheduledAt: new Date(Date.now() + minutesFromNow * 60_000) }).where(eq(consultationVideoSessions.consultationId, caseId))

describe.skipIf(!hasTestDb)('Phase 6.6 video consultation', () => {
  let adminId: string
  let doctorId: string
  let otherDoctorId: string
  beforeEach(async () => {
    await resetDb()
    adminId = await createUser('Synthetic Admin')
    doctorId = await createUser('Synthetic Doctor')
    otherDoctorId = await createUser('Synthetic Other Doctor')
    process.env.ETABIB_V1_DOCTOR_USER_ID = doctorId
    process.env.LIVEKIT_URL = LK.url
    process.env.LIVEKIT_API_KEY = LK.key
    process.env.LIVEKIT_API_SECRET = LK.secret
    process.env.NEXT_PUBLIC_APP_URL = 'https://staging.example.test'
    mockUser.mockReset()
  })
  afterEach(() => {
    vi.unstubAllGlobals()
    for (const k of ['LIVEKIT_URL', 'LIVEKIT_API_KEY', 'LIVEKIT_API_SECRET', 'NEXT_PUBLIC_APP_URL', 'ETABIB_N8N_OUTBOUND_URL', 'ETABIB_N8N_OUTBOUND_KEY']) delete process.env[k]
  })
  const confirmedNow = async () => {
    const c = await caseAt('CONFIRMED', { adminId, doctorId })
    await schedule(c.id, 5)
    return c
  }

  describe('session creation only after payment + doctor approval', () => {
    it('1-3. no session (and no usable link) before CONFIRMED', async () => {
      for (const stage of ['ADMIN_INTAKE', 'AWAITING_PAYMENT', 'PAYMENT_RECEIVED', 'AWAITING_DOCTOR_APPROVAL'] as const) {
        const { id } = await caseAt(stage, { adminId, doctorId })
        expect(await session(id)).toBeUndefined()
        expect(await mintPatientJoinLink(id)).toBeNull()
      }
    })

    it('2/3. the service refuses unpaid or non-approved cases even if called directly', async () => {
      const { id } = await caseAt('CONFIRMED', { adminId, doctorId })
      const c = await getCase(id)
      for (const bad of [{ ...c, paymentReceived: false }, { ...c, doctorDecision: 'PROPOSE_NEW_TIME' as const }, { ...c, status: 'PAYMENT_RECEIVED' as const }]) {
        await expect(db.transaction((tx) => createVideoSessionTx(tx, bad, { type: 'SYSTEM' }))).rejects.toMatchObject({ code: 'video_not_allowed' })
      }
    })

    it('CONFIRMED creates exactly one case-bound session with an opaque room name', async () => {
      const { id, sender } = await caseAt('CONFIRMED', { adminId, doctorId })
      const all = await db.select().from(consultationVideoSessions)
      expect(all).toHaveLength(1)
      expect(all[0]!.consultationId).toBe(id)
      expect(all[0]!.roomName).toMatch(/^etb-[0-9a-f]{32}$/)
      expect(all[0]!.roomName).not.toContain(id.slice(0, 8))
      expect(all[0]!.roomName).not.toContain(sender.replace('+', ''))
      expect((await eventsFor(id)).map((e) => e.eventType)).toContain('VIDEO_SESSION_CREATED')
      // retried approval does not create a second session
      expect(await db.select().from(consultationVideoSessions)).toHaveLength(1)
    })
  })

  describe('patient link → short-lived single-room LiveKit token', () => {
    it('valid link: access ok, then a 15-minute token that can only join this room', async () => {
      const { id } = await confirmedNow()
      const link = await mintPatientJoinLink(id)
      const token = tokenOf(link!.url)
      expect(link!.url).toMatch(/^https:\/\/staging\.example\.test\/consult\/[A-Za-z0-9_-]{43}$/)
      expect(await access(token)).toMatchObject({ status: 'ok', info: { doctorName: expect.any(String) } })
      const res = await patientToken(token)
      expect(res.status).toBe(200)
      const body = await res.json()
      expect(body.serverUrl).toBe(LK.url)
      expect(body.expiresInSeconds).toBe(LIVEKIT_TOKEN_TTL_SECONDS)
      const claims = await verify(body.participantToken)
      const s = await session(id)
      expect(claims.video).toMatchObject({ roomJoin: true, room: s!.roomName, canPublish: true, canSubscribe: true, canPublishData: false })
      expect(claims.video?.roomAdmin).toBeFalsy()
      expect(claims.video?.roomList).toBeFalsy()
      expect(claims.video?.roomCreate).toBeFalsy()
      expect(claims.sub).toBe(`patient-${s!.id.slice(0, 8)}`)
      expect((claims.exp as number) - Math.floor(Date.now() / 1000)).toBeLessThanOrEqual(LIVEKIT_TOKEN_TTL_SECONDS + 5)
      expect((await session(id))!.status).toBe('OPEN')
    })

    it('only the hash is stored; the response never contains secrets', async () => {
      const { id } = await confirmedNow()
      const token = tokenOf((await mintPatientJoinLink(id))!.url)
      const rows = await db.select().from(consultationJoinTokens)
      expect(rows).toHaveLength(1)
      expect(rows[0]!.tokenHash).toBe(hashJoinToken(token))
      expect(JSON.stringify(rows)).not.toContain(token)
      const raw = await (await patientToken(token)).text()
      expect(raw).not.toContain(LK.secret)
      expect(raw).not.toContain('APItestkey')
    })

    it('4/7. invalid, random, malformed or one-character-modified tokens are rejected', async () => {
      const { id } = await confirmedNow()
      const token = tokenOf((await mintPatientJoinLink(id))!.url)
      const modified = token.slice(0, -1) + (token.endsWith('A') ? 'B' : 'A')
      for (const t of [modified, 'A'.repeat(43), 'not-a-token', '../../etc', '']) {
        const res = await patientToken(t)
        expect([400, 404]).toContain(res.status)
      }
      expect((await access(modified)).status).toBe('invalid')
    })

    it('5. an expired link is rejected', async () => {
      const { id } = await confirmedNow()
      const token = tokenOf((await mintPatientJoinLink(id))!.url)
      await db.update(consultationJoinTokens).set({ expiresAt: new Date(Date.now() - 1000) })
      expect((await patientToken(token)).status).toBe(410)
      expect((await access(token)).status).toBe('expired')
    })

    it('6/18. revoke + regenerate: old link stops working, new one works, audited, double-click safe', async () => {
      const { id } = await confirmedNow()
      const old = tokenOf((await mintPatientJoinLink(id))!.url)
      loginAs(adminId, 'administrator')
      process.env.ETABIB_N8N_OUTBOUND_URL = 'https://n8n.example.test/webhook/outbound'
      process.env.ETABIB_N8N_OUTBOUND_KEY = 'test-outbound-key'
      const fetchMock = vi.fn().mockResolvedValue(new Response('{}', { status: 200 }))
      vi.stubGlobal('fetch', fetchMock)
      const res = await regenerateRoute(jsonRequest('/x', {}), p(id))
      expect((await res.json()).changed).toBe(true)
      expect((await patientToken(old)).status).toBe(410)
      expect((await access(old)).status).toBe('revoked')
      const sentText = JSON.parse(fetchMock.mock.calls.at(-1)![1].body).text as string
      const fresh = sentText.match(/\/consult\/([A-Za-z0-9_-]{43})/)![1]!
      expect((await patientToken(fresh)).status).toBe(200)
      const again = await regenerateRoute(jsonRequest('/x', {}), p(id))
      expect((await again.json()).changed).toBe(false)
      const types = (await eventsFor(id)).map((e) => e.eventType)
      expect(types.filter((t) => t === 'VIDEO_LINK_REVOKED').length).toBeGreaterThanOrEqual(1)
      expect(types.filter((t) => t === 'VIDEO_LINK_CREATED').length).toBe(2)
      for (const e of await eventsFor(id)) expect(JSON.stringify(e.metadata)).not.toMatch(/[A-Za-z0-9_-]{43}/)
    })

    it('join window: too early before scheduled−15min; late cut-off only while not started', async () => {
      const { id } = await confirmedNow()
      const token = tokenOf((await mintPatientJoinLink(id))!.url)
      await schedule(id, 120)
      expect((await patientToken(token)).status).toBe(425)
      expect(await access(token)).toMatchObject({ status: 'too_early', info: { opensAt: expect.any(String) } })
      await schedule(id, -180)
      expect((await patientToken(token)).status).toBe(410)
      await db.update(consultationCases).set({ status: 'IN_CONSULTATION' }).where(eq(consultationCases.id, id))
      expect((await patientToken(token)).status).toBe(200)
    })

    it('8/9. a patient token is bound to its own room and the client cannot choose a room', async () => {
      const a = await confirmedNow()
      const b = await confirmedNow()
      const ta = tokenOf((await mintPatientJoinLink(a.id))!.url)
      const claims = await verify((await (await patientToken(ta)).json()).participantToken)
      expect(claims.video?.room).toBe((await session(a.id))!.roomName)
      expect(claims.video?.room).not.toBe((await session(b.id))!.roomName)
      const withRoom = await patientTokenRoute(jsonRequest('/x', { token: ta, room: (await session(b.id))!.roomName }))
      expect(withRoom.status).toBe(400)
    })
  })

  describe('doctor access', () => {
    it('10-12. requires the authenticated V1 doctor; admins and other practitioners are refused', async () => {
      const { id } = await confirmedNow()
      loginAs(null)
      expect((await doctorTokenRoute(jsonRequest('/x', {}), p(id))).status).toBe(401)
      loginAs(adminId, 'administrator')
      expect((await doctorTokenRoute(jsonRequest('/x', {}), p(id))).status).toBe(403)
      loginAs(otherDoctorId, 'practitioner')
      expect((await doctorTokenRoute(jsonRequest('/x', {}), p(id))).status).toBe(403)
      loginAs(doctorId)
      const res = await doctorTokenRoute(jsonRequest('/x', {}), p(id))
      expect(res.status).toBe(200)
      const claims = await verify((await res.json()).participantToken)
      expect(claims.video).toMatchObject({ roomJoin: true, room: (await session(id))!.roomName })
      expect(claims.video?.roomAdmin).toBeFalsy()
      expect(claims.sub).toBe(`doctor-${doctorId.slice(0, 8)}`)
    })

    it('doctor cannot open a room before confirmation or too early', async () => {
      loginAs(doctorId)
      const pending = await caseAt('AWAITING_DOCTOR_APPROVAL', { adminId, doctorId })
      expect((await doctorTokenRoute(jsonRequest('/x', {}), p(pending.id))).status).toBe(409)
      const { id } = await confirmedNow()
      await schedule(id, 180)
      expect((await doctorTokenRoute(jsonRequest('/x', {}), p(id))).status).toBe(425)
    })
  })

  describe('completion closes video access', () => {
    it('13. after COMPLETED: session ENDED, links revoked, no new tokens; room name not leaked', async () => {
      const { id } = await confirmedNow()
      const token = tokenOf((await mintPatientJoinLink(id))!.url)
      await db.update(consultationCases).set({ status: 'IN_CONSULTATION' }).where(eq(consultationCases.id, id))
      const { createCasePrescription } = await import('@/lib/etabib/cases')
      await createCasePrescription(id, [{ genericName: 'Synthetic', dose: '1', frequency: 'daily', substitutionAllowed: true, isControlled: false }], { type: 'DOCTOR', id: doctorId })
      const [job] = await jobsOfType('PRESCRIPTION_READY')
      const res = await outboundResultRoute(jsonRequest('/x', { jobId: job!.id, success: true, status: 'sent', wamid: 'wamid.SYN.RX.1' }, { 'x-etabib-key': HOOK_KEY }))
      const body = await res.json()
      expect(body.consultationStatus).toBe('COMPLETED')
      expect(JSON.stringify(body)).not.toMatch(/etb-[0-9a-f]{32}|videoRoomToClose/)
      expect((await session(id))!.status).toBe('ENDED')
      expect((await patientToken(token)).status).toBe(410)
      expect((await access(token)).status).toBe('ended')
      loginAs(doctorId)
      expect((await doctorTokenRoute(jsonRequest('/x', {}), p(id))).status).toBe(409)
      expect(await mintPatientJoinLink(id)).toBeNull()
      expect((await eventsFor(id)).map((e) => e.eventType)).toContain('VIDEO_SESSION_ENDED')
    })
  })

  describe('no enumeration, no legacy path, fail closed', () => {
    it('14. the legacy appointment token endpoint is retired', async () => {
      expect((await legacyVideoRoute()).status).toBe(410)
    })

    it('15. not configured: patients see a friendly status, no token is issued', async () => {
      const { id } = await confirmedNow()
      const token = tokenOf((await mintPatientJoinLink(id))!.url)
      delete process.env.LIVEKIT_API_SECRET
      expect((await access(token)).status).toBe('not_configured')
      expect((await patientToken(token)).status).toBe(503)
    })

    it('staff views: admin sees link status; doctor sees session only (no link data)', async () => {
      const { id } = await confirmedNow()
      await mintPatientJoinLink(id)
      loginAs(adminId, 'administrator')
      const admin = await (await adminDetailRoute(new NextRequest('http://x'), p(id))).json()
      expect(admin.video).toMatchObject({ status: 'CREATED', links: { generated: 1, active: 1 }, configured: true })
      loginAs(doctorId)
      const doctor = await (await doctorDetailRoute(new Request('http://x'), p(id))).json()
      expect(doctor.video).toMatchObject({ status: 'CREATED', configured: true })
      expect(doctor.video.links).toBeUndefined()
      for (const body of [admin, doctor]) expect(JSON.stringify(body)).not.toMatch(/etb-[0-9a-f]{32}|token_hash|tokenHash/)
    })
  })

  describe('WhatsApp link delivery', () => {
    it('the patient confirmation carries the app URL (never a LiveKit JWT)', async () => {
      await caseAt('CONFIRMED', { adminId, doctorId })
      process.env.ETABIB_N8N_OUTBOUND_URL = 'https://n8n.example.test/webhook/outbound'
      process.env.ETABIB_N8N_OUTBOUND_KEY = 'test-outbound-key'
      const fetchMock = vi.fn().mockResolvedValue(new Response('{}', { status: 200 }))
      vi.stubGlobal('fetch', fetchMock)
      const [job] = await jobsOfType('CONSULTATION_CONFIRMED_PATIENT')
      await dispatchOutboundJobs([job!.id])
      const payload = JSON.parse(fetchMock.mock.calls[0]![1].body)
      expect(payload.text).toMatch(/https:\/\/staging\.example\.test\/consult\/[A-Za-z0-9_-]{43}/)
      expect(payload.text).not.toMatch(/eyJ[A-Za-z0-9_-]+\./) // no JWT
      expect(payload.data).toEqual({ approvedTime: expect.any(String), hasVideoLink: true })
    })
  })

  describe('LiveKit webhooks → audit', () => {
    async function signedWebhook(body: object, secret = LK.secret) {
      const raw = JSON.stringify(body)
      const at = new AccessToken(LK.key, secret)
      at.sha256 = createHash('sha256').update(raw).digest('base64')
      return webhookRoute(new NextRequest('http://localhost/api/video/livekit-webhook', { method: 'POST', body: raw, headers: { authorization: await at.toJwt(), 'content-type': 'application/webhook+json' } }))
    }

    it('records patient/doctor join and leave; rejects unsigned/forged events', async () => {
      const { id } = await confirmedNow()
      const room = (await session(id))!.roomName
      for (const [event, identity] of [['participant_joined', 'patient-abc'], ['participant_joined', 'doctor-abc'], ['participant_left', 'patient-abc']]) {
        const res = await signedWebhook({ event, room: { name: room }, participant: { identity }, id: `EV_${identity}_${event}`, createdAt: String(Math.floor(Date.now() / 1000)) })
        expect(res.status).toBe(200)
      }
      const types = (await eventsFor(id)).map((e) => e.eventType)
      expect(types).toEqual(expect.arrayContaining(['PATIENT_VIDEO_JOINED', 'DOCTOR_VIDEO_JOINED', 'PATIENT_VIDEO_LEFT']))
      const s = (await session(id))!
      expect(s.status).toBe('IN_PROGRESS')
      expect(s.patientJoinedAt).not.toBeNull()
      expect(s.doctorJoinedAt).not.toBeNull()
      expect((await getCase(id)).status).toBe('CONFIRMED') // joining never starts the consultation
      expect((await signedWebhook({ event: 'participant_joined', room: { name: room }, participant: { identity: 'patient-x' } }, 'wrong-secret-wrong-secret-wrong-secret')).status).toBe(401)
      const unsigned = await webhookRoute(new NextRequest('http://localhost/x', { method: 'POST', body: '{"event":"participant_joined"}' }))
      expect(unsigned.status).toBe(401)
      const other = await signedWebhook({ event: 'participant_joined', room: { name: 'etb-unknown' }, participant: { identity: 'patient-x' } })
      expect((await other.json()).handled).toBe(false)
    })
  })

  describe('WhatsApp delivery receipts (statuses[])', () => {
    const statusWebhook = (statuses: object[]) =>
      whatsappHook(jsonRequest('/api/hooks/whatsapp', { object: 'whatsapp_business_account', entry: [{ id: 'SYN', changes: [{ field: 'messages', value: { messaging_product: 'whatsapp', statuses } }] }] }, { 'x-etabib-key': HOOK_KEY }))

    it('correlates by wamid, only moves forward, records failure, never creates cases', async () => {
      const { id } = await caseAt('CONFIRMED', { adminId, doctorId })
      const [job] = await jobsOfType('CONSULTATION_CONFIRMED_PATIENT')
      await applyOutboundResult({ jobId: job!.id, success: true, status: 'sent', wamid: 'wamid.SYN.LINK.1' })
      const casesBefore = (await db.select().from(consultationCases)).length
      const ts = String(Math.floor(Date.now() / 1000))
      expect((await (await statusWebhook([{ id: 'wamid.SYN.LINK.1', status: 'read', timestamp: ts }])).json()).statuses).toEqual({ received: 1, applied: 1 })
      let [row] = await db.select().from(notificationOutbox).where(eq(notificationOutbox.id, job!.id))
      expect(row).toMatchObject({ status: 'read' })
      expect(row!.readAt).not.toBeNull()
      expect(row!.deliveredAt).not.toBeNull()
      await statusWebhook([{ id: 'wamid.SYN.LINK.1', status: 'delivered', timestamp: ts }]) // out of order: ignored
      ;[row] = await db.select().from(notificationOutbox).where(eq(notificationOutbox.id, job!.id))
      expect(row!.status).toBe('read')
      await statusWebhook([{ id: 'wamid.UNKNOWN', status: 'delivered', timestamp: ts }])
      expect((await db.select().from(consultationCases)).length).toBe(casesBefore)

      const [doc] = await jobsOfType('CONSULTATION_CONFIRMED_DOCTOR')
      await applyOutboundResult({ jobId: doc!.id, success: true, status: 'sent', wamid: 'wamid.SYN.DOC.1' })
      await statusWebhook([{ id: 'wamid.SYN.DOC.1', status: 'failed', timestamp: ts, errors: [{ code: 131026, title: 'Message undeliverable' }] }])
      const [failed] = await db.select().from(notificationOutbox).where(eq(notificationOutbox.id, doc!.id))
      expect(failed).toMatchObject({ status: 'failed', lastError: '131026: Message undeliverable' })
      expect(failed!.failedAt).not.toBeNull()
      expect((await getCase(id)).status).toBe('CONFIRMED')
    })
  })
})
