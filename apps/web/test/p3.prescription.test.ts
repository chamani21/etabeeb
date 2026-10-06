/**
 * Prescription stage: draft → finalize/lock → render → WhatsApp image + voice →
 * explicit completion. Synthetic data only; n8n is stubbed (fetch); rendering
 * is the stand-in from test/setup.ts; voice tests use the real FFmpeg.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'

vi.mock('@/lib/auth-helpers', () => ({ getCurrentUser: vi.fn() }))

import { getCurrentUser } from '@/lib/auth-helpers'
import { spawnSync } from 'child_process'
import { mkdtempSync, readFileSync } from 'fs'
import { tmpdir } from 'os'
import path from 'path'
import { NextRequest } from 'next/server'
import { db } from '@etabeeb/db'
import { consultationVideoSessions, notificationOutbox, prescriptionItems, prescriptions, whatsappEvents } from '@etabeeb/db/schema'
import { and, eq, sql } from 'drizzle-orm'
import {
  addVoiceNote,
  completeConsultation,
  copyMedicinesIntoDraft,
  createAmendment,
  finalizePrescription,
  previewPrescription,
  prescriptionState,
  resendPrescription,
  saveDraft,
  sendPrescription,
  updateVoiceNote,
  verifyPrescriptionToken,
} from '@/lib/etabib/rx/service'
import { applyOutboundResult, cancelConsultation } from '@/lib/etabib/cases'
import { dependentJobs, dispatchOutboundJobs, dispatchPendingOutboundJobs } from '@/lib/etabib/outbound'
import { processInboundMessage } from '@/lib/etabib/whatsapp'
import { signMediaToken } from '@/lib/etabib/media-links'
import { POST as draftRoute, GET as stateRoute } from '@/app/api/doctor/cases/[id]/prescription/route'
import { POST as sendRoute } from '@/app/api/doctor/cases/[id]/prescription/send/route'
import { POST as voiceRoute } from '@/app/api/doctor/cases/[id]/prescription/voice/route'
import { POST as retryRoute } from '@/app/api/doctor/cases/[id]/prescription/retry/route'
import { GET as doctorFileRoute } from '@/app/api/doctor/cases/[id]/prescription/file/route'
import { GET as adminStateRoute } from '@/app/api/admin/cases/[id]/prescription/route'
import { GET as adminFileRoute } from '@/app/api/admin/cases/[id]/prescription/file/route'
import { POST as adminResendRoute } from '@/app/api/admin/cases/[id]/prescription/resend/route'
import { POST as completeRoute } from '@/app/api/doctor/cases/[id]/complete/route'
import { GET as mediaRoute } from '@/app/api/media/w/[token]/[name]/route'
import { hasTestDb, resetDb, createUser, jsonRequest, getCase, eventsFor, jobsOfType, caseAt, inbound } from './helpers'

const N8N_URL = 'https://n8n.example.test/webhook/outbound'
type SessionUser = NonNullable<Awaited<ReturnType<typeof getCurrentUser>>>
const mockUser = vi.mocked(getCurrentUser)
const loginAs = (id: string | null, role = 'practitioner') =>
  mockUser.mockResolvedValue(id ? ({ id, role, publicId: id, phone: '', displayName: 'Syn', locale: 'en', mustChangePassword: false } as SessionUser) : null)
const p = (id: string) => ({ params: { id } })
const getReq = (url: string) => new NextRequest(`http://localhost${url}`)
const hasFfmpeg = spawnSync(process.env.FFMPEG_PATH || 'ffmpeg', ['-version']).status === 0

const draft = (extra: Record<string, unknown> = {}) => ({
  diagnosis: 'SYN acute febrile illness',
  vitals: { weight: '70 kg', bp: '120/80' },
  medicines: [
    { name: 'Paracetamol', strength: '500 mg', formulation: 'tablet', dose: '1 tablet', frequency: 'three times daily', duration: '3 days', instructions: 'after meals' },
    { name: 'ORS', dose: '1 sachet', frequency: 'after each loose stool' },
  ],
  freeText: 'SYN free text line',
  investigations: 'CBC\nLFTs',
  advice: 'ډېرې اوبه وڅښئ.',
  followUp: 'Return sooner if worse',
  followUpInterval: '7 days',
  redFlags: 'SYN urgent signs',
  ...extra,
})

/** Synthetic voice recording (sine tone) in the browser's WebM/Opus format. */
function makeRecording(seconds: number): Buffer {
  const dir = mkdtempSync(path.join(tmpdir(), 'rx-voice-'))
  const out = path.join(dir, 'rec.webm')
  const r = spawnSync(process.env.FFMPEG_PATH || 'ffmpeg', ['-hide_banner', '-loglevel', 'error', '-f', 'lavfi', '-i', `sine=frequency=440:duration=${seconds}`, '-c:a', 'libopus', out])
  if (r.status !== 0) throw new Error('ffmpeg could not create the test recording')
  return readFileSync(out)
}

describe.skipIf(!hasTestDb)('prescription stage', () => {
  let adminId: string
  let doctorId: string
  let fetchMock: ReturnType<typeof vi.fn>
  const DOCTOR = () => ({ type: 'DOCTOR' as const, id: doctorId })
  const n8n = () => fetchMock.mock.calls.filter((c) => String(c[0]) === N8N_URL).map((c) => JSON.parse(c[1].body))

  beforeEach(async () => {
    await resetDb()
    adminId = await createUser('Synthetic Admin')
    doctorId = await createUser('Synthetic Doctor')
    Object.assign(process.env, {
      ETABIB_V1_DOCTOR_USER_ID: doctorId,
      ETABIB_N8N_OUTBOUND_URL: N8N_URL,
      ETABIB_N8N_OUTBOUND_KEY: 'test-outbound-key',
      NEXT_PUBLIC_APP_URL: 'https://staging.example.test',
      NEXTAUTH_SECRET: 'synthetic-nextauth-secret-not-a-real-secret',
      ETABIB_PRIVATE_STORAGE_DIR: mkdtempSync(path.join(tmpdir(), 'rx-store-')),
      LIVEKIT_URL: 'wss://livekit.example.test',
      LIVEKIT_API_KEY: 'APItestkey',
      LIVEKIT_API_SECRET: 'test-livekit-secret-not-real-0123456789abcdef',
    })
    fetchMock = vi.fn().mockResolvedValue(new Response('{}', { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)
    mockUser.mockReset()
  })
  afterEach(() => {
    vi.unstubAllGlobals()
    for (const k of ['ETABIB_N8N_OUTBOUND_URL', 'ETABIB_N8N_OUTBOUND_KEY', 'NEXT_PUBLIC_APP_URL', 'LIVEKIT_URL', 'LIVEKIT_API_KEY', 'LIVEKIT_API_SECRET']) delete process.env[k]
  })

  const rxOf = async (caseId: string) => db.select().from(prescriptions).where(eq(prescriptions.consultationId, caseId)).orderBy(prescriptions.revision)

  // ------------------------------------------------------------------
  describe('draft, finalize, lock, amend', () => {
    it('drafts are editable (multiple medicines, free text, investigations, advice, follow-up, red flags)', async () => {
      const { id } = await caseAt('CONFIRMED', { adminId, doctorId }) // drafting before the call is allowed
      await saveDraft(id, draft(), DOCTOR())
      await saveDraft(id, draft({ advice: 'SYN edited advice', medicines: [...draft().medicines, { name: 'Omeprazole', strength: '20 mg' }] }), DOCTOR())
      const [rx] = await rxOf(id)
      expect(rx).toMatchObject({ workflowStatus: 'DRAFT', revision: 1, advice: 'SYN edited advice', freeText: 'SYN free text line', investigations: 'CBC\nLFTs', followUpInterval: '7 days', redFlags: 'SYN urgent signs', vitals: { weight: '70 kg', bp: '120/80' } })
      expect(rx!.rxNumber).toMatch(/^ETB-RX-\d{8}-\d{5}$/)
      const items = await db.select().from(prescriptionItems).where(eq(prescriptionItems.prescriptionId, rx!.id))
      expect(items.map((i) => i.genericName)).toEqual(['Paracetamol', 'ORS', 'Omeprazole'])
      expect(items[2]).toMatchObject({ dose: null, frequency: null }) // nothing forced
      const ev = (await eventsFor(id)).map((e) => e.eventType)
      expect(ev.filter((e) => e === 'PRESCRIPTION_DRAFT_CREATED')).toHaveLength(1)
      expect(ev.filter((e) => e === 'PRESCRIPTION_UPDATED')).toHaveLength(1)
      expect(JSON.stringify(await eventsFor(id))).not.toMatch(/Paracetamol|edited advice/) // no clinical text in audit
    })

    it('preview renders the real document (draft watermark is the renderer’s job) and is audited', async () => {
      const { id } = await caseAt('IN_CONSULTATION', { adminId, doctorId })
      await saveDraft(id, draft(), DOCTOR())
      const pages = await previewPrescription(id, DOCTOR())
      expect(pages[0]).toMatch(/^data:image\/png;base64,/)
      expect((await eventsFor(id)).map((e) => e.eventType)).toContain('PRESCRIPTION_PREVIEWED')
    })

    it('finalize locks, renders image + PDF, links the case; repeat is a no-op; empty is refused', async () => {
      const { id } = await caseAt('IN_CONSULTATION', { adminId, doctorId })
      await saveDraft(id, { medicines: [] }, DOCTOR())
      await expect(finalizePrescription(id, DOCTOR())).rejects.toMatchObject({ code: 'prescription_empty' })
      await saveDraft(id, draft(), DOCTOR())
      const first = await finalizePrescription(id, DOCTOR())
      expect(first.changed).toBe(true)
      expect((await finalizePrescription(id, DOCTOR())).changed).toBe(false)
      const [rx] = await rxOf(id)
      expect(rx).toMatchObject({ workflowStatus: 'FINALIZED', signedBy: doctorId })
      expect(rx!.lockedAt).toBeInstanceOf(Date)
      expect(rx!.imageKeys).toEqual([`rx/${rx!.id}/page-1.png`])
      expect(rx!.pdfKey).toBe(`rx/${rx!.id}/prescription.pdf`)
      expect(rx!.documentHash).toMatch(/^[0-9a-f]{64}$/)
      expect((await getCase(id)).prescriptionId).toBe(rx!.id)
      const ev = (await eventsFor(id)).map((e) => e.eventType)
      expect(ev.filter((e) => e === 'PRESCRIPTION_FINALIZED')).toHaveLength(1)
      expect(ev.filter((e) => e === 'PRESCRIPTION_RENDERED')).toHaveLength(1)
    })

    it('a finalized prescription cannot be edited — by the service or directly in the database', async () => {
      const { id } = await caseAt('IN_CONSULTATION', { adminId, doctorId })
      await saveDraft(id, draft(), DOCTOR())
      await finalizePrescription(id, DOCTOR())
      await expect(saveDraft(id, draft({ advice: 'tampered' }), DOCTOR())).rejects.toMatchObject({ code: 'prescription_locked', httpStatus: 409 })
      const [rx] = await rxOf(id)
      await expect(db.update(prescriptions).set({ advice: 'tampered' }).where(eq(prescriptions.id, rx!.id))).rejects.toThrow(/locked/)
      await expect(db.update(prescriptions).set({ workflowStatus: 'DRAFT' }).where(eq(prescriptions.id, rx!.id))).rejects.toThrow(/locked/)
      await expect(db.insert(prescriptionItems).values({ prescriptionId: rx!.id, genericName: 'Injected' })).rejects.toThrow(/locked/)
      await expect(db.delete(prescriptionItems).where(eq(prescriptionItems.prescriptionId, rx!.id))).rejects.toThrow(/locked/)
      // render / delivery bookkeeping is still allowed
      await db.update(prescriptions).set({ renderError: null, deliveryRequestedAt: new Date() }).where(eq(prescriptions.id, rx!.id))
      expect((await rxOf(id))[0]!.advice).toBe('ډېرې اوبه وڅښئ.')
    })

    it('amendment = new revision; revision 1 is preserved, then superseded when the amendment is finalized', async () => {
      const { id } = await caseAt('IN_CONSULTATION', { adminId, doctorId })
      await saveDraft(id, draft(), DOCTOR())
      await finalizePrescription(id, DOCTOR())
      const v1 = (await rxOf(id))[0]!
      const v2 = await createAmendment(id, DOCTOR())
      expect((await createAmendment(id, DOCTOR())).id).toBe(v2.id) // idempotent
      expect(v2).toMatchObject({ revision: 2, rxNumber: v1.rxNumber, amendedFromId: v1.id, workflowStatus: 'DRAFT', advice: v1.advice })
      expect((await getCase(id)).prescriptionId).toBe(v1.id) // v1 still current until v2 is finalized
      await saveDraft(id, draft({ advice: 'SYN amended advice' }), DOCTOR())
      await finalizePrescription(id, DOCTOR())
      const [r1, r2] = await rxOf(id)
      expect(r1).toMatchObject({ workflowStatus: 'SUPERSEDED', status: 'replaced', replacedById: r2!.id, advice: 'ډېرې اوبه وڅښئ.' })
      expect(r2).toMatchObject({ workflowStatus: 'FINALIZED', revision: 2, advice: 'SYN amended advice' })
      expect((await getCase(id)).prescriptionId).toBe(r2!.id)
      expect((await eventsFor(id)).map((e) => e.eventType)).toContain('PRESCRIPTION_AMENDMENT_CREATED')
    })

    it('copy medicines from a previous prescription of the same patient into a NEW draft (old one untouched)', async () => {
      const first = await caseAt('COMPLETED', { adminId, doctorId })
      const [old] = await rxOf(first.id)
      // the old prescription was delivered long ago
      await db.update(notificationOutbox).set({ status: 'read' }).where(eq(notificationOutbox.templateKey, 'PRESCRIPTION_IMAGE'))
      // same patient returns (new case from the same WhatsApp number)
      const next = await processInboundMessage(inbound(first.sender, 'Salam again'))
      const caseId = next.consultationId!
      await db.execute(sql`UPDATE consultation_cases SET status = 'CONFIRMED', patient_name = 'Synthetic Patient', patient_phone = '+923001234567', payment_received = true, payment_confirmed_at = now(), payment_confirmed_by = ${adminId}, doctor_decision = 'APPROVED', doctor_approved_time = now() WHERE id = ${caseId}`)
      const state = await prescriptionState(caseId)
      expect(state.previous.map((p) => p.id)).toEqual([old!.id])
      const copied = await copyMedicinesIntoDraft(caseId, old!.id, DOCTOR())
      expect(copied.workflowStatus).toBe('DRAFT')
      expect(copied.id).not.toBe(old!.id)
      const items = await db.select().from(prescriptionItems).where(eq(prescriptionItems.prescriptionId, copied.id))
      expect(items.map((i) => i.genericName)).toEqual(['Paracetamol'])
      expect((await rxOf(first.id))[0]!.workflowStatus).toBe('FINALIZED')
      // another patient's prescription cannot be copied
      const stranger = await caseAt('COMPLETED', { adminId, doctorId })
      const [foreign] = await rxOf(stranger.id)
      await expect(copyMedicinesIntoDraft(caseId, foreign!.id, DOCTOR())).rejects.toMatchObject({ httpStatus: 404 })
    })
  })

  // ------------------------------------------------------------------
  describe('send (call stays open) vs. explicit completion', () => {
    const finalized = async () => {
      const c = await caseAt('IN_CONSULTATION', { adminId, doctorId })
      await saveDraft(c.id, draft(), DOCTOR())
      await finalizePrescription(c.id, DOCTOR())
      return c
    }

    it('send queues the image once (double click / refresh / retry are safe) and never ends the call', async () => {
      const { id } = await finalized()
      loginAs(doctorId)
      const r1 = await (await sendRoute(jsonRequest('/x', {}), p(id))).json()
      const r2 = await (await sendRoute(jsonRequest('/x', {}), p(id))).json()
      expect(r1).toMatchObject({ success: true, caseStatus: 'IN_CONSULTATION', queued: 1 })
      expect(r2).toMatchObject({ success: true, queued: 0 })
      expect(await jobsOfType('PRESCRIPTION_IMAGE')).toHaveLength(1)
      expect(n8n().filter((m) => m.type === 'PRESCRIPTION_IMAGE')).toHaveLength(1)
      const [s] = await db.select().from(consultationVideoSessions).where(eq(consultationVideoSessions.consultationId, id))
      expect(s!.status).not.toBe('ENDED')
      expect((await getCase(id)).status).toBe('IN_CONSULTATION')
      expect((await eventsFor(id)).filter((e) => e.eventType === 'PRESCRIPTION_DELIVERY_REQUESTED')).toHaveLength(1)
    })

    it('send is refused for drafts and before the consultation starts', async () => {
      const c = await caseAt('CONFIRMED', { adminId, doctorId })
      await saveDraft(c.id, draft(), DOCTOR())
      await expect(sendPrescription(c.id, DOCTOR())).rejects.toMatchObject({ code: 'prescription_not_finalized' })
      await finalizePrescription(c.id, DOCTOR())
      await expect(sendPrescription(c.id, DOCTOR())).rejects.toMatchObject({ httpStatus: 409 })
    })

    it('completion is explicit: refused before sending; send & complete closes video', async () => {
      const a = await finalized()
      await expect(completeConsultation(a.id, DOCTOR())).rejects.toMatchObject({ code: 'prescription_not_sent' })
      await sendPrescription(a.id, DOCTOR())
      const done = await completeConsultation(a.id, DOCTOR())
      expect(done.case.status).toBe('COMPLETED')
      expect((await completeConsultation(a.id, DOCTOR())).changed).toBe(false)

      const b = await finalized()
      loginAs(doctorId)
      const r = await (await sendRoute(jsonRequest('/x', { complete: true }), p(b.id))).json()
      expect(r).toMatchObject({ success: true, caseStatus: 'COMPLETED' })
      const [s] = await db.select().from(consultationVideoSessions).where(eq(consultationVideoSessions.consultationId, b.id))
      expect(s!.status).toBe('ENDED')
      const ev = (await eventsFor(b.id)).map((e) => e.eventType)
      expect(ev).toEqual(expect.arrayContaining(['PRESCRIPTION_DELIVERY_REQUESTED', 'PRESCRIPTION_SENT', 'CASE_COMPLETED', 'VIDEO_SESSION_ENDED']))
    })

    it.skipIf(!hasFfmpeg)('message order: image first, then the voice note (WhatsApp voice: OGG/Opus)', async () => {
      const { id } = await finalized()
      await addVoiceNote(id, DOCTOR(), { data: makeRecording(2), mimeType: 'audio/webm;codecs=opus' })
      const sent = await sendPrescription(id, DOCTOR())
      await dispatchOutboundJobs(sent.jobs.map((j) => j.id))
      const [img] = await jobsOfType('PRESCRIPTION_IMAGE')
      const [voice] = await jobsOfType('PRESCRIPTION_VOICE')
      expect(n8n().map((m) => m.type)).toEqual(['PRESCRIPTION_IMAGE']) // image handed to n8n
      expect((await db.select().from(notificationOutbox).where(eq(notificationOutbox.id, voice!.id)))[0]!.status).toBe('pending')
      await applyOutboundResult({ jobId: img!.id, success: true, status: 'sent', wamid: 'wamid.SYN.IMG' })
      expect(await dependentJobs(img!.id)).toEqual([voice!.id])
      await dispatchOutboundJobs(await dependentJobs(img!.id))
      const msgs = n8n()
      expect(msgs.map((m) => m.type)).toEqual(['PRESCRIPTION_IMAGE', 'PRESCRIPTION_VOICE'])
      expect(msgs[0]).toMatchObject({ messageKind: 'image', audience: 'PATIENT' })
      expect(msgs[0].media.caption).toContain('د ډاکټر د لارښوونو غږیز پیغام هم درته استول کېږي')
      expect(msgs[1]).toMatchObject({ messageKind: 'audio', media: { voice: true } })
      expect(msgs[1].media.link).toMatch(/\/api\/media\/w\/[^/]+\/voice\.ogg$/)
      await applyOutboundResult({ jobId: voice!.id, success: true, status: 'sent', wamid: 'wamid.SYN.VOICE' })
      const ev = (await eventsFor(id)).map((e) => e.eventType)
      expect(ev).toEqual(expect.arrayContaining(['PRESCRIPTION_VOICE_RECORDED', 'PRESCRIPTION_IMAGE_SENT', 'PRESCRIPTION_VOICE_SENT']))
      expect((await getCase(id)).status).toBe('IN_CONSULTATION')
    })

    it('outside the 24-hour window: media is held (no attempt used), released when the patient writes, expires after 7 days', async () => {
      const c = await finalized()
      await db.update(whatsappEvents).set({ createdAt: new Date(Date.now() - 30 * 3600_000) }).where(eq(whatsappEvents.senderPhone, c.sender))
      const sent = await sendPrescription(c.id, DOCTOR())
      const [res] = await dispatchOutboundJobs(sent.jobs.map((j) => j.id))
      expect(res).toMatchObject({ dispatched: false, reason: 'waiting_for_patient_reply' })
      let [job] = await jobsOfType('PRESCRIPTION_IMAGE')
      expect(job).toMatchObject({ status: 'pending', attempts: 0 })
      expect(job!.lastError).toMatch(/^waiting_for_patient_reply/)
      await dispatchPendingOutboundJobs()
      const rxMsgs = () => n8n().filter((m) => String(m.type).startsWith('PRESCRIPTION_'))
      expect(rxMsgs()).toHaveLength(0)
      // the doctor completes; later the patient replies → the image goes out, no new case opened
      await completeConsultation(c.id, DOCTOR())
      const reply = await processInboundMessage(inbound(c.sender, 'سلام'))
      expect(reply).toMatchObject({ outcome: 'released_held_media', consultationId: c.id })
      await dispatchPendingOutboundJobs()
      expect(rxMsgs().map((m) => m.type)).toEqual(['PRESCRIPTION_IMAGE'])
      // a job still held after 7 days is failed (visible + retryable)
      const c2 = await finalized()
      await db.update(whatsappEvents).set({ createdAt: new Date(Date.now() - 30 * 3600_000) }).where(eq(whatsappEvents.senderPhone, c2.sender))
      const s2 = await sendPrescription(c2.id, DOCTOR())
      await db.update(notificationOutbox).set({ createdAt: new Date(Date.now() - 8 * 86_400_000) }).where(eq(notificationOutbox.id, s2.jobs[0]!.id))
      const [r2] = await dispatchOutboundJobs([s2.jobs[0]!.id])
      expect(r2!.reason).toBe('window_closed_expired')
      ;[job] = await db.select().from(notificationOutbox).where(eq(notificationOutbox.id, s2.jobs[0]!.id))
      expect(job!.status).toBe('failed')
    })

    it('outside the window with the approved image template: page 1 goes as template (image header); voice waits for the reply', async () => {
      process.env.ETABIB_WA_TEMPLATES = JSON.stringify({ PATIENT_PRESCRIPTION_IMAGE: { name: 'etabib_prescription_ready_ps_v2', language: 'ps_AF' } })
      try {
        const c = await finalized()
        await db.update(whatsappEvents).set({ createdAt: new Date(Date.now() - 30 * 3600_000) }).where(eq(whatsappEvents.senderPhone, c.sender))
        const sent = await sendPrescription(c.id, DOCTOR())
        await dispatchOutboundJobs(sent.jobs.map((j) => j.id))
        const [m] = n8n()
        expect(m).toMatchObject({ type: 'PRESCRIPTION_IMAGE', messageKind: 'template' })
        expect(m.template.name).toBe('etabib_prescription_ready_ps_v2')
        expect(m.template.language).toBe('ps_AF')
        expect(m.template.components[0]).toMatchObject({ type: 'header', parameters: [{ type: 'image', image: { link: expect.stringMatching(/^https:\/\/staging\.example\.test\/api\/media\/w\/.+\/page-1\.png$/) } }] })
        expect(m.template.components[1].parameters.map((x: { text: string }) => x.text)).toEqual(['Synthetic Patient'])
        expect(m.media).toBeUndefined()
      } finally {
        delete process.env.ETABIB_WA_TEMPLATES
      }
    })

    it('retry re-sends the SAME rendered image (no re-render); admin resend is rate limited', async () => {
      const { id } = await finalized()
      const sent = await sendPrescription(id, DOCTOR())
      const before = (await rxOf(id))[0]!
      await applyOutboundResult({ jobId: sent.jobs[0]!.id, success: false, status: 'failed', error: { code: 131000, message: 'SYN failure' } })
      expect((await eventsFor(id)).map((e) => e.eventType)).toContain('PRESCRIPTION_DELIVERY_FAILED')
      loginAs(doctorId)
      expect((await retryRoute(jsonRequest('/x', { jobId: sent.jobs[0]!.id }), p(id))).status).toBe(200)
      expect(n8n().filter((m) => m.type === 'PRESCRIPTION_IMAGE')).toHaveLength(1)
      expect((await rxOf(id))[0]!.renderedAt!.getTime()).toBe(before.renderedAt!.getTime())
      loginAs(adminId, 'administrator')
      expect((await (await adminResendRoute(jsonRequest('/x', {}), p(id))).json()).changed).toBe(true)
      expect((await (await adminResendRoute(jsonRequest('/x', {}), p(id))).json()).changed).toBe(false)
      expect(await resendPrescription(id, { type: 'ADMIN', id: adminId })).toMatchObject({ changed: false })
    })
  })

  // ------------------------------------------------------------------
  describe('voice notes', () => {
    it.skipIf(!hasFfmpeg)('upload → stored privately, transcoded to mono OGG/Opus; validation; delete/toggle only before sending', async () => {
      const { id } = await caseAt('IN_CONSULTATION', { adminId, doctorId })
      await saveDraft(id, draft(), DOCTOR())
      loginAs(doctorId)
      const fd = new FormData()
      fd.append('audio', new Blob([new Uint8Array(makeRecording(2))], { type: 'audio/webm;codecs=opus' }), 'voice.webm')
      const res = await voiceRoute(new NextRequest('http://localhost/x', { method: 'POST', body: fd }), p(id))
      expect(res.status).toBe(201)
      const { voiceNote } = await res.json()
      expect(voiceNote.durationMs).toBeGreaterThan(1500)
      expect(voiceNote.durationMs).toBeLessThan(2600)
      const token = signMediaToken({ kind: 'voice', id: voiceNote.id })
      const audio = Buffer.from(await (await mediaRoute(getReq('/x'), { params: { token, name: 'voice.ogg' } })).arrayBuffer())
      expect(audio.subarray(0, 4).toString()).toBe('OggS')
      expect(audio.includes(Buffer.from('OpusHead'))).toBe(true)
      expect(audio[audio.indexOf(Buffer.from('OpusHead')) + 9]).toBe(1) // mono
      // invalid uploads
      await expect(addVoiceNote(id, DOCTOR(), { data: Buffer.from('not audio at all'), mimeType: 'audio/webm' })).rejects.toMatchObject({ code: 'invalid_audio' })
      await expect(addVoiceNote(id, DOCTOR(), { data: makeRecording(0.3), mimeType: 'audio/webm' })).rejects.toMatchObject({ code: 'audio_too_short' })
      await expect(addVoiceNote(id, DOCTOR(), { data: Buffer.from('x'), mimeType: 'application/pdf' })).rejects.toMatchObject({ code: 'invalid_audio' })
      // toggle + delete before sending
      await updateVoiceNote(id, voiceNote.id, DOCTOR(), { includeInDelivery: false })
      expect((await prescriptionState(id)).voiceNotes[0]!.includeInDelivery).toBe(false)
      await updateVoiceNote(id, voiceNote.id, DOCTOR(), { includeInDelivery: true })
      await finalizePrescription(id, DOCTOR())
      await sendPrescription(id, DOCTOR())
      await expect(updateVoiceNote(id, voiceNote.id, DOCTOR(), { delete: true })).rejects.toMatchObject({ code: 'voice_already_sent' })
      // a voice note recorded before finalizing is kept with the finalized prescription
      expect((await prescriptionState(id)).voiceNotes).toHaveLength(1)
    })
  })

  // ------------------------------------------------------------------
  describe('security', () => {
    const sentCase = async () => {
      const c = await caseAt('PRESCRIBED', { adminId, doctorId })
      const [rx] = await rxOf(c.id)
      return { ...c, rx: rx! }
    }

    it('signed media links: valid works; tampered, wrong kind, expired, draft → 404', async () => {
      const { rx } = await sentCase()
      const ok = await mediaRoute(getReq('/x'), { params: { token: signMediaToken({ kind: 'rx-image', id: rx.id, page: 1 }), name: 'page-1.png' } })
      expect(ok.status).toBe(200)
      expect(ok.headers.get('content-type')).toBe('image/png')
      const good = signMediaToken({ kind: 'rx-image', id: rx.id, page: 1 })
      const tampered = good.slice(0, -2) + (good.endsWith('A') ? 'BB' : 'AA')
      for (const token of [tampered, 'x.y', signMediaToken({ kind: 'rx-image', id: rx.id, page: 1 }, -10), signMediaToken({ kind: 'voice', id: rx.id })]) {
        expect((await mediaRoute(getReq('/x'), { params: { token, name: 'a' } })).status).toBe(404)
      }
      const d = await caseAt('IN_CONSULTATION', { adminId, doctorId })
      const draftRx = await saveDraft(d.id, draft(), DOCTOR())
      expect((await mediaRoute(getReq('/x'), { params: { token: signMediaToken({ kind: 'rx-image', id: draftRx.id, page: 1 }), name: 'a' } })).status).toBe(404)
    })

    it('staff file access: doctor + admin can view/download; wrong case → 404; patient / anonymous refused', async () => {
      const { id, rx } = await sentCase()
      const url = (kind: string) => `/x?rx=${rx.id}&kind=${kind}&page=1`
      loginAs(doctorId)
      expect((await doctorFileRoute(getReq(url('pdf')), p(id))).headers.get('content-type')).toBe('application/pdf')
      loginAs(adminId, 'administrator')
      expect((await adminFileRoute(getReq(url('image')), p(id))).status).toBe(200)
      const other = await caseAt('IN_CONSULTATION', { adminId, doctorId })
      expect((await adminFileRoute(getReq(url('pdf')), p(other.id))).status).toBe(404)
      loginAs(await createUser('Synthetic Patient User'), 'patient')
      expect((await doctorFileRoute(getReq(url('pdf')), p(id))).status).toBe(403)
      expect((await adminFileRoute(getReq(url('pdf')), p(id))).status).toBe(403)
      loginAs(null)
      expect((await doctorFileRoute(getReq(url('pdf')), p(id))).status).toBe(401)
    })

    it('role boundaries: admin cannot write prescriptions; other doctors cannot; admin view is read-only', async () => {
      const { id } = await caseAt('IN_CONSULTATION', { adminId, doctorId })
      loginAs(adminId, 'administrator')
      expect((await draftRoute(jsonRequest('/x', draft()), p(id))).status).toBe(403)
      expect((await sendRoute(jsonRequest('/x', {}), p(id))).status).toBe(403)
      expect((await completeRoute(jsonRequest('/x', {}), p(id))).status).toBe(403)
      const view = await (await adminStateRoute(getReq('/x'), p(id))).json()
      expect(view.previous).toEqual([])
      loginAs(await createUser('Synthetic Other Doctor'))
      expect((await draftRoute(jsonRequest('/x', draft()), p(id))).status).toBe(403)
      loginAs(doctorId)
      expect((await draftRoute(jsonRequest('/x', draft()), p(id))).status).toBe(200)
      expect((await stateRoute(getReq('/x'), p(id))).status).toBe(200)
    })

    it('public QR verification shows no clinical data; drafts and random tokens are not found', async () => {
      const { rx } = await sentCase()
      const v = await verifyPrescriptionToken(rx.verificationToken)
      expect(v).toMatchObject({ rxNumber: rx.rxNumber, revision: 1, status: 'FINALIZED', doctor: 'Dr Jalal-ud-din "Jalal"' })
      expect(JSON.stringify(v)).not.toMatch(/Paracetamol|Synthetic Patient|diagnosis/i)
      expect(rx.verificationToken).toMatch(/^[A-Za-z0-9_-]{22}$/) // 128-bit, not enumerable
      expect(await verifyPrescriptionToken('A'.repeat(22))).toBeNull()
      expect(await verifyPrescriptionToken('../../etc')).toBeNull()
      const d = await caseAt('IN_CONSULTATION', { adminId, doctorId })
      const draftRx = await saveDraft(d.id, draft(), DOCTOR())
      expect(await verifyPrescriptionToken(draftRx.verificationToken)).toBeNull()
    })

    it('a cancelled case never receives a prescription', async () => {
      const c = await caseAt('CONFIRMED', { adminId, doctorId })
      await saveDraft(c.id, draft(), DOCTOR())
      await cancelConsultation(c.id, { reason: 'PATIENT_REQUESTED' }, { type: 'ADMIN', id: adminId })
      await expect(saveDraft(c.id, draft(), DOCTOR())).rejects.toMatchObject({ httpStatus: 409 })
      await expect(finalizePrescription(c.id, DOCTOR())).rejects.toMatchObject({ httpStatus: 409 })
      expect(await db.select().from(notificationOutbox).where(and(eq(notificationOutbox.templateKey, 'PRESCRIPTION_IMAGE')))).toHaveLength(0)
    })
  })
})
