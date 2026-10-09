/**
 * Low-bandwidth calls — server guarantees (synthetic data, local test DB):
 * a dropped connection never completes or otherwise changes the consultation,
 * and a dropped participant can rejoin through the existing secure token paths
 * (same room, short-lived tokens, nothing loosened).
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'

vi.mock('@/lib/auth-helpers', () => ({ getCurrentUser: vi.fn() }))

import fs from 'fs'
import path from 'path'
import { createHash } from 'crypto'
import { AccessToken, TokenVerifier } from 'livekit-server-sdk'
import { NextRequest } from 'next/server'
import { getCurrentUser } from '@/lib/auth-helpers'
import { db } from '@etabeeb/db'
import { consultationVideoSessions } from '@etabeeb/db/schema'
import { eq } from 'drizzle-orm'
import { LIVEKIT_TOKEN_TTL_SECONDS, mintPatientJoinLink } from '@/lib/etabib/video'
import { POST as patientTokenRoute } from '@/app/api/video/patient/token/route'
import { POST as patientAccessRoute } from '@/app/api/video/patient/access/route'
import { POST as doctorTokenRoute } from '@/app/api/doctor/cases/[id]/video/token/route'
import { POST as webhookRoute } from '@/app/api/video/livekit-webhook/route'
import { caseAt, createUser, eventsFor, getCase, hasTestDb, jsonRequest, resetDb } from './helpers'

const LK = { url: 'wss://livekit.example.test', key: 'APItestkey', secret: 'test-livekit-secret-not-real-0123456789abcdef' }
type SessionUser = NonNullable<Awaited<ReturnType<typeof getCurrentUser>>>
const loginAs = (id: string) =>
  vi.mocked(getCurrentUser).mockResolvedValue({ id, role: 'practitioner', publicId: id, phone: '', displayName: 'Syn', locale: 'en', mustChangePassword: false } as SessionUser)
const session = async (caseId: string) => (await db.select().from(consultationVideoSessions).where(eq(consultationVideoSessions.consultationId, caseId)))[0]!

async function signedWebhook(body: object) {
  const raw = JSON.stringify(body)
  const at = new AccessToken(LK.key, LK.secret)
  at.sha256 = createHash('sha256').update(raw).digest('base64')
  return webhookRoute(new NextRequest('http://localhost/api/video/livekit-webhook', { method: 'POST', body: raw, headers: { authorization: await at.toJwt(), 'content-type': 'application/webhook+json' } }))
}

describe.skipIf(!hasTestDb)('low-bandwidth calls: a dropped connection is never a completed consultation', () => {
  let adminId: string
  let doctorId: string
  beforeEach(async () => {
    await resetDb()
    adminId = await createUser('Synthetic Admin')
    doctorId = await createUser('Synthetic Doctor')
    process.env.ETABIB_V1_DOCTOR_USER_ID = doctorId
    process.env.LIVEKIT_URL = LK.url
    process.env.LIVEKIT_API_KEY = LK.key
    process.env.LIVEKIT_API_SECRET = LK.secret
    process.env.NEXT_PUBLIC_APP_URL = 'https://staging.example.test'
    vi.mocked(getCurrentUser).mockReset()
  })
  afterEach(() => {
    for (const k of ['LIVEKIT_URL', 'LIVEKIT_API_KEY', 'LIVEKIT_API_SECRET', 'NEXT_PUBLIC_APP_URL']) delete process.env[k]
  })

  async function inConsultation() {
    const c = await caseAt('IN_CONSULTATION', { adminId, doctorId })
    await db.update(consultationVideoSessions).set({ scheduledAt: new Date(Date.now() - 10 * 60_000) }).where(eq(consultationVideoSessions.consultationId, c.id))
    const link = await mintPatientJoinLink(c.id)
    return { id: c.id, token: link!.url.split('/consult/')[1]! }
  }

  it('participant_left / room_finished (network drop, everyone gone) leave the case and session open', async () => {
    const { id } = await inConsultation()
    const room = (await session(id)).roomName
    for (const [event, identity] of [
      ['participant_joined', 'patient-abc'],
      ['participant_joined', 'doctor-abc'],
      ['participant_left', 'patient-abc'], // patient's phone lost signal
      ['participant_left', 'doctor-abc'],
      ['room_finished', undefined], // LiveKit closed the empty room
    ] as const) {
      const res = await signedWebhook({ event, room: { name: room }, ...(identity ? { participant: { identity } } : {}), id: `EV_${event}_${identity}`, createdAt: String(Math.floor(Date.now() / 1000)) })
      expect(res.status).toBe(200)
    }
    expect((await getCase(id)).status).toBe('IN_CONSULTATION')
    const s = await session(id)
    expect(s.status).not.toBe('ENDED')
    expect(s.endedAt).toBeNull()
    const types = (await eventsFor(id)).map((e) => e.eventType)
    expect(types).toContain('PATIENT_VIDEO_LEFT')
    expect(types).not.toContain('VIDEO_SESSION_ENDED')
    expect(types).not.toContain('CONSULTATION_COMPLETED')
  })

  it('after a drop the patient link and the doctor get fresh short-lived tokens for the same room', async () => {
    const { id, token } = await inConsultation()
    const room = (await session(id)).roomName
    const first = await (await patientTokenRoute(jsonRequest('/x', { token }))).json()
    await signedWebhook({ event: 'participant_left', room: { name: room }, participant: { identity: 'patient-abc' } })
    // retry from the "connection lost" screen: same link, new token
    const access = await (await patientAccessRoute(jsonRequest('/x', { token }))).json()
    expect(access.status).toBe('ok')
    const retry = await patientTokenRoute(jsonRequest('/x', { token }))
    expect(retry.status).toBe(200)
    const second = await retry.json()
    const claims = await new TokenVerifier(LK.key, LK.secret).verify(second.participantToken)
    expect(claims.video?.room).toBe(room)
    expect(claims.video?.roomJoin).toBe(true)
    expect(Number(claims.exp) - Number(claims.nbf ?? claims.iat ?? 0)).toBeLessThanOrEqual(LIVEKIT_TOKEN_TTL_SECONDS)
    expect(second.expiresInSeconds).toBe(LIVEKIT_TOKEN_TTL_SECONDS) // TTL unchanged (15 min)
    expect(claims.sub).toBe((await new TokenVerifier(LK.key, LK.secret).verify(first.participantToken)).sub) // same identity → replaces a stale connection
    loginAs(doctorId)
    expect((await doctorTokenRoute(jsonRequest('/x', {}), { params: { id } })).status).toBe(200)
    expect((await getCase(id)).status).toBe('IN_CONSULTATION')
  })
})

describe('call UI never changes the consultation lifecycle', () => {
  it('the call components and the patient page do not call start / complete / cancel / prescription endpoints', () => {
    const root = path.resolve(__dirname, '../src')
    const files = [
      'components/video/VideoRoom.tsx',
      'components/video/callController.ts',
      'components/video/useCallController.ts',
      'components/video/callConfig.ts',
      'components/video/networkPolicy.ts',
      'app/[locale]/consult/[token]/page.tsx',
    ]
    for (const f of files) {
      const src = fs.readFileSync(path.join(root, f), 'utf8')
      expect(src, f).not.toMatch(/\/(complete|start|cancel|prescription)\b/)
      expect(src, f).not.toMatch(/fetch\([^)]*\/api\/(doctor|admin)\//)
    }
  })
})
