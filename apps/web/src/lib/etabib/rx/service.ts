/**
 * eTabib V1 — prescription stage service.
 *
 *   DRAFT ──save──▶ DRAFT ──finalize──▶ FINALIZED (locked) ──render──▶ images + PDF
 *     ▲                                    │
 *     └──────────── amend (new revision) ◀─┘   old revision → SUPERSEDED once the amendment is finalized
 *
 * Delivery and completion are separate, explicit actions:
 *   sendPrescription      queues the image(s) (+ optional voice) — the call stays open
 *   completeConsultation  IN_CONSULTATION → PRESCRIPTION_SENT → COMPLETED, closes video
 *
 * Clinical content of a FINALIZED revision is immutable (service checks + a DB
 * trigger). Every action is audited in case_events (no clinical text in metadata).
 */
import { createHash, randomBytes } from 'crypto'
import { db } from '@etabeeb/db'
import {
  consultationCases,
  notificationOutbox,
  prescriptionItems,
  prescriptions,
  prescriptionVoiceNotes,
  users,
  whatsappEvents,
} from '@etabeeb/db/schema'
import type { ConsultationCase, Prescription } from '@etabeeb/db'
import { and, asc, desc, eq, inArray, isNull, max, ne, sql } from 'drizzle-orm'
import { getAppUrl, getV1DoctorUserId } from '../config'
import { EtabibError, TransitionError } from '../errors'
import { enqueueOutboundJob, type EnqueuedJob } from '../outbound'
import { lockCase, recordCaseEvent, transitionCase, updateCaseFields, type Actor, type Tx } from '../transitions'
import { endVideoSessionTx } from '../video'
import { DR_JALALUDDIN, ETABEEB_CONTACT, type RxDocument, type RxMedicine, type RxVitals } from './document'
import { getFile, putFile } from '../storage'

type Doctor = Actor & { type: 'DOCTOR'; id: string }
type Staff = Actor & { type: 'DOCTOR' | 'ADMIN'; id: string }

// ------------------------------------------------------------------
// Input
// ------------------------------------------------------------------

export interface RxDraftInput {
  diagnosis?: string | null | undefined
  vitals?: RxVitals | null | undefined
  medicines: RxMedicine[]
  freeText?: string | null | undefined
  investigations?: string | null | undefined
  advice?: string | null | undefined
  followUp?: string | null | undefined
  followUpInterval?: string | null | undefined
  redFlags?: string | null | undefined
}

const WRITABLE_CASE: ReadonlyArray<ConsultationCase['status']> = ['CONFIRMED', 'IN_CONSULTATION']

const clean = (v: string | null | undefined): string | null => {
  const t = (v ?? '').trim()
  return t ? t : null
}

function cleanVitals(v: RxVitals | null | undefined): Record<string, string> | null {
  if (!v) return null
  const out: Record<string, string> = {}
  for (const k of ['weight', 'bp', 'pulse', 'temperature', 'respiratoryRate'] as const) {
    const val = clean(v[k])
    if (val) out[k] = val
  }
  return Object.keys(out).length ? out : null
}

// ------------------------------------------------------------------
// Helpers
// ------------------------------------------------------------------

/** Latest revision of the case's prescription (draft or finalized), if any. */
async function currentRx(tx: Tx | typeof db, caseId: string): Promise<Prescription | null> {
  const [rx] = await tx
    .select()
    .from(prescriptions)
    .where(and(eq(prescriptions.consultationId, caseId), ne(prescriptions.workflowStatus, 'SUPERSEDED')))
    .orderBy(desc(prescriptions.revision), desc(prescriptions.createdAt))
    .limit(1)
  return rx ?? null
}

async function newRxNumber(tx: Tx): Promise<string> {
  const [row] = await tx.execute<{ n: string }>(sql`SELECT nextval('prescription_rx_number_seq')::text AS n`)
  const day = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Karachi', year: 'numeric', month: '2-digit', day: '2-digit' })
    .format(new Date())
    .replace(/-/g, '')
  return `ETB-RX-${day}-${String((row as { n: string }).n).padStart(5, '0')}`
}

const verificationToken = () => randomBytes(16).toString('base64url') // 128-bit, not enumerable

function assertCaseWritable(c: ConsultationCase): void {
  if (!WRITABLE_CASE.includes(c.status)) {
    throw new TransitionError('invalid_status', `Prescription cannot be changed while case is ${c.status}`)
  }
}

async function writeItems(tx: Tx, rxId: string, medicines: RxMedicine[]): Promise<void> {
  await tx.delete(prescriptionItems).where(eq(prescriptionItems.prescriptionId, rxId))
  const rows = medicines
    .map((m) => ({ ...m, name: (m.name ?? '').trim() }))
    .filter((m) => m.name)
    .map((m, i) => ({
      prescriptionId: rxId,
      genericName: m.name,
      strength: clean(m.strength),
      formulation: clean(m.formulation),
      route: clean(m.route),
      dose: clean(m.dose),
      frequency: clean(m.frequency),
      timing: clean(m.timing),
      duration: clean(m.duration),
      patientInstructions: clean(m.instructions),
      substitutionAllowed: true,
      isControlled: false,
      sortOrder: i,
    }))
  if (rows.length) await tx.insert(prescriptionItems).values(rows)
}

function contentPatch(input: RxDraftInput) {
  return {
    diagnosis: clean(input.diagnosis),
    vitals: cleanVitals(input.vitals),
    freeText: clean(input.freeText),
    investigations: clean(input.investigations),
    advice: clean(input.advice),
    followUp: clean(input.followUp),
    followUpInterval: clean(input.followUpInterval),
    redFlags: clean(input.redFlags),
  }
}

// ------------------------------------------------------------------
// Draft
// ------------------------------------------------------------------

/** Create (if needed) and save the case's DRAFT. A finalized prescription is never edited: amend instead. */
export async function saveDraft(caseId: string, input: RxDraftInput, doctor: Doctor): Promise<Prescription> {
  return db.transaction(async (tx) => {
    const c = await lockCase(tx, caseId)
    assertCaseWritable(c)
    let rx: Prescription | null | undefined = await currentRx(tx, caseId)
    if (rx && rx.workflowStatus !== 'DRAFT') {
      throw new EtabibError('prescription_locked', 'This prescription is finalized. Create an amendment to change it.', 409)
    }
    if (!rx) {
      ;[rx] = await tx
        .insert(prescriptions)
        .values({
          verificationToken: verificationToken(),
          consultationId: caseId,
          rxNumber: await newRxNumber(tx),
          revision: 1,
          workflowStatus: 'DRAFT',
          prescribedBy: doctor.id,
          encounterId: null,
          appointmentId: null,
          prescribedForUserId: null,
          ...contentPatch(input),
        })
        .returning()
      await recordCaseEvent(tx, { caseId, eventType: 'PRESCRIPTION_DRAFT_CREATED', oldStatus: c.status, newStatus: c.status, actor: doctor, metadata: { prescriptionId: rx!.id, revision: 1 } })
    } else {
      ;[rx] = await tx.update(prescriptions).set({ ...contentPatch(input), updatedAt: new Date() }).where(eq(prescriptions.id, rx.id)).returning()
      await recordCaseEvent(tx, { caseId, eventType: 'PRESCRIPTION_UPDATED', oldStatus: c.status, newStatus: c.status, actor: doctor, metadata: { prescriptionId: rx!.id, revision: rx!.revision } })
    }
    await writeItems(tx, rx!.id, input.medicines)
    return rx!
  })
}

/** New editable revision copying the finalized one (which stays preserved until the amendment is finalized). */
export async function createAmendment(caseId: string, doctor: Doctor): Promise<Prescription> {
  return db.transaction(async (tx) => {
    const c = await lockCase(tx, caseId)
    assertCaseWritable(c)
    const rx = await currentRx(tx, caseId)
    if (!rx) throw new EtabibError('no_prescription', 'There is no prescription to amend', 409)
    if (rx.workflowStatus === 'DRAFT') return rx // already amending (idempotent)
    const items = await tx.select().from(prescriptionItems).where(eq(prescriptionItems.prescriptionId, rx.id)).orderBy(asc(prescriptionItems.sortOrder))
    const [draft] = await tx
      .insert(prescriptions)
      .values({
        verificationToken: verificationToken(),
        consultationId: caseId,
        rxNumber: rx.rxNumber,
        revision: rx.revision + 1,
        amendedFromId: rx.id,
        workflowStatus: 'DRAFT',
        prescribedBy: doctor.id,
        encounterId: null,
        appointmentId: null,
        prescribedForUserId: null,
        diagnosis: rx.diagnosis,
        vitals: rx.vitals,
        freeText: rx.freeText,
        investigations: rx.investigations,
        advice: rx.advice,
        followUp: rx.followUp,
        followUpInterval: rx.followUpInterval,
        redFlags: rx.redFlags,
        notes: rx.notes,
      })
      .returning()
    await writeItems(
      tx,
      draft!.id,
      items.map((i) => ({ name: i.genericName, strength: i.strength, formulation: i.formulation, route: i.route, dose: i.dose, frequency: i.frequency, timing: i.timing, duration: i.duration ?? (i.durationDays ? `${i.durationDays} days` : null), instructions: i.patientInstructions })),
    )
    await recordCaseEvent(tx, { caseId, eventType: 'PRESCRIPTION_AMENDMENT_CREATED', oldStatus: c.status, newStatus: c.status, actor: doctor, metadata: { prescriptionId: draft!.id, amendedFromId: rx.id, revision: draft!.revision } })
    return draft!
  })
}

/** Copy medicines from an earlier finalized prescription of the same patient into this case's draft. */
export async function copyMedicinesIntoDraft(caseId: string, fromPrescriptionId: string, doctor: Doctor): Promise<Prescription> {
  const c = await loadCase(caseId)
  const prev = await previousPrescriptions(c)
  if (!prev.some((p) => p.id === fromPrescriptionId)) throw new EtabibError('not_found', 'Previous prescription not found for this patient', 404)
  const from = await db.select().from(prescriptionItems).where(eq(prescriptionItems.prescriptionId, fromPrescriptionId)).orderBy(asc(prescriptionItems.sortOrder))
  const current = await currentRx(db, caseId)
  const existing = current ? await db.select().from(prescriptionItems).where(eq(prescriptionItems.prescriptionId, current.id)).orderBy(asc(prescriptionItems.sortOrder)) : []
  const toMed = (i: typeof from[number]): RxMedicine => ({ name: i.genericName, strength: i.strength, formulation: i.formulation, route: i.route, dose: i.dose, frequency: i.frequency, timing: i.timing, duration: i.duration ?? (i.durationDays ? `${i.durationDays} days` : null), instructions: i.patientInstructions })
  const base: RxDraftInput = current
    ? { diagnosis: current.diagnosis, vitals: current.vitals as RxVitals | null, freeText: current.freeText, investigations: current.investigations, advice: current.advice, followUp: current.followUp, followUpInterval: current.followUpInterval, redFlags: current.redFlags, medicines: existing.map(toMed) }
    : { medicines: [] }
  // never edits the old prescription: always a (new) draft in this case
  return saveDraft(caseId, { ...base, medicines: [...base.medicines, ...from.map(toMed)] }, doctor)
}

// ------------------------------------------------------------------
// Finalize + render
// ------------------------------------------------------------------

export function hasContent(rx: Pick<Prescription, 'freeText'>, itemCount: number): boolean {
  return itemCount > 0 || Boolean(rx.freeText?.trim())
}

/** Lock the draft (immutable from now on), make it the case's current prescription, then render. */
export async function finalizePrescription(caseId: string, doctor: Doctor): Promise<{ prescription: Prescription; changed: boolean }> {
  const result = await db.transaction(async (tx) => {
    const c = await lockCase(tx, caseId)
    assertCaseWritable(c)
    const rx = await currentRx(tx, caseId)
    if (!rx) throw new EtabibError('no_prescription', 'Write the prescription first', 409)
    if (rx.workflowStatus === 'FINALIZED') return { prescription: rx, changed: false } // double click
    const [{ n }] = (await tx.select({ n: sql<number>`count(*)`.mapWith(Number) }).from(prescriptionItems).where(eq(prescriptionItems.prescriptionId, rx.id))) as [{ n: number }]
    if (!hasContent(rx, n)) throw new EtabibError('prescription_empty', 'Add at least one medicine or a free-text prescription', 400)
    const now = new Date()
    const [locked] = await tx
      .update(prescriptions)
      .set({ workflowStatus: 'FINALIZED', finalizedAt: now, lockedAt: now, signedAt: now, signedBy: doctor.id, updatedAt: now })
      .where(and(eq(prescriptions.id, rx.id), eq(prescriptions.workflowStatus, 'DRAFT')))
      .returning()
    if (!locked) throw new TransitionError('concurrent_modification', 'Prescription was modified concurrently')
    if (rx.amendedFromId) {
      await tx.update(prescriptions).set({ workflowStatus: 'SUPERSEDED', status: 'replaced', replacedById: rx.id, updatedAt: now }).where(eq(prescriptions.id, rx.amendedFromId))
    }
    await updateCaseFields(tx, {
      caseId,
      patch: { prescriptionId: rx.id },
      eventType: 'PRESCRIPTION_FINALIZED',
      actor: doctor,
      metadata: { prescriptionId: rx.id, revision: rx.revision, itemCount: n, ...(rx.amendedFromId ? { amendedFromId: rx.amendedFromId } : {}) },
    })
    return { prescription: locked, changed: true }
  })
  if (result.changed) await renderAndStore(result.prescription.id, doctor).catch(() => undefined) // failure recorded; retried on send
  return result
}

/** Canonical document for rendering (from the database only). */
export async function loadRxDocument(rxId: string): Promise<RxDocument> {
  const [rx] = await db.select().from(prescriptions).where(eq(prescriptions.id, rxId)).limit(1)
  if (!rx || !rx.consultationId) throw new EtabibError('not_found', 'Prescription not found', 404)
  const [c] = await db.select().from(consultationCases).where(eq(consultationCases.id, rx.consultationId)).limit(1)
  if (!c) throw new EtabibError('not_found', 'Consultation not found', 404)
  const items = await db.select().from(prescriptionItems).where(eq(prescriptionItems.prescriptionId, rx.id)).orderBy(asc(prescriptionItems.sortOrder))
  const isV1Doctor = rx.prescribedBy === getV1DoctorUserId()
  const [u] = isV1Doctor ? [] : await db.select({ name: users.displayName }).from(users).where(eq(users.id, rx.prescribedBy)).limit(1)
  const appUrl = getAppUrl()
  const finalized = rx.workflowStatus !== 'DRAFT'
  return {
    rxNumber: rx.rxNumber ?? 'ETB-RX-DRAFT',
    revision: rx.revision,
    status: rx.workflowStatus as RxDocument['status'],
    issuedAt: rx.finalizedAt ?? new Date(),
    doctor: isV1Doctor || !u ? DR_JALALUDDIN : { nameEn: u.name ?? 'eTabeeb doctor', credentialsEn: [], namePs: u.name ?? 'eTabeeb doctor', credentialsPs: [] },
    patient: { name: c.patientName, age: c.age, sex: c.sex, location: c.location, caseRef: c.id.slice(0, 8) },
    vitals: (rx.vitals ?? {}) as RxVitals,
    complaint: c.mainComplaint,
    diagnosis: rx.diagnosis,
    medicines: items.map((i) => ({ name: i.genericName, strength: i.strength, formulation: i.formulation, route: i.route, dose: i.dose, frequency: i.frequency, timing: i.timing, duration: i.duration ?? (i.durationDays ? `${i.durationDays} days` : null), instructions: i.patientInstructions })),
    freeText: rx.freeText,
    investigations: rx.investigations,
    advice: rx.advice,
    followUp: rx.followUp,
    followUpInterval: rx.followUpInterval,
    redFlags: rx.redFlags,
    verifyUrl: finalized && appUrl ? `${appUrl}/rx/${rx.verificationToken}` : null,
    contact: { ...ETABEEB_CONTACT },
  }
}

export const rxImageKey = (rxId: string, page: number) => `rx/${rxId}/page-${page}.png`
export const rxPdfKey = (rxId: string) => `rx/${rxId}/prescription.pdf`

/** Render a FINALIZED revision to PNG page(s) + PDF and store them (idempotent: skipped when already rendered). */
export async function renderAndStore(rxId: string, actor: Actor, opts: { force?: boolean } = {}): Promise<Prescription> {
  const [rx] = await db.select().from(prescriptions).where(eq(prescriptions.id, rxId)).limit(1)
  if (!rx || !rx.consultationId) throw new EtabibError('not_found', 'Prescription not found', 404)
  if (rx.workflowStatus === 'DRAFT') throw new EtabibError('prescription_not_finalized', 'Finalize the prescription first', 409)
  if (rx.renderedAt && rx.imageKeys?.length && rx.pdfKey && !opts.force) return rx
  const c = await loadCase(rx.consultationId)
  try {
    const { renderRx } = await import('./render')
    const out = await renderRx(await loadRxDocument(rx.id))
    const keys = out.pages.map((_, i) => rxImageKey(rx.id, i + 1))
    for (let i = 0; i < out.pages.length; i++) await putFile(keys[i]!, out.pages[i]!)
    await putFile(rxPdfKey(rx.id), out.pdf!)
    const [updated] = await db
      .update(prescriptions)
      .set({ imageKeys: keys, pdfKey: rxPdfKey(rx.id), documentHash: createHash('sha256').update(out.pdf!).digest('hex'), renderedAt: new Date(), renderError: null })
      .where(eq(prescriptions.id, rx.id))
      .returning()
    await recordCaseEvent(db as unknown as Tx, { caseId: c.id, eventType: 'PRESCRIPTION_RENDERED', oldStatus: c.status, newStatus: c.status, actor, metadata: { prescriptionId: rx.id, pages: keys.length } })
    return updated!
  } catch (error) {
    const reason = error instanceof Error ? error.message.slice(0, 150) : 'render failed'
    await db.update(prescriptions).set({ renderError: reason }).where(eq(prescriptions.id, rx.id))
    await recordCaseEvent(db as unknown as Tx, { caseId: c.id, eventType: 'PRESCRIPTION_RENDER_FAILED', oldStatus: c.status, newStatus: c.status, actor, metadata: { prescriptionId: rx.id } })
    console.error(`[etabib:rx] render failed for ${rx.id}: ${reason}`)
    throw new EtabibError('render_failed', 'The prescription document could not be generated. Please try again.', 503)
  }
}

/** Render the current draft (or finalized revision) for on-screen preview — never stored. */
export async function previewPrescription(caseId: string, actor: Staff): Promise<string[]> {
  const rx = await currentRx(db, caseId)
  if (!rx) throw new EtabibError('no_prescription', 'Write the prescription first', 409)
  if (rx.workflowStatus !== 'DRAFT' && rx.imageKeys?.length) {
    const files = await Promise.all(rx.imageKeys.map((k) => getFile(k)))
    if (files.every(Boolean)) return files.map((f) => `data:image/png;base64,${f!.toString('base64')}`)
  }
  const { renderRx } = await import('./render')
  const out = await renderRx(await loadRxDocument(rx.id), { pdf: false })
  const c = await loadCase(caseId)
  await recordCaseEvent(db as unknown as Tx, { caseId, eventType: 'PRESCRIPTION_PREVIEWED', oldStatus: c.status, newStatus: c.status, actor, metadata: { prescriptionId: rx.id } })
  return out.pages.map((p) => `data:image/png;base64,${p.toString('base64')}`)
}

// ------------------------------------------------------------------
// Delivery (WhatsApp) — separate from completion
// ------------------------------------------------------------------

const RESEND_COOLDOWN_MS = 60_000

async function activeVoiceNotes(rxId: string) {
  return db
    .select()
    .from(prescriptionVoiceNotes)
    .where(and(eq(prescriptionVoiceNotes.prescriptionId, rxId), isNull(prescriptionVoiceNotes.deletedAt), eq(prescriptionVoiceNotes.includeInDelivery, true)))
    .orderBy(asc(prescriptionVoiceNotes.createdAt))
}

export interface SendResult {
  case: ConsultationCase
  prescription: Prescription
  jobs: EnqueuedJob[]
  changed: boolean
  /** Internal: LiveKit room to close after commit (send & complete). */
  videoRoomToClose?: string
}

/**
 * Queue the finalized prescription for WhatsApp: image page(s) first, then any
 * included voice note(s). Idempotent per prescription page/voice note (a double
 * click, refresh or retry never produces a second message). Does NOT end the call.
 */
export async function sendPrescription(caseId: string, doctor: Doctor, opts: { complete?: boolean } = {}): Promise<SendResult> {
  const pre = await currentRx(db, caseId)
  if (!pre || pre.workflowStatus !== 'FINALIZED') throw new EtabibError('prescription_not_finalized', 'Finalize the prescription before sending it', 409)
  const rendered = pre.renderedAt && pre.imageKeys?.length ? pre : await renderAndStore(pre.id, doctor)
  const voices = await activeVoiceNotes(rendered.id)

  const result = await db.transaction(async (tx) => {
    const c = await lockCase(tx, caseId)
    if (c.status !== 'IN_CONSULTATION') {
      throw new TransitionError('invalid_status', c.status === 'CONFIRMED' ? 'Start the consultation before sending the prescription' : `Prescription cannot be sent while case is ${c.status}`)
    }
    const recipient = c.whatsappPhone ?? c.patientPhone
    const jobs: EnqueuedJob[] = []
    const pages = rendered.imageKeys!.length
    for (let page = 1; page <= pages; page++) {
      jobs.push(await enqueueOutboundJob(tx, { type: 'PRESCRIPTION_IMAGE', consultationId: caseId, dedupeKey: `${rendered.id}:page:${page}`, recipientPhone: recipient, prescriptionId: rendered.id, page, pages, withVoice: voices.length > 0 }))
    }
    const imageJobIds = jobs.map((j) => j.id)
    for (const v of voices) {
      jobs.push(await enqueueOutboundJob(tx, { type: 'PRESCRIPTION_VOICE', consultationId: caseId, dedupeKey: `${rendered.id}:voice:${v.id}`, recipientPhone: recipient, prescriptionId: rendered.id, voiceNoteId: v.id, dependsOn: imageJobIds }))
    }
    const created = jobs.filter((j) => j.created)
    const now = new Date()
    let updatedCase = c
    if (created.length > 0 || !c.prescriptionSentAt) {
      if (!rendered.deliveryRequestedAt) await tx.update(prescriptions).set({ deliveryRequestedAt: now }).where(eq(prescriptions.id, rendered.id))
      updatedCase = await updateCaseFields(tx, {
        caseId,
        patch: { prescriptionSentAt: c.prescriptionSentAt ?? now },
        eventType: 'PRESCRIPTION_DELIVERY_REQUESTED',
        actor: doctor,
        metadata: { prescriptionId: rendered.id, revision: rendered.revision, images: pages, voiceNotes: voices.length, newJobs: created.length },
      })
    }
    let videoRoomToClose: string | undefined
    if (opts.complete) {
      const done = await completeTx(tx, caseId, doctor, jobs[0]!.id)
      updatedCase = done.case
      videoRoomToClose = done.videoRoomToClose
    }
    return { case: updatedCase, prescription: rendered, jobs, changed: created.length > 0 || Boolean(opts.complete), ...(videoRoomToClose ? { videoRoomToClose } : {}) }
  })
  return result
}

/** Queue only the voice note(s) recorded after the prescription was already sent. */
export async function sendVoiceNotes(caseId: string, doctor: Doctor): Promise<{ jobs: EnqueuedJob[] }> {
  const rx = await currentRx(db, caseId)
  if (!rx || rx.workflowStatus !== 'FINALIZED') throw new EtabibError('prescription_not_finalized', 'Finalize the prescription first', 409)
  const voices = await activeVoiceNotes(rx.id)
  if (voices.length === 0) throw new EtabibError('no_voice_note', 'Record a voice explanation first', 409)
  return db.transaction(async (tx) => {
    const c = await lockCase(tx, caseId)
    if (c.status !== 'IN_CONSULTATION') throw new TransitionError('invalid_status', `Voice note cannot be sent while case is ${c.status}`)
    const imageJobs = await tx
      .select({ id: notificationOutbox.id })
      .from(notificationOutbox)
      .where(sql`${notificationOutbox.idempotencyKey} LIKE ${'etabib:PRESCRIPTION_IMAGE:' + rx.id + ':%'}`)
    const jobs: EnqueuedJob[] = []
    for (const v of voices) {
      jobs.push(await enqueueOutboundJob(tx, { type: 'PRESCRIPTION_VOICE', consultationId: caseId, dedupeKey: `${rx.id}:voice:${v.id}`, recipientPhone: c.whatsappPhone ?? c.patientPhone, prescriptionId: rx.id, voiceNoteId: v.id, dependsOn: imageJobs.map((j) => j.id) }))
    }
    if (jobs.some((j) => j.created)) {
      await recordCaseEvent(tx, { caseId, eventType: 'PRESCRIPTION_DELIVERY_REQUESTED', oldStatus: c.status, newStatus: c.status, actor: doctor, metadata: { prescriptionId: rx.id, voiceNotes: jobs.filter((j) => j.created).length, voiceOnly: true } })
    }
    return { jobs }
  })
}

/** Staff "resend": a new copy of the already-rendered image(s) (never re-rendered, never re-edited). */
export async function resendPrescription(caseId: string, actor: Staff): Promise<{ jobs: EnqueuedJob[]; changed: boolean }> {
  const rx = await currentRx(db, caseId)
  if (!rx || rx.workflowStatus !== 'FINALIZED' || !rx.imageKeys?.length) throw new EtabibError('prescription_not_sent', 'There is no finalized, rendered prescription to resend', 409)
  return db.transaction(async (tx) => {
    const c = await lockCase(tx, caseId)
    const [recent] = await tx
      .select({ id: notificationOutbox.id })
      .from(notificationOutbox)
      .where(sql`${notificationOutbox.idempotencyKey} LIKE ${'etabib:PRESCRIPTION_IMAGE:' + rx.id + ':resend:%'} AND ${notificationOutbox.createdAt} > now() - make_interval(secs => ${RESEND_COOLDOWN_MS / 1000})`)
      .limit(1)
    if (recent) return { jobs: [], changed: false }
    const stamp = Date.now()
    const jobs: EnqueuedJob[] = []
    for (let page = 1; page <= rx.imageKeys!.length; page++) {
      jobs.push(await enqueueOutboundJob(tx, { type: 'PRESCRIPTION_IMAGE', consultationId: caseId, dedupeKey: `${rx.id}:resend:${stamp}:page:${page}`, recipientPhone: c.whatsappPhone ?? c.patientPhone, prescriptionId: rx.id, page, pages: rx.imageKeys!.length }))
    }
    await recordCaseEvent(tx, { caseId, eventType: 'PRESCRIPTION_RESEND_REQUESTED', oldStatus: c.status, newStatus: c.status, actor, metadata: { prescriptionId: rx.id, pages: jobs.length } })
    return { jobs, changed: true }
  })
}

// ------------------------------------------------------------------
// Completion (explicit doctor action)
// ------------------------------------------------------------------

async function completeTx(tx: Tx, caseId: string, doctor: Doctor, deliveryJobId: string): Promise<{ case: ConsultationCase; videoRoomToClose?: string }> {
  let c = await lockCase(tx, caseId)
  if (c.status === 'COMPLETED') return { case: c }
  c = await transitionCase(tx, { caseId, to: 'PRESCRIPTION_SENT', expectedFrom: 'IN_CONSULTATION', actor: doctor, evidence: { prescriptionDeliveryJobId: deliveryJobId }, metadata: { outboundJobId: deliveryJobId, prescriptionId: c.prescriptionId } })
  c = await transitionCase(tx, { caseId, to: 'COMPLETED', expectedFrom: 'PRESCRIPTION_SENT', actor: doctor })
  const ended = await endVideoSessionTx(tx, c, doctor)
  return { case: c, ...(ended?.status === 'ENDED' ? { videoRoomToClose: ended.roomName } : {}) }
}

/**
 * The doctor deliberately ends the consultation (after the prescription was
 * sent): case → COMPLETED, patient links revoked, video room closed.
 */
export async function completeConsultation(caseId: string, doctor: Doctor): Promise<{ case: ConsultationCase; changed: boolean; videoRoomToClose?: string }> {
  return db.transaction(async (tx) => {
    const c = await lockCase(tx, caseId)
    if (c.status === 'COMPLETED') return { case: c, changed: false }
    if (c.status !== 'IN_CONSULTATION') throw new TransitionError('invalid_status', `Consultation cannot be completed while case is ${c.status}`)
    const rx = await currentRx(tx, caseId)
    if (!rx || rx.workflowStatus !== 'FINALIZED' || rx.id !== c.prescriptionId) throw new EtabibError('prescription_not_finalized', 'Finalize and send the prescription before completing the consultation', 409)
    const [job] = await tx
      .select({ id: notificationOutbox.id })
      .from(notificationOutbox)
      .where(sql`${notificationOutbox.idempotencyKey} LIKE ${'etabib:PRESCRIPTION_IMAGE:' + rx.id + ':%'}`)
      .orderBy(asc(notificationOutbox.createdAt))
      .limit(1)
    if (!job || !c.prescriptionSentAt) throw new EtabibError('prescription_not_sent', 'Send the prescription before completing the consultation', 409)
    const done = await completeTx(tx, caseId, doctor, job.id)
    return { ...done, changed: true }
  })
}

// ------------------------------------------------------------------
// Voice explanation
// ------------------------------------------------------------------

export async function addVoiceNote(
  caseId: string,
  doctor: Doctor,
  upload: { data: Buffer; mimeType: string },
): Promise<typeof prescriptionVoiceNotes.$inferSelect> {
  const { AudioError, VOICE_INPUT_TYPES, VOICE_MAX_BYTES, VOICE_MAX_SECONDS, VOICE_MIN_SECONDS, baseMime, probeDurationMs, transcodeToVoiceOgg } = await import('./audio')
  const { storagePath } = await import('../storage')
  const mime = baseMime(upload.mimeType)
  const ext = VOICE_INPUT_TYPES[mime]
  if (!ext) throw new EtabibError('invalid_audio', 'Unsupported audio format', 400)
  if (upload.data.length === 0 || upload.data.length > VOICE_MAX_BYTES) throw new EtabibError('invalid_audio', 'The recording is empty or too large (max 10 MB)', 400)
  const c = await loadCase(caseId)
  if (!['CONFIRMED', 'IN_CONSULTATION'].includes(c.status)) throw new TransitionError('invalid_status', `Voice note cannot be added while case is ${c.status}`)
  const rx = await currentRx(db, caseId)
  if (!rx) throw new EtabibError('no_prescription', 'Save the prescription draft first', 409)
  const id = randomBytes(12).toString('hex')
  const originalKey = `voice/${rx.id}/${id}-original.${ext}`
  const audioKey = `voice/${rx.id}/${id}.ogg`
  await putFile(originalKey, upload.data)
  let durationMs: number
  try {
    durationMs = await probeDurationMs(storagePath(originalKey))
    if (durationMs < VOICE_MIN_SECONDS * 1000) throw new AudioError('audio_too_short', 'The recording is too short')
    if (durationMs > VOICE_MAX_SECONDS * 1000 + 999) throw new AudioError('audio_too_long', 'The recording is longer than 5 minutes')
    await transcodeToVoiceOgg(storagePath(originalKey), storagePath(audioKey))
  } catch (error) {
    if (error instanceof AudioError) throw new EtabibError(error.code, error.message, 400)
    throw error
  }
  const converted = await getFile(audioKey)
  if (!converted || converted.length === 0) throw new EtabibError('audio_conversion_failed', 'Audio conversion failed', 500)
  return db.transaction(async (tx) => {
    const locked = await lockCase(tx, caseId)
    const [row] = await tx
      .insert(prescriptionVoiceNotes)
      .values({ prescriptionId: rx.id, originalKey, originalMimeType: mime, audioKey, mimeType: 'audio/ogg', sizeBytes: converted.length, durationMs, createdBy: doctor.id })
      .returning()
    await recordCaseEvent(tx, { caseId, eventType: 'PRESCRIPTION_VOICE_RECORDED', oldStatus: locked.status, newStatus: locked.status, actor: doctor, metadata: { prescriptionId: rx.id, voiceNoteId: row!.id, durationMs } })
    return row!
  })
}

async function voiceForCase(caseId: string, voiceId: string) {
  const [v] = await db
    .select({ v: prescriptionVoiceNotes })
    .from(prescriptionVoiceNotes)
    .innerJoin(prescriptions, eq(prescriptions.id, prescriptionVoiceNotes.prescriptionId))
    .where(and(eq(prescriptionVoiceNotes.id, voiceId), eq(prescriptions.consultationId, caseId)))
    .limit(1)
  if (!v) throw new EtabibError('not_found', 'Voice note not found', 404)
  return v.v
}

/** Delete (soft) or toggle a voice note — only while it has not been handed to WhatsApp. */
export async function updateVoiceNote(caseId: string, voiceId: string, doctor: Doctor, change: { delete?: boolean; includeInDelivery?: boolean }) {
  const v = await voiceForCase(caseId, voiceId)
  if (v.deletedAt) return v
  const [job] = await db
    .select({ status: notificationOutbox.status })
    .from(notificationOutbox)
    .where(sql`${notificationOutbox.idempotencyKey} LIKE ${'etabib:PRESCRIPTION_VOICE:%:voice:' + voiceId} AND ${notificationOutbox.status} NOT IN ('failed', 'cancelled')`)
    .limit(1)
  if (job) throw new EtabibError('voice_already_sent', 'This voice note was already sent to the patient', 409)
  return db.transaction(async (tx) => {
    const c = await lockCase(tx, caseId)
    const [row] = await tx
      .update(prescriptionVoiceNotes)
      .set(change.delete ? { deletedAt: new Date() } : { includeInDelivery: Boolean(change.includeInDelivery) })
      .where(eq(prescriptionVoiceNotes.id, voiceId))
      .returning()
    if (change.delete) {
      await recordCaseEvent(tx, { caseId, eventType: 'PRESCRIPTION_VOICE_DELETED', oldStatus: c.status, newStatus: c.status, actor: doctor, metadata: { voiceNoteId: voiceId } })
    }
    return row!
  })
}

export async function voiceAudioForCase(caseId: string, voiceId: string): Promise<{ data: Buffer; mimeType: string } | null> {
  const v = await voiceForCase(caseId, voiceId)
  const data = await getFile(v.originalKey)
  return data ? { data, mimeType: v.originalMimeType } : null
}

// ------------------------------------------------------------------
// Read models
// ------------------------------------------------------------------

async function loadCase(caseId: string): Promise<ConsultationCase> {
  const [c] = await db.select().from(consultationCases).where(eq(consultationCases.id, caseId)).limit(1)
  if (!c) throw new EtabibError('not_found', 'Consultation not found', 404)
  return c
}

/**
 * Finalized prescriptions from the same patient's OTHER consultations, matched on
 * the patient's own WhatsApp number only (a contact phone can be shared by family).
 */
export async function previousPrescriptions(c: ConsultationCase) {
  if (!c.whatsappPhone) return []
  return db
    .select({ id: prescriptions.id, rxNumber: prescriptions.rxNumber, revision: prescriptions.revision, finalizedAt: prescriptions.finalizedAt, caseId: consultationCases.id, status: prescriptions.workflowStatus })
    .from(prescriptions)
    .innerJoin(consultationCases, eq(consultationCases.id, prescriptions.consultationId))
    .where(
      and(
        ne(consultationCases.id, c.id),
        inArray(prescriptions.workflowStatus, ['FINALIZED', 'SUPERSEDED']),
        eq(consultationCases.whatsappPhone, c.whatsappPhone),
      ),
    )
    .orderBy(desc(prescriptions.finalizedAt))
    .limit(20)
}

export interface RxDeliveryRow {
  jobId: string
  kind: 'image' | 'voice' | 'text'
  page: number | null
  voiceNoteId: string | null
  status: string
  attempts: number
  lastError: string | null
  sentAt: Date | null
  deliveredAt: Date | null
  readAt: Date | null
  canRetry: boolean
  createdAt: Date
}

export async function prescriptionState(caseId: string, opts: { forAdmin?: boolean } = {}) {
  const c = await loadCase(caseId)
  const revisions = await db.select().from(prescriptions).where(eq(prescriptions.consultationId, caseId)).orderBy(desc(prescriptions.revision))
  const current = revisions.find((r) => r.workflowStatus !== 'SUPERSEDED') ?? null
  const items = current ? await db.select().from(prescriptionItems).where(eq(prescriptionItems.prescriptionId, current.id)).orderBy(asc(prescriptionItems.sortOrder)) : []
  const voices = current
    ? await db.select().from(prescriptionVoiceNotes).where(and(eq(prescriptionVoiceNotes.prescriptionId, current.id), isNull(prescriptionVoiceNotes.deletedAt))).orderBy(asc(prescriptionVoiceNotes.createdAt))
    : []
  const rxIds = revisions.map((r) => r.id)
  const jobs = rxIds.length
    ? await db
        .select()
        .from(notificationOutbox)
        .where(and(inArray(notificationOutbox.templateKey, ['PRESCRIPTION_IMAGE', 'PRESCRIPTION_VOICE', 'PRESCRIPTION_READY']), sql`(${notificationOutbox.templateVariables}::jsonb ->> 'consultationId') = ${caseId}`))
        .orderBy(asc(notificationOutbox.createdAt))
    : []
  const deliveries: RxDeliveryRow[] = jobs.map((j) => {
    const refs = JSON.parse(j.templateVariables ?? '{}') as { page?: number; voiceNoteId?: string }
    return {
      jobId: j.id,
      kind: j.templateKey === 'PRESCRIPTION_VOICE' ? 'voice' : j.templateKey === 'PRESCRIPTION_IMAGE' ? 'image' : 'text',
      page: refs.page ?? null,
      voiceNoteId: refs.voiceNoteId ?? null,
      status: j.status,
      attempts: j.attempts,
      lastError: j.lastError,
      sentAt: j.processedAt,
      deliveredAt: j.deliveredAt,
      readAt: j.readAt,
      canRetry: j.status === 'failed' || (j.status === 'pending' && j.attempts >= j.maxAttempts),
      createdAt: j.createdAt,
    }
  })
  const [{ last } = { last: null }] = c.whatsappPhone
    ? await db.select({ last: max(whatsappEvents.createdAt) }).from(whatsappEvents).where(eq(whatsappEvents.senderPhone, c.whatsappPhone))
    : [{ last: null }]
  return {
    caseStatus: c.status,
    patient: { name: c.patientName, age: c.age, sex: c.sex, location: c.location, complaint: c.mainComplaint },
    current: current
      ? {
          id: current.id,
          rxNumber: current.rxNumber,
          revision: current.revision,
          status: current.workflowStatus,
          finalizedAt: current.finalizedAt,
          renderedAt: current.renderedAt,
          renderError: current.renderError,
          pages: current.imageKeys?.length ?? 0,
          hasPdf: Boolean(current.pdfKey),
          deliveryRequestedAt: current.deliveryRequestedAt,
          amendedFromId: current.amendedFromId,
          // clinical content: the doctor edits it; the admin only reads it
          content: {
            diagnosis: current.diagnosis,
            vitals: current.vitals ?? {},
            freeText: current.freeText,
            investigations: current.investigations,
            advice: current.advice,
            followUp: current.followUp,
            followUpInterval: current.followUpInterval,
            redFlags: current.redFlags,
            medicines: items.map((i) => ({ name: i.genericName, strength: i.strength, formulation: i.formulation, route: i.route, dose: i.dose, frequency: i.frequency, timing: i.timing, duration: i.duration ?? (i.durationDays ? `${i.durationDays} days` : null), instructions: i.patientInstructions })),
          },
        }
      : null,
    revisions: revisions.map((r) => ({ id: r.id, rxNumber: r.rxNumber, revision: r.revision, status: r.workflowStatus, finalizedAt: r.finalizedAt, pages: r.imageKeys?.length ?? 0, hasPdf: Boolean(r.pdfKey) })),
    voiceNotes: voices.map((v) => ({ id: v.id, durationMs: v.durationMs, includeInDelivery: v.includeInDelivery, createdAt: v.createdAt, sizeBytes: v.sizeBytes })),
    deliveries,
    whatsappWindowOpen: Boolean(last && Date.now() - new Date(last).getTime() < WINDOW_MS),
    previous: opts.forAdmin ? [] : await previousPrescriptions(c),
  }
}

/** Meta's customer-service window, with a safety margin. */
export const WINDOW_MS = 23.5 * 3600_000

/** Stored file for an authorized staff download (rxId must belong to the case). */
export async function prescriptionFile(caseId: string, rxId: string, kind: 'pdf' | 'image', page = 1): Promise<{ data: Buffer; contentType: string; filename: string } | null> {
  const [rx] = await db.select().from(prescriptions).where(and(eq(prescriptions.id, rxId), eq(prescriptions.consultationId, caseId))).limit(1)
  if (!rx || rx.workflowStatus === 'DRAFT') return null
  const key = kind === 'pdf' ? rx.pdfKey : rx.imageKeys?.[page - 1]
  if (!key) return null
  const data = await getFile(key)
  if (!data) return null
  const base = `${rx.rxNumber ?? 'prescription'}${rx.revision > 1 ? `-rev${rx.revision}` : ''}`
  return kind === 'pdf' ? { data, contentType: 'application/pdf', filename: `${base}.pdf` } : { data, contentType: 'image/png', filename: `${base}-page-${page}.png` }
}

/** Minimal public verification (QR): no patient, diagnosis or medication data. */
export async function verifyPrescriptionToken(token: string) {
  if (!/^[A-Za-z0-9_-]{16,64}$/.test(token)) return null
  const [rx] = await db
    .select({ rxNumber: prescriptions.rxNumber, revision: prescriptions.revision, status: prescriptions.workflowStatus, finalizedAt: prescriptions.finalizedAt, prescribedBy: prescriptions.prescribedBy, consultationId: prescriptions.consultationId })
    .from(prescriptions)
    .where(eq(prescriptions.verificationToken, token))
    .limit(1)
  if (!rx || !rx.consultationId || rx.status === 'DRAFT') return null
  const isV1 = rx.prescribedBy === getV1DoctorUserId()
  const [u] = isV1 ? [] : await db.select({ name: users.displayName }).from(users).where(eq(users.id, rx.prescribedBy)).limit(1)
  return { rxNumber: rx.rxNumber, revision: rx.revision, status: rx.status as 'FINALIZED' | 'SUPERSEDED', issuedAt: rx.finalizedAt, doctor: isV1 ? DR_JALALUDDIN.nameEn : (u?.name ?? 'eTabeeb doctor') }
}
