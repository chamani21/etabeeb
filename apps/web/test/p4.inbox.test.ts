/**
 * Shared WhatsApp inbox: durable inbound storage, bot suppression, two-way
 * admin/doctor handover, staff replies through the existing outbox, files and
 * the 24-hour window. Synthetic data only; n8n is stubbed (fetch).
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'

vi.mock('@/lib/auth-helpers', () => ({ getCurrentUser: vi.fn() }))

import { spawnSync } from 'child_process'
import { mkdtempSync, readFileSync } from 'fs'
import { tmpdir } from 'os'
import path from 'path'
import { NextRequest } from 'next/server'
import { getCurrentUser } from '@/lib/auth-helpers'
import { db } from '@etabeeb/db'
import { consultationCases, notificationOutbox, waAttachments, waConversations, waHandoverRequests, waInternalNotes, waMessages, whatsappEvents } from '@etabeeb/db/schema'
import { and, eq, sql } from 'drizzle-orm'
import { processInboundMessage, type InboundMessage } from '@/lib/etabib/whatsapp'
import { applyOutboundResult, cancelConsultation } from '@/lib/etabib/cases'
import { dispatchOutboundJobs, enqueueOutboundJob } from '@/lib/etabib/outbound'
import { applyDeliveryStatus } from '@/lib/etabib/delivery'
import { changeOwnership } from '@/lib/etabib/inbox/ownership'
import { addNote, sendAudio, sendFile, sendText } from '@/lib/etabib/inbox/send'
import { acceptContent, requestMediaFetches, sniffType } from '@/lib/etabib/inbox/media'
import { conversationView, listConversations } from '@/lib/etabib/inbox/queries'
import { readAttachment, linkMessageToCase, updateAttachment } from '@/lib/etabib/inbox/files'
import { POST as whatsappHook } from '@/app/api/hooks/whatsapp/route'
import { POST as mediaUploadHook } from '@/app/api/hooks/wa-media/[id]/route'
import { POST as mediaFailedHook } from '@/app/api/hooks/wa-media/[id]/failed/route'
import { POST as sendRoute } from '@/app/api/inbox/conversations/[id]/messages/route'
import { GET as viewRoute } from '@/app/api/inbox/conversations/[id]/route'
import { GET as attachmentRoute } from '@/app/api/inbox/attachments/[id]/route'
import { GET as mediaRoute } from '@/app/api/media/w/[token]/[name]/route'
import { hasTestDb, resetDb, createStaffUser, fakePhone, jsonRequest, caseAt, HOOK_KEY } from './helpers'

const N8N_URL = 'https://n8n.example.test/webhook/outbound'
const MEDIA_URL = 'https://n8n.example.test/webhook/etabib-media'
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64')
const PDF = Buffer.from('%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF\n')
type SessionUser = NonNullable<Awaited<ReturnType<typeof getCurrentUser>>>
const mockUser = vi.mocked(getCurrentUser)
const login = (id: string | null, role: string) =>
  mockUser.mockResolvedValue(id ? ({ id, role, publicId: id, phone: '', displayName: 'Syn', locale: 'en', mustChangePassword: false } as SessionUser) : null)
const hasFfmpeg = spawnSync(process.env.FFMPEG_PATH || 'ffmpeg', ['-version']).status === 0

let seq = 0
function msg(from: string, text: string | null, extra: Partial<InboundMessage> = {}): InboundMessage {
  seq += 1
  return { wamid: `wamid.INBOX.${Date.now()}.${seq}`, from, type: 'text', text, providerTimestamp: new Date(), ...extra }
}
const key = () => `k${Date.now()}${Math.random().toString(36).slice(2, 10)}`

describe.skipIf(!hasTestDb)('shared WhatsApp inbox', () => {
  let admin: { id: string }
  let admin2: { id: string }
  let doctor: { id: string }
  let fetchMock: ReturnType<typeof vi.fn>
  const n8nBodies = () => fetchMock.mock.calls.filter((c) => String(c[0]) === N8N_URL).map((c) => JSON.parse(c[1].body))
  const A = () => ({ id: admin.id, role: 'ADMIN' as const })
  const A2 = () => ({ id: admin2.id, role: 'ADMIN' as const })
  const D = () => ({ id: doctor.id, role: 'DOCTOR' as const })
  const conv = async (phone: string) => (await db.select().from(waConversations).where(eq(waConversations.contactPhone, phone)))[0]!
  const messagesOf = async (convId: string) => db.select().from(waMessages).where(eq(waMessages.conversationId, convId))
  const jobsOf = async (type: string) => db.select().from(notificationOutbox).where(eq(notificationOutbox.templateKey, type))

  /** A contact that has written (window open) and been taken over by admin. */
  async function adminOwned(phone = fakePhone(), opts: { intake?: boolean } = {}) {
    await processInboundMessage(msg(phone, 'Salam'))
    if (opts.intake) {
      await processInboundMessage(msg(phone, 'Synthetic Patient'))
      await processInboundMessage(msg(phone, '03001234567')) // → ADMIN_INTAKE (cancellable)
    }
    const c = await conv(phone)
    await changeOwnership(c.id, A(), { action: 'take_over', expectedVersion: c.ownerVersion })
    return { phone, c: await conv(phone) }
  }
  async function doctorOwned() {
    const { phone, c } = await adminOwned()
    await changeOwnership(c.id, A(), { action: 'request_doctor', expectedVersion: c.ownerVersion, summary: 'SYN: please review the report' })
    await changeOwnership(c.id, D(), { action: 'accept', expectedVersion: c.ownerVersion })
    return { phone, c: await conv(phone) }
  }

  beforeEach(async () => {
    await resetDb()
    admin = await createStaffUser('administrator')
    admin2 = await createStaffUser('administrator')
    doctor = await createStaffUser('practitioner')
    Object.assign(process.env, {
      ETABIB_INBOX_ENABLED: 'true',
      ETABIB_V1_DOCTOR_USER_ID: doctor.id,
      ETABIB_ADMIN_WHATSAPP: '+923009990001',
      ETABIB_DOCTOR_WHATSAPP: '+923009990002',
      ETABIB_N8N_OUTBOUND_URL: N8N_URL,
      ETABIB_N8N_OUTBOUND_KEY: 'test-outbound-key',
      ETABIB_N8N_MEDIA_URL: MEDIA_URL,
      NEXT_PUBLIC_APP_URL: 'https://staging.example.test',
    })
    fetchMock = vi.fn().mockResolvedValue(new Response('{}', { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)
    mockUser.mockReset()
  })
  afterEach(() => {
    vi.unstubAllGlobals()
    for (const k of ['ETABIB_INBOX_ENABLED', 'ETABIB_N8N_OUTBOUND_URL', 'ETABIB_N8N_OUTBOUND_KEY', 'ETABIB_N8N_MEDIA_URL', 'NEXT_PUBLIC_APP_URL']) delete process.env[k]
  })

  // ------------------------------------------------------------------
  describe('feature flag', () => {
    it('disabled: nothing is stored, the bot behaves exactly as before, the inbox API answers 404', async () => {
      delete process.env.ETABIB_INBOX_ENABLED
      const phone = fakePhone()
      const r = await processInboundMessage(msg(phone, 'Salam'))
      expect(r.outcome).toBe('asked_name')
      expect(await db.select().from(waConversations)).toHaveLength(0)
      expect(await db.select().from(waMessages)).toHaveLength(0)
      login(admin.id, 'administrator')
      const res = await viewRoute(new NextRequest('http://localhost/api/inbox/conversations/x'), { params: { id: '00000000-0000-0000-0000-000000000000' } })
      expect(res.status).toBe(404)
    })
  })

  // ------------------------------------------------------------------
  describe('inbound storage', () => {
    it('a patient text is stored once despite webhook replay (route, same wamid)', async () => {
      const phone = fakePhone()
      const body = {
        object: 'whatsapp_business_account',
        entry: [{ id: 'W', changes: [{ field: 'messages', value: { messaging_product: 'whatsapp', metadata: { phone_number_id: '111' }, contacts: [{ wa_id: phone.slice(1), profile: { name: 'Syn Contact' } }], messages: [{ from: phone.slice(1), id: 'wamid.REPLAY.1', timestamp: String(Math.floor(Date.now() / 1000)), type: 'text', text: { body: 'سلام' } }] } }] }],
      }
      for (let i = 0; i < 3; i++) {
        const res = await whatsappHook(jsonRequest('/api/hooks/whatsapp', body, { 'x-etabib-key': HOOK_KEY }))
        expect(res.status).toBe(200)
      }
      const c = await conv(phone)
      const inbound = (await messagesOf(c.id)).filter((m) => m.direction === 'IN')
      expect(inbound).toHaveLength(1)
      expect(inbound[0]!.body).toBe('سلام')
      expect(inbound[0]!.businessPhoneNumberId).toBe('111')
      expect(c.profileName).toBe('Syn Contact')
      expect(c.lastPatientMessageAt).not.toBeNull()
    })

    it('the bot reply is captured in the conversation when it is sent (text as built)', async () => {
      const phone = fakePhone()
      const r = await processInboundMessage(msg(phone, 'Salam'))
      await dispatchOutboundJobs(r.jobs.map((j) => j.id))
      const out = (await messagesOf((await conv(phone)).id)).filter((m) => m.direction === 'OUT')
      expect(out).toHaveLength(1)
      expect(out[0]!.senderRole).toBe('BOT')
      expect(out[0]!.body).toBe(n8nBodies()[0].text)
    })

    it('a shared family number is never guessed onto a case: no open case → "case association needed"', async () => {
      const { phone, c } = await adminOwned(fakePhone(), { intake: true })
      const [open] = await db.select().from(consultationCases).where(eq(consultationCases.whatsappPhone, phone))
      await cancelConsultation(open!.id, { reason: 'PATIENT_REQUESTED' }, { type: 'ADMIN', id: admin.id })
      const r = await processInboundMessage(msg(phone, 'This is about my mother'))
      expect(r.outcome).toBe('staff_owned')
      const m = (await messagesOf(c.id)).find((x) => x.body === 'This is about my mother')!
      expect(m.caseLink).toBe('NEEDED')
      expect(m.caseId).toBeNull()
      // No new case was created for a staff-owned conversation
      expect(await db.select().from(consultationCases).where(eq(consultationCases.whatsappPhone, phone))).toHaveLength(1)
      await linkMessageToCase(A(), m.id, open!.id)
      const [linked] = await db.select().from(waMessages).where(eq(waMessages.id, m.id))
      expect(linked!.caseLink).toBe('MANUAL')
      // A case of another contact can never be linked
      const other = await caseAt('ADMIN_INTAKE', { adminId: admin.id, doctorId: doctor.id })
      await expect(linkMessageToCase(A(), m.id, other.id)).rejects.toMatchObject({ code: 'validation_error' })
    })
  })

  // ------------------------------------------------------------------
  describe('bot suppression', () => {
    it('admin takeover silences the bot for that conversation only, and withdraws its queued reply', async () => {
      const a = fakePhone()
      const b = fakePhone()
      const first = await processInboundMessage(msg(a, 'Salam')) // ASK_PATIENT_NAME queued, not yet sent
      const ca = await conv(a)
      await changeOwnership(ca.id, A(), { action: 'take_over', expectedVersion: ca.ownerVersion })
      const [askJob] = await db.select().from(notificationOutbox).where(eq(notificationOutbox.id, first.jobs[0]!.id))
      expect(askJob!.status).toBe('cancelled')
      const r = await processInboundMessage(msg(a, 'Synthetic Name'))
      expect(r.outcome).toBe('staff_owned')
      expect(r.jobs).toHaveLength(0)
      const other = await processInboundMessage(msg(b, 'Salam'))
      expect(other.outcome).toBe('asked_name')
    })

    it('a bot reply generated before the transfer is stopped at dispatch', async () => {
      const { phone, c } = await adminOwned()
      const [kase] = await db.select().from(consultationCases).where(eq(consultationCases.whatsappPhone, phone))
      const job = await db.transaction((tx) => enqueueOutboundJob(tx, { type: 'PATIENT_CASE_IN_PROGRESS', consultationId: kase!.id, dedupeKey: 'late', recipientPhone: phone }))
      const [res] = await dispatchOutboundJobs([job.id])
      expect(res!.reason).toBe('staff_owned')
      expect(n8nBodies().filter((b) => b.type === 'PATIENT_CASE_IN_PROGRESS')).toHaveLength(0)
      void c
    })

    it('return to bot is refused while an open consultation needs resolution (explains + names the case)', async () => {
      const { c, phone } = await adminOwned(fakePhone(), { intake: true }) // ADMIN_INTAKE
      const [kase] = await db.select().from(consultationCases).where(eq(consultationCases.whatsappPhone, phone))
      await expect(changeOwnership(c.id, A(), { action: 'resume_bot', expectedVersion: c.ownerVersion })).rejects.toMatchObject({ code: 'bot_resume_blocked' })
      const v = await conversationView(A(), c.id)
      expect(v.resumeBlocker).toMatchObject({ caseId: kase!.id })
      expect((await conv(phone)).owner).toBe('ADMIN')
    })

    it('return to bot: nothing happens until the next patient message, which starts a NEW intake once (old case kept)', async () => {
      const { c, phone } = await adminOwned(fakePhone(), { intake: true })
      const [old] = await db.select().from(consultationCases).where(eq(consultationCases.whatsappPhone, phone))
      await cancelConsultation(old!.id, { reason: 'PATIENT_REQUESTED' }, { type: 'ADMIN', id: admin.id })
      const jobsBefore = (await db.select().from(notificationOutbox)).length
      await changeOwnership(c.id, A(), { action: 'resume_bot', expectedVersion: c.ownerVersion })
      expect((await conv(phone)).owner).toBe('BOT')
      expect((await conv(phone)).botResetAt).not.toBeNull()
      expect((await db.select().from(notificationOutbox)).length).toBe(jobsBefore) // no case, no notice, no intake message yet
      expect(await db.select().from(consultationCases).where(eq(consultationCases.whatsappPhone, phone))).toHaveLength(1)
      const later = (s: number) => new Date(Date.now() + s * 1000)
      const first = await processInboundMessage(msg(phone, 'Salam again', { providerTimestamp: later(2) }))
      expect(first.outcome).toBe('asked_name')
      const cases = await db.select().from(consultationCases).where(eq(consultationCases.whatsappPhone, phone))
      expect(cases).toHaveLength(2)
      expect(first.consultationId).not.toBe(old!.id)
      await processInboundMessage(msg(phone, 'Synthetic Second', { providerTimestamp: later(3) }))
      const third = await processInboundMessage(msg(phone, '03001234567', { providerTimestamp: later(4) }))
      expect(third.outcome).toBe('phone_saved_admin_intake')
      expect(third.consultationId).toBe(first.consultationId) // one case for the whole intake
      const adminJobs = (await jobsOf('ADMIN_NEW_CASE')).filter((j) => (j.templateVariables ?? '').includes(first.consultationId!))
      expect(adminJobs).toHaveLength(1)
      // Old case and its history untouched
      const [oldAfter] = await db.select().from(consultationCases).where(eq(consultationCases.id, old!.id))
      expect(oldAfter!.status).toBe('CANCELLED')
    })

    it('reset with an empty NEW case: the first message is not taken as the name; webhook replays and pre-reset messages never drive intake', async () => {
      const { c, phone } = await adminOwned() // case NEW, no name
      const preReset = msg(phone, 'sent before reset', { providerTimestamp: new Date(Date.now() - 60_000) })
      await changeOwnership(c.id, A(), { action: 'resume_bot', expectedVersion: c.ownerVersion })
      const late = await processInboundMessage(preReset) // delivered late, sent before the reset
      expect(late.outcome).toBe('before_reset')
      expect(late.jobs).toHaveLength(0)
      const next = msg(phone, 'Salam', { providerTimestamp: new Date(Date.now() + 2000) })
      const r1 = await processInboundMessage(next)
      expect(r1.outcome).toBe('asked_name') // greeting is not saved as the name
      const replay = await processInboundMessage(next)
      expect(replay.duplicate).toBe(true)
      const r2 = await processInboundMessage(msg(phone, 'Synthetic Restart', { providerTimestamp: new Date(Date.now() + 3000) }))
      expect(r2.outcome).toBe('name_saved_asked_phone')
      expect(r2.consultationId).toBe(r1.consultationId)
      const [kase] = await db.select().from(consultationCases).where(eq(consultationCases.id, r1.consultationId!))
      expect(kase!.patientName).toBe('Synthetic Restart')
      expect(await db.select().from(consultationCases).where(eq(consultationCases.whatsappPhone, phone))).toHaveLength(1)
    })

    it('a photo as the first message after reset is kept on the NEW intake and the name is asked', async () => {
      const { c, phone } = await adminOwned()
      await changeOwnership(c.id, A(), { action: 'resume_bot', expectedVersion: c.ownerVersion })
      const r = await processInboundMessage(msg(phone, null, { type: 'image', providerTimestamp: new Date(Date.now() + 2000), media: { id: 'MEDIA.RESET.1', mimeType: 'image/jpeg', filename: null, caption: null } }))
      expect(r.outcome).toBe('asked_name')
      const [att] = await db.select().from(waAttachments).where(eq(waAttachments.providerMediaId, 'MEDIA.RESET.1'))
      expect(att!.caseId).toBe(r.consultationId)
      expect(r.mediaFetchIds).toHaveLength(1)
    })
  })

  // ------------------------------------------------------------------
  describe('handover', () => {
    it('pending request keeps the admin responsible; the doctor cannot send until accepting', async () => {
      const { c } = await adminOwned()
      await changeOwnership(c.id, A(), { action: 'request_doctor', expectedVersion: c.ownerVersion, summary: 'SYN summary' })
      const after = await conv(c.contactPhone)
      expect(after.owner).toBe('ADMIN')
      expect(after.ownerVersion).toBe(c.ownerVersion)
      await expect(sendText(c.id, D(), { body: 'hi', clientRequestKey: key(), expectedVersion: after.ownerVersion })).rejects.toMatchObject({ code: 'not_owner' })
      const ok = await sendText(c.id, A(), { body: 'Admin still here', clientRequestKey: key(), expectedVersion: after.ownerVersion })
      expect(ok.jobId).toBeTruthy()
      // No patient notice for a pending request (the doctor has not joined)
      expect(await jobsOf('INBOX_NOTICE')).toHaveLength(1) // only the takeover notice
    })

    it('acceptance transfers to the doctor (one Pashto notice); admin loses send permission', async () => {
      const { c } = await doctorOwned()
      expect(c.owner).toBe('DOCTOR')
      expect(c.ownerUserId).toBe(doctor.id)
      const notices = await jobsOf('INBOX_NOTICE')
      expect(notices).toHaveLength(2) // takeover + doctor joined, one per transition
      await expect(sendText(c.id, A(), { body: 'x', clientRequestKey: key(), expectedVersion: c.ownerVersion })).rejects.toMatchObject({ code: 'not_owner' })
      const r = await sendText(c.id, D(), { body: 'Doctor reply', clientRequestKey: key(), expectedVersion: c.ownerVersion })
      await dispatchOutboundJobs([r.jobId!])
      const sent = n8nBodies().find((b) => b.type === 'INBOX_TEXT')
      expect(sent).toMatchObject({ messageKind: 'text', text: 'Doctor reply', to: c.contactPhone, audience: 'PATIENT' })
    })

    it('decline and cancel keep the admin responsible', async () => {
      const { c } = await adminOwned()
      await changeOwnership(c.id, A(), { action: 'request_doctor', expectedVersion: c.ownerVersion, summary: 'SYN' })
      await expect(changeOwnership(c.id, D(), { action: 'decline', expectedVersion: c.ownerVersion })).rejects.toMatchObject({ code: 'validation_error' })
      await changeOwnership(c.id, D(), { action: 'decline', expectedVersion: c.ownerVersion, reason: 'Needs in-person exam' })
      let now = await conv(c.contactPhone)
      expect(now.owner).toBe('ADMIN')
      expect(now.ownerUserId).toBe(admin.id)
      await changeOwnership(c.id, A(), { action: 'request_doctor', expectedVersion: now.ownerVersion, summary: 'SYN again' })
      await changeOwnership(c.id, A(), { action: 'cancel_request', expectedVersion: now.ownerVersion })
      now = await conv(c.contactPhone)
      expect(now.owner).toBe('ADMIN')
      const reqs = await db.select().from(waHandoverRequests).where(eq(waHandoverRequests.conversationId, c.id))
      expect(reqs.map((r) => r.status).sort()).toEqual(['CANCELLED', 'DECLINED'])
      const notes = await db.select().from(waInternalNotes).where(eq(waInternalNotes.conversationId, c.id))
      expect(notes.some((n) => n.body.includes('Needs in-person exam'))).toBe(true)
    })

    it('return to admin preserves history and files and removes the doctor’s send permission', async () => {
      const { c } = await doctorOwned()
      await processInboundMessage(msg(c.contactPhone, null, { type: 'image', media: { id: 'MEDIA.RET.1', mimeType: 'image/png', filename: null, caption: 'report' } }))
      const before = (await messagesOf(c.id)).length
      await changeOwnership(c.id, D(), { action: 'return_to_admin', expectedVersion: c.ownerVersion, instruction: 'Arrange follow-up payment' })
      const now = await conv(c.contactPhone)
      expect(now.owner).toBe('ADMIN')
      expect(now.ownerUserId).toBe(admin.id) // the admin who requested the doctor
      expect((await messagesOf(c.id)).length).toBeGreaterThanOrEqual(before) // nothing removed
      expect(await db.select().from(waAttachments).where(eq(waAttachments.conversationId, c.id))).toHaveLength(1)
      await expect(sendText(c.id, D(), { body: 'x', clientRequestKey: key(), expectedVersion: now.ownerVersion })).rejects.toMatchObject({ code: 'not_owner' })
    })

    it('two tabs cannot both accept, and a stale screen cannot send', async () => {
      const { c } = await adminOwned()
      await changeOwnership(c.id, A(), { action: 'request_doctor', expectedVersion: c.ownerVersion, summary: 'SYN' })
      const results = await Promise.allSettled([
        changeOwnership(c.id, D(), { action: 'accept', expectedVersion: c.ownerVersion }),
        changeOwnership(c.id, D(), { action: 'accept', expectedVersion: c.ownerVersion }),
      ])
      expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1)
      expect(results.filter((r) => r.status === 'rejected')).toHaveLength(1)
      // The doctor's tab with the old version cannot send
      await expect(sendText(c.id, D(), { body: 'stale', clientRequestKey: key(), expectedVersion: c.ownerVersion })).rejects.toMatchObject({ code: 'ownership_conflict' })
      // Two admins taking back at once: one wins
      const now = await conv(c.contactPhone)
      const back = await Promise.allSettled([
        changeOwnership(c.id, A(), { action: 'take_back', expectedVersion: now.ownerVersion }),
        changeOwnership(c.id, A2(), { action: 'take_back', expectedVersion: now.ownerVersion }),
      ])
      expect(back.filter((r) => r.status === 'fulfilled')).toHaveLength(1)
    })

    it('a reply queued before a handover is never sent afterwards', async () => {
      const { c } = await adminOwned()
      const queued = await sendText(c.id, A(), { body: 'queued before transfer', clientRequestKey: key(), expectedVersion: c.ownerVersion })
      await changeOwnership(c.id, A(), { action: 'request_doctor', expectedVersion: c.ownerVersion, summary: 'SYN' })
      await changeOwnership(c.id, D(), { action: 'accept', expectedVersion: c.ownerVersion })
      const [job] = await db.select().from(notificationOutbox).where(eq(notificationOutbox.id, queued.jobId!))
      expect(job!.status).toBe('cancelled')
      const [res] = await dispatchOutboundJobs([queued.jobId!])
      expect(res!.dispatched).toBe(false)
      expect(n8nBodies().some((b) => b.text === 'queued before transfer')).toBe(false)
    })
  })

  // ------------------------------------------------------------------
  describe('staff WhatsApp notices', () => {
    it('handover request notifies the doctor, return notifies the admin: link only, staff numbers, once each', async () => {
      const { c } = await adminOwned()
      await changeOwnership(c.id, A(), { action: 'request_doctor', expectedVersion: c.ownerVersion, summary: 'SYN confidential summary text' })
      const [req] = await jobsOf('STAFF_HANDOVER_REQUEST')
      expect(req).toBeTruthy()
      await dispatchOutboundJobs([req!.id])
      const toDoctor = n8nBodies().find((b) => b.type === 'STAFF_HANDOVER_REQUEST')
      expect(toDoctor).toMatchObject({ audience: 'DOCTOR', to: '+923009990002', messageKind: 'text' })
      expect(toDoctor.text).toContain(`/doctor/inbox?c=${c.id}`)
      expect(toDoctor.text).not.toContain('confidential summary') // summary stays in the dashboard
      await changeOwnership(c.id, D(), { action: 'accept', expectedVersion: c.ownerVersion })
      const now = await conv(c.contactPhone)
      await changeOwnership(c.id, D(), { action: 'return_to_admin', expectedVersion: now.ownerVersion, instruction: 'SYN follow-up' })
      const [ret] = await jobsOf('STAFF_HANDOVER_RETURNED')
      await dispatchOutboundJobs([ret!.id])
      const toAdmin = n8nBodies().find((b) => b.type === 'STAFF_HANDOVER_RETURNED')
      expect(toAdmin).toMatchObject({ audience: 'ADMIN', to: '+923009990001', messageKind: 'text' })
      expect(toAdmin.text).toContain(`/admin/inbox?c=${c.id}`)
      // Staff ownership never suppresses staff notices; replaying a dispatch sends nothing twice
      await dispatchOutboundJobs([req!.id, ret!.id])
      expect(n8nBodies().filter((b) => b.type.startsWith('STAFF_HANDOVER'))).toHaveLength(2)
      expect(await jobsOf('STAFF_HANDOVER_REQUEST')).toHaveLength(1)
      expect(await jobsOf('STAFF_HANDOVER_RETURNED')).toHaveLength(1)
    })

    it('existing staff notices still go out while staff own the conversation', async () => {
      const phone = fakePhone()
      await processInboundMessage(msg(phone, 'Salam'))
      await processInboundMessage(msg(phone, 'Synthetic Patient'))
      const r = await processInboundMessage(msg(phone, '03001234567')) // → ADMIN_INTAKE + ADMIN_NEW_CASE
      const c = await conv(phone)
      await changeOwnership(c.id, A(), { action: 'take_over', expectedVersion: c.ownerVersion })
      const adminJob = r.jobs.find((j) => j.type === 'ADMIN_NEW_CASE')!
      const [res] = await dispatchOutboundJobs([adminJob.id])
      expect(res!.dispatched).toBe(true)
      expect(n8nBodies().find((b) => b.type === 'ADMIN_NEW_CASE')).toMatchObject({ audience: 'ADMIN', to: '+923009990001' })
    })
  })

  // ------------------------------------------------------------------
  describe('sending', () => {
    it('internal notes never enter the WhatsApp outbox', async () => {
      const { c } = await adminOwned()
      const before = (await db.select().from(notificationOutbox)).length
      await addNote(c.id, A(), { body: 'SYN private note: patient anxious' })
      await addNote(c.id, D(), { body: 'SYN doctor note' }).catch(() => undefined) // doctor may not even see it
      const rows = await db.select().from(notificationOutbox)
      expect(rows.length).toBe(before)
      expect(rows.some((r) => (r.templateVariables ?? '').includes('patient anxious'))).toBe(false)
    })

    it('double tap and worker retry do not duplicate a message', async () => {
      const { c } = await adminOwned()
      const k = key()
      const [a, b] = await Promise.all([
        sendText(c.id, A(), { body: 'once', clientRequestKey: k, expectedVersion: c.ownerVersion }).catch((e) => e),
        sendText(c.id, A(), { body: 'once', clientRequestKey: k, expectedVersion: c.ownerVersion }).catch((e) => e),
      ])
      const third = await sendText(c.id, A(), { body: 'once', clientRequestKey: k, expectedVersion: c.ownerVersion })
      expect(third.duplicate).toBe(true)
      void a
      void b
      expect((await messagesOf(c.id)).filter((m) => m.body === 'once')).toHaveLength(1)
      expect(await jobsOf('INBOX_TEXT')).toHaveLength(1)
      const jobId = third.jobId!
      const [r1, r2] = await Promise.all([dispatchOutboundJobs([jobId]), dispatchOutboundJobs([jobId])])
      expect([r1[0]!.dispatched, r2[0]!.dispatched].filter(Boolean)).toHaveLength(1)
      expect(n8nBodies().filter((x) => x.text === 'once')).toHaveLength(1)
    })

    it('an expired 24-hour window blocks free-form text (at send and at dispatch)', async () => {
      const { c } = await adminOwned()
      const queued = await sendText(c.id, A(), { body: 'late', clientRequestKey: key(), expectedVersion: c.ownerVersion })
      await db.update(waConversations).set({ lastPatientMessageAt: new Date(Date.now() - 25 * 3600_000) }).where(eq(waConversations.id, c.id))
      await expect(sendText(c.id, A(), { body: 'x', clientRequestKey: key(), expectedVersion: c.ownerVersion })).rejects.toMatchObject({ code: 'window_closed' })
      const [res] = await dispatchOutboundJobs([queued.jobId!])
      expect(res!.reason).toBe('window_closed')
      const [job] = await db.select().from(notificationOutbox).where(eq(notificationOutbox.id, queued.jobId!))
      expect(job!.status).toBe('failed')
      // A new patient message reopens it (provider timestamp)
      await processInboundMessage(msg(c.contactPhone, 'back again'))
      await expect(sendText(c.id, A(), { body: 'ok now', clientRequestKey: key(), expectedVersion: c.ownerVersion })).resolves.toBeTruthy()
    })

    it('delivery statuses are shown from the outbox and never regress', async () => {
      const { c } = await adminOwned()
      const r = await sendText(c.id, A(), { body: 'status test', clientRequestKey: key(), expectedVersion: c.ownerVersion })
      await dispatchOutboundJobs([r.jobId!])
      await applyOutboundResult({ jobId: r.jobId!, success: true, status: 'sent', wamid: 'wamid.OUT.STATUS' })
      await applyDeliveryStatus({ wamid: 'wamid.OUT.STATUS', status: 'read', at: new Date(), error: null })
      await applyDeliveryStatus({ wamid: 'wamid.OUT.STATUS', status: 'delivered', at: new Date(), error: null })
      const v = await conversationView(A(), c.id)
      expect(v.messages.find((m) => m.body === 'status test')!.status).toBe('read')
    })

    it('cancelling the case does not withdraw a queued chat reply', async () => {
      const { phone, c } = await adminOwned(fakePhone(), { intake: true })
      const r = await sendText(c.id, A(), { body: 'still deliver', clientRequestKey: key(), expectedVersion: c.ownerVersion })
      const [kase] = await db.select().from(consultationCases).where(eq(consultationCases.whatsappPhone, phone))
      await cancelConsultation(kase!.id, { reason: 'PATIENT_REQUESTED' }, { type: 'ADMIN', id: admin.id })
      const [job] = await db.select().from(notificationOutbox).where(eq(notificationOutbox.id, r.jobId!))
      expect(job!.status).toBe('pending')
    })

    it('staff photo/PDF: content is sniffed; an executable renamed .pdf is rejected', async () => {
      const { c } = await adminOwned()
      const exe = Buffer.concat([Buffer.from('MZ'), Buffer.alloc(64)])
      await expect(sendFile(c.id, A(), { data: exe, mimeType: 'application/pdf', filename: 'x.pdf', caption: null, clientRequestKey: key(), expectedVersion: c.ownerVersion })).rejects.toMatchObject({ code: 'invalid_file' })
      const img = await sendFile(c.id, A(), { data: PNG, mimeType: 'image/png', filename: 'scan.png', caption: 'Your lab request', clientRequestKey: key(), expectedVersion: c.ownerVersion })
      const pdf = await sendFile(c.id, A(), { data: PDF, mimeType: 'application/pdf', filename: 'advice.pdf', caption: null, clientRequestKey: key(), expectedVersion: c.ownerVersion })
      await dispatchOutboundJobs([img.jobId!, pdf.jobId!])
      const bodies = n8nBodies()
      const image = bodies.find((b) => b.type === 'INBOX_IMAGE')
      const doc = bodies.find((b) => b.type === 'INBOX_DOCUMENT')
      expect(image).toMatchObject({ messageKind: 'image', media: { caption: 'Your lab request' } })
      expect(doc).toMatchObject({ messageKind: 'document', media: { filename: 'eTabeeb-document.pdf' } })
      // WhatsApp fetches the staff file through a signed link
      const token = String(image.media.link).split('/api/media/w/')[1]!.split('/')[0]!
      const served = await mediaRoute(new NextRequest(image.media.link), { params: { token: token!, name: 'file' } })
      expect(served.status).toBe(200)
      expect(served.headers.get('content-type')).toBe('image/png')
    })

    it.skipIf(!hasFfmpeg)('recorded audio is converted to OGG/Opus and sent as a voice note', async () => {
      const { c } = await adminOwned()
      const dir = mkdtempSync(path.join(tmpdir(), 'inbox-voice-'))
      const out = path.join(dir, 'rec.webm')
      spawnSync(process.env.FFMPEG_PATH || 'ffmpeg', ['-hide_banner', '-loglevel', 'error', '-f', 'lavfi', '-i', 'sine=frequency=440:duration=2', '-c:a', 'libopus', out])
      const r = await sendAudio(c.id, A(), { data: readFileSync(out), mimeType: 'audio/webm;codecs=opus', clientRequestKey: key(), expectedVersion: c.ownerVersion })
      const [att] = await db.select().from(waAttachments).where(eq(waAttachments.messageId, r.messageId))
      expect(att!.deliveryKey).toMatch(/\.ogg$/)
      expect(att!.durationMs).toBeGreaterThan(1500)
      await dispatchOutboundJobs([r.jobId!])
      expect(n8nBodies().find((b) => b.type === 'INBOX_AUDIO')).toMatchObject({ messageKind: 'audio', media: { voice: true } })
    })
  })

  // ------------------------------------------------------------------
  describe('patient files', () => {
    it('a report is stored once (replayed webhook + repeated upload) and visible to authorized staff', async () => {
      const phone = fakePhone()
      const image = (wamid: string) => msg(phone, null, { wamid, type: 'document', media: { id: 'MEDIA.REPORT.1', mimeType: 'application/pdf', filename: 'Lab Report – Ahmad.pdf', caption: null } })
      const r1 = await processInboundMessage(image('wamid.FILE.1'))
      await processInboundMessage(image('wamid.FILE.1')) // replay
      expect(r1.mediaFetchIds).toHaveLength(1)
      const attId = r1.mediaFetchIds![0]!
      await requestMediaFetches([attId])
      const req = fetchMock.mock.calls.find((call) => String(call[0]) === MEDIA_URL)
      expect(JSON.parse(req![1].body)).toMatchObject({ attachment_id: attId, media_id: 'MEDIA.REPORT.1', upload_url: `https://staging.example.test/api/hooks/wa-media/${attId}` })
      const upload = () => {
        const form = new FormData()
        form.append('file', new Blob([PDF]), 'x')
        form.append('mime_type', 'application/pdf')
        return mediaUploadHook(new NextRequest(`http://localhost/api/hooks/wa-media/${attId}`, { method: 'POST', body: form, headers: { 'x-etabib-key': HOOK_KEY } }), { params: { id: attId } })
      }
      expect((await upload()).status).toBe(200)
      expect(await (await upload()).json()).toMatchObject({ already: true })
      const atts = await db.select().from(waAttachments)
      expect(atts).toHaveLength(1)
      expect(atts[0]!.fetchStatus).toBe('STORED')
      expect(atts[0]!.storageKey).not.toContain('Ahmad') // patient names never in keys/URLs
      const file = await readAttachment(A(), attId)
      expect(file.contentType).toBe('application/pdf')
      expect(file.filename).not.toContain('Ahmad')
      // Patient uploads are never reachable through the public signed media route
      const { signMediaToken } = await import('@/lib/etabib/media-links')
      const res = await mediaRoute(new NextRequest('http://localhost/x'), { params: { token: signMediaToken({ kind: 'wa-att', id: attId }), name: 'file' } })
      expect(res.status).toBe(404)
    })

    it('unauthorized and cross-case access is denied', async () => {
      const { c } = await adminOwned()
      const r = await processInboundMessage(msg(c.contactPhone, null, { type: 'image', media: { id: 'MEDIA.PRIV.1', mimeType: 'image/png', filename: null, caption: null } }))
      const attId = r.mediaFetchIds![0]!
      const form = new FormData()
      form.append('file', new Blob([PNG]), 'x')
      const up = await mediaUploadHook(new NextRequest(`http://localhost/api/hooks/wa-media/${attId}`, { method: 'POST', body: form, headers: { 'x-etabib-key': HOOK_KEY } }), { params: { id: attId } })
      expect(await up.json()).toMatchObject({ success: true })
      // The doctor has no involvement with this contact yet → 404 (no existence leak)
      await expect(readAttachment(D(), attId)).rejects.toMatchObject({ code: 'not_found' })
      login(null, 'administrator')
      expect((await attachmentRoute(new NextRequest(`http://localhost/api/inbox/attachments/${attId}`), { params: { id: attId } })).status).toBe(401)
      login(doctor.id, 'practitioner')
      expect((await attachmentRoute(new NextRequest(`http://localhost/api/inbox/attachments/${attId}`), { params: { id: attId } })).status).toBe(404)
      login(admin.id, 'administrator')
      const ok = await attachmentRoute(new NextRequest(`http://localhost/api/inbox/attachments/${attId}`), { params: { id: attId } })
      expect(ok.status).toBe(200)
      expect(ok.headers.get('cache-control')).toContain('no-store')
      // Linking a file to another contact's case is refused
      const other = await caseAt('ADMIN_INTAKE', { adminId: admin.id, doctorId: doctor.id })
      await expect(updateAttachment(A(), attId, { caseId: other.id })).rejects.toMatchObject({ code: 'validation_error' })
      // The upload hook needs the shared key
      const bad = await mediaUploadHook(new NextRequest(`http://localhost/api/hooks/wa-media/${attId}`, { method: 'POST', body: new FormData() }), { params: { id: attId } })
      expect(bad.status).toBe(401)
    })

    it('flag for review (admin) and mark reviewed (doctor) are separate, attributed actions', async () => {
      const { c } = await adminOwned()
      const r = await processInboundMessage(msg(c.contactPhone, null, { type: 'image', media: { id: 'MEDIA.FLAG.1', mimeType: 'image/jpeg', filename: null, caption: null } }))
      const attId = r.mediaFetchIds![0]!
      await changeOwnership(c.id, A(), { action: 'request_doctor', expectedVersion: c.ownerVersion, summary: 'SYN see photo', attachmentIds: [attId] })
      await expect(updateAttachment(D(), attId, { flagged: true })).rejects.toMatchObject({ code: 'forbidden' })
      await updateAttachment(D(), attId, { reviewed: true })
      const [att] = await db.select().from(waAttachments).where(eq(waAttachments.id, attId))
      expect(att!.flaggedBy).toBe(admin.id)
      expect(att!.reviewedBy).toBe(doctor.id)
      // The case status is untouched by file review
      const [kase] = await db.select().from(consultationCases).where(eq(consultationCases.whatsappPhone, c.contactPhone))
      expect(kase!.status).toBe('NEW')
    })

    it('media download failure is visible and recoverable; unsupported types are flagged, not fetched', async () => {
      const phone = fakePhone()
      const r = await processInboundMessage(msg(phone, null, { type: 'image', media: { id: 'MEDIA.FAIL.1', mimeType: 'image/jpeg', filename: null, caption: null } }))
      const attId = r.mediaFetchIds![0]!
      await requestMediaFetches([attId])
      const res = await mediaFailedHook(jsonRequest(`/api/hooks/wa-media/${attId}/failed`, { attachment_id: attId, error: 'Graph timeout' }, { 'x-etabib-key': HOOK_KEY }), { params: { id: attId } })
      expect(res.status).toBe(200)
      let [att] = await db.select().from(waAttachments).where(eq(waAttachments.id, attId))
      expect(att!.fetchStatus).toBe('FAILED')
      const { retryAttachmentFetch } = await import('@/lib/etabib/inbox/files')
      await retryAttachmentFetch(A(), attId)
      ;[att] = await db.select().from(waAttachments).where(eq(waAttachments.id, attId))
      expect(att!.fetchStatus).toBe('REQUESTED')
      const doc = await processInboundMessage(msg(phone, null, { type: 'document', media: { id: 'MEDIA.DOCX.1', mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', filename: 'a.docx', caption: null } }))
      expect(doc.mediaFetchIds).toHaveLength(0)
      const [unsupported] = await db.select().from(waAttachments).where(eq(waAttachments.providerMediaId, 'MEDIA.DOCX.1'))
      expect(unsupported!.fetchStatus).toBe('UNSUPPORTED')
    })

    it('content sniffing ignores the declared type', () => {
      expect(sniffType(PNG)).toBe('image/png')
      expect(sniffType(PDF)).toBe('application/pdf')
      expect(acceptContent(PDF, 'image/png')).toBeNull()
      expect(acceptContent(Buffer.from('<html><script>alert(1)</script></html>'), 'application/pdf')).toBeNull()
    })
  })

  // ------------------------------------------------------------------
  describe('API and lists', () => {
    it('send route: owner only, idempotent key, and the view reports ownership and window', async () => {
      const { c } = await adminOwned()
      login(admin.id, 'administrator')
      const k = key()
      const body = { body: 'via route', clientRequestKey: k, expectedVersion: c.ownerVersion }
      expect((await sendRoute(jsonRequest(`/api/inbox/conversations/${c.id}/messages`, body), { params: { id: c.id } })).status).toBe(201)
      expect((await sendRoute(jsonRequest(`/api/inbox/conversations/${c.id}/messages`, body), { params: { id: c.id } })).status).toBe(200)
      login(admin2.id, 'administrator')
      expect((await sendRoute(jsonRequest(`/api/inbox/conversations/${c.id}/messages`, { ...body, clientRequestKey: key() }), { params: { id: c.id } })).status).toBe(403)
      const view = await (await viewRoute(new NextRequest(`http://localhost/api/inbox/conversations/${c.id}`), { params: { id: c.id } })).json()
      expect(view.conversation.owner).toBe('ADMIN')
      expect(view.me.isOwner).toBe(false)
      expect(view.actions).toContain('take_back')
      expect(view.conversation.window.open).toBe(true)
      const list = await listConversations(A2(), 'admin_queue')
      expect(list.map((x) => x.id)).toContain(c.id)
      const mine = await listConversations(A(), 'mine')
      expect(mine.map((x) => x.id)).toEqual([c.id])
    })

    it('the doctor only sees conversations involving them', async () => {
      const { c } = await adminOwned()
      expect((await listConversations(D(), 'all')).map((x) => x.id)).not.toContain(c.id)
      await changeOwnership(c.id, A(), { action: 'request_doctor', expectedVersion: c.ownerVersion, summary: 'SYN' })
      const list = await listConversations(D(), 'pending')
      expect(list.find((x) => x.id === c.id)?.pendingForMe).toBe(true)
    })
  })

  void and
  void sql
  void whatsappEvents
})
