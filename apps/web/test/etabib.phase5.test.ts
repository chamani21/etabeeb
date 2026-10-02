/**
 * eTabib V1 Phase 5 — Meta signature + GET verification, staff recipients/text,
 * and pending-job re-dispatch. Synthetic data only.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { createHmac } from 'crypto'
import { NextRequest } from 'next/server'

vi.mock('@/lib/auth-helpers', () => ({ getCurrentUser: vi.fn() }))

import { db } from '@etabeeb/db'
import { notificationOutbox, whatsappEvents } from '@etabeeb/db/schema'
import { eq } from 'drizzle-orm'
import { GET as whatsappVerify, POST as whatsappHook } from '@/app/api/hooks/whatsapp/route'
import { POST as outboxDispatch } from '@/app/api/hooks/outbox-dispatch/route'
import { isValidMetaSignature } from '@/lib/etabib/meta-signature'
import { dispatchOutboundJobs, dispatchPendingOutboundJobs } from '@/lib/etabib/outbound'
import { hasTestDb, HOOK_KEY, resetDb, createUser, fakePhone, metaPayload, jsonRequest, caseAt, jobsOfType } from './helpers'

const SECRET = 'synthetic-meta-app-secret'
const sign = (raw: string) => `sha256=${createHmac('sha256', SECRET).update(raw).digest('hex')}`
const keyHeader = { 'x-etabib-key': HOOK_KEY }

function rawPost(raw: string, headers: Record<string, string>) {
  return new NextRequest('http://localhost/api/hooks/whatsapp', {
    method: 'POST',
    body: raw,
    headers: { 'content-type': 'application/json', ...headers },
  })
}
const verifyReq = (qs: string, headers: Record<string, string> = keyHeader) =>
  new NextRequest(`http://localhost/api/hooks/whatsapp?${qs}`, { method: 'GET', headers })

describe('Meta signature helper', () => {
  it('accepts only the exact HMAC of the raw body', () => {
    const raw = '{"a":1}'
    expect(isValidMetaSignature(raw, sign(raw), SECRET)).toBe(true)
    expect(isValidMetaSignature(raw + ' ', sign(raw), SECRET)).toBe(false)
    expect(isValidMetaSignature(raw, null, SECRET)).toBe(false)
    expect(isValidMetaSignature(raw, 'sha256=', SECRET)).toBe(false)
    expect(isValidMetaSignature(raw, sign(raw).replace('sha256=', ''), SECRET)).toBe(false)
  })
})

describe('GET /api/hooks/whatsapp (Meta verification)', () => {
  afterEach(() => {
    delete process.env.ETABIB_META_VERIFY_TOKEN
  })
  it('returns the challenge only for the right token + mode, behind the hook key', async () => {
    process.env.ETABIB_META_VERIFY_TOKEN = 'synthetic-verify-token'
    const ok = await whatsappVerify(verifyReq('hub.mode=subscribe&hub.verify_token=synthetic-verify-token&hub.challenge=12345'))
    expect(ok.status).toBe(200)
    expect(await ok.text()).toBe('12345')
    for (const qs of [
      'hub.mode=subscribe&hub.verify_token=wrong&hub.challenge=1',
      'hub.mode=unsubscribe&hub.verify_token=synthetic-verify-token&hub.challenge=1',
      'hub.mode=subscribe&hub.verify_token=synthetic-verify-token',
      'hub.mode=subscribe&hub.challenge=1',
    ]) {
      expect((await whatsappVerify(verifyReq(qs))).status).toBe(403)
    }
    expect((await whatsappVerify(verifyReq('hub.mode=subscribe&hub.verify_token=synthetic-verify-token&hub.challenge=1', {}))).status).toBe(401)
  })
  it('fails closed when no verify token is configured', async () => {
    expect((await whatsappVerify(verifyReq('hub.mode=subscribe&hub.verify_token=&hub.challenge=1'))).status).toBe(403)
  })
})

describe('POST /api/hooks/whatsapp signature enforcement (no DB)', () => {
  afterEach(() => {
    delete process.env.ETABIB_META_APP_SECRET
  })
  it('rejects a missing or wrong signature when the app secret is configured', async () => {
    process.env.ETABIB_META_APP_SECRET = SECRET
    const raw = JSON.stringify(metaPayload('+923000000001', 'wamid.SIG.1', 'x'))
    expect((await whatsappHook(rawPost(raw, keyHeader))).status).toBe(401)
    expect((await whatsappHook(rawPost(raw, { ...keyHeader, 'x-hub-signature-256': 'sha256=deadbeef' }))).status).toBe(401)
    // signature over a different body (body altered in transit)
    expect((await whatsappHook(rawPost(raw, { ...keyHeader, 'x-hub-signature-256': sign(raw + ' ') }))).status).toBe(401)
  })
  it('rejects unsigned requests in production when the secret is unset', async () => {
    vi.stubEnv('NODE_ENV', 'production')
    try {
      const raw = JSON.stringify(metaPayload('+923000000002', 'wamid.SIG.2', 'x'))
      expect((await whatsappHook(rawPost(raw, keyHeader))).status).toBe(401)
    } finally {
      vi.unstubAllEnvs()
    }
  })
  it('accepts a status-only event with a valid signature (no DB write)', async () => {
    process.env.ETABIB_META_APP_SECRET = SECRET
    const raw = JSON.stringify({ object: 'whatsapp_business_account', entry: [{ changes: [{ value: { statuses: [{ id: 'x' }] } }] }] })
    const res = await whatsappHook(rawPost(raw, { ...keyHeader, 'x-hub-signature-256': sign(raw) }))
    expect(res.status).toBe(200)
    expect((await res.json()).processed).toBe(0)
  })
})

describe.skipIf(!hasTestDb)('Phase 5 — DB-backed', () => {
  let adminId: string
  let doctorId: string
  beforeEach(async () => {
    await resetDb()
    adminId = await createUser('Synthetic Admin')
    doctorId = await createUser('Synthetic Doctor')
    process.env.ETABIB_ADMIN_WHATSAPP = '+923009990001'
    process.env.ETABIB_DOCTOR_WHATSAPP = '+923009990002'
  })
  afterEach(() => {
    delete process.env.ETABIB_META_APP_SECRET
    delete process.env.ETABIB_ADMIN_WHATSAPP
    delete process.env.ETABIB_DOCTOR_WHATSAPP
    delete process.env.ETABIB_N8N_OUTBOUND_URL
    delete process.env.ETABIB_N8N_OUTBOUND_KEY
    vi.unstubAllGlobals()
  })

  it('a correctly signed webhook is processed once; a duplicate wamid is a no-op', async () => {
    process.env.ETABIB_META_APP_SECRET = SECRET
    const raw = JSON.stringify(metaPayload(fakePhone(), 'wamid.SIGOK.1', 'Salam'))
    const headers = { ...keyHeader, 'x-hub-signature-256': sign(raw) }
    const first = await (await whatsappHook(rawPost(raw, headers))).json()
    expect(first.processed).toBe(1)
    const second = await (await whatsappHook(rawPost(raw, headers))).json()
    expect(second.processed).toBe(0)
    expect(second.results[0].duplicate).toBe(true)
    expect(await db.select().from(whatsappEvents)).toHaveLength(1)
  })

  it('an unsigned/tampered webhook creates nothing', async () => {
    process.env.ETABIB_META_APP_SECRET = SECRET
    const raw = JSON.stringify(metaPayload(fakePhone(), 'wamid.SIGBAD.1', 'Salam'))
    expect((await whatsappHook(rawPost(raw, keyHeader))).status).toBe(401)
    expect(await db.select().from(whatsappEvents)).toHaveLength(0)
    expect(await db.select().from(notificationOutbox)).toHaveLength(0)
  })

  it('staff jobs carry a backend-resolved recipient and text; patient jobs stay Pashto', async () => {
    await caseAt('ADMIN_INTAKE', { adminId, doctorId })
    process.env.ETABIB_N8N_OUTBOUND_URL = 'https://n8n.example.test/webhook/outbound'
    process.env.ETABIB_N8N_OUTBOUND_KEY = 'test-outbound-key'
    const fetchMock = vi.fn().mockResolvedValue(new Response('{}', { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)
    const [admin] = await jobsOfType('ADMIN_NEW_CASE')
    await dispatchOutboundJobs([admin!.id])
    const payload = JSON.parse(fetchMock.mock.calls[0]![1].body)
    expect(payload.to).toBe('+923009990001')
    expect(payload.text).toContain('new consultation request')
    expect(payload.idempotencyKey).toMatch(/^etabib:ADMIN_NEW_CASE:/)
  })

  it('staff job without a configured number is sent without `to` (n8n must refuse)', async () => {
    delete process.env.ETABIB_ADMIN_WHATSAPP
    await caseAt('ADMIN_INTAKE', { adminId, doctorId })
    process.env.ETABIB_N8N_OUTBOUND_URL = 'https://n8n.example.test/webhook/outbound'
    process.env.ETABIB_N8N_OUTBOUND_KEY = 'test-outbound-key'
    const fetchMock = vi.fn().mockResolvedValue(new Response('{}', { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)
    const [admin] = await jobsOfType('ADMIN_NEW_CASE')
    await dispatchOutboundJobs([admin!.id])
    expect(JSON.parse(fetchMock.mock.calls[0]![1].body).to).toBeUndefined()
  })

  it('outbox-dispatch re-sends pending jobs once, is key-protected and bounded by attempts', async () => {
    await caseAt('ADMIN_INTAKE', { adminId, doctorId })
    expect((await outboxDispatch(jsonRequest('/api/hooks/outbox-dispatch', {}, {}))).status).toBe(401)

    // not configured → stays pending
    expect((await (await outboxDispatch(jsonRequest('/api/hooks/outbox-dispatch', {}, keyHeader))).json()).dispatched).toBe(0)

    process.env.ETABIB_N8N_OUTBOUND_URL = 'https://n8n.example.test/webhook/outbound'
    process.env.ETABIB_N8N_OUTBOUND_KEY = 'test-outbound-key'
    const fetchMock = vi.fn().mockResolvedValue(new Response('{}', { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)
    const pendingBefore = (await db.select().from(notificationOutbox)).filter((j) => j.status === 'pending').length
    expect(pendingBefore).toBeGreaterThan(0)

    // two overlapping runs never dispatch the same job twice
    await Promise.all([dispatchPendingOutboundJobs(), dispatchPendingOutboundJobs()])
    expect(fetchMock).toHaveBeenCalledTimes(pendingBefore)
    const ids = fetchMock.mock.calls.map((c) => JSON.parse(c[1].body).jobId)
    expect(new Set(ids).size).toBe(ids.length)
    // nothing pending is left, so another run sends nothing
    await dispatchPendingOutboundJobs()
    expect(fetchMock).toHaveBeenCalledTimes(pendingBefore)

    // a job at its attempt limit is not re-sent
    const [job] = await db.select().from(notificationOutbox).limit(1)
    await db.update(notificationOutbox).set({ status: 'pending', attempts: job!.maxAttempts }).where(eq(notificationOutbox.id, job!.id))
    await dispatchPendingOutboundJobs()
    expect(fetchMock).toHaveBeenCalledTimes(pendingBefore)
  })
})
