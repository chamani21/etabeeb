/**
 * eTabib V1 — read models for the staff dashboards (P1). Server-side only.
 * Writes never happen here; every state change goes through cases.ts.
 */
import { db } from '@etabeeb/db'
import {
  caseEvents,
  consultationCases,
  etabibRuntimeStatus,
  integrationErrors,
  notificationOutbox,
  prescriptionItems,
  prescriptions,
  users,
  whatsappAllowedSenders,
  whatsappEvents,
} from '@etabeeb/db/schema'
import type { ConsultationCase } from '@etabeeb/db'
import { and, asc, desc, eq, gt, ilike, inArray, ne, or, sql, type SQL } from 'drizzle-orm'
import { EtabibError } from './errors'
import { JOB_AUDIENCE, isOutboundJobType, parseJobRefs } from './outbound'
import { getAdminWhatsapp, getDoctorWhatsapp, getEnvironmentLabel, getWhatsappDisplayNumber } from './config'
import { getInboundPolicy } from './inbound-policy'
import { getApprovedTemplates } from './templates'
import { maskPhone } from './staff-audit'
import { CONSULTATION_STATUSES, type ConsultationStatus } from './transitions'

const OPEN_STATUSES = CONSULTATION_STATUSES.filter((s) => s !== 'COMPLETED')

// ------------------------------------------------------------------
// Outbox health per case
// ------------------------------------------------------------------

const caseIdOfJob = sql<string>`(${notificationOutbox.templateVariables}::jsonb ->> 'consultationId')`
const etabibJob = sql`${notificationOutbox.idempotencyKey} LIKE 'etabib:%'`

interface CaseWarning {
  failed: number
  stuck: number
}

async function warningsFor(caseIds: string[]): Promise<Map<string, CaseWarning>> {
  const map = new Map<string, CaseWarning>()
  if (caseIds.length === 0) return map
  const rows = await db
    .select({
      caseId: caseIdOfJob,
      failed: sql<number>`count(*) filter (where ${notificationOutbox.status} = 'failed')`.mapWith(Number),
      stuck: sql<number>`count(*) filter (where ${notificationOutbox.status} = 'pending' and ${notificationOutbox.attempts} > 0)`.mapWith(Number),
    })
    .from(notificationOutbox)
    .where(and(etabibJob, inArray(caseIdOfJob, caseIds)))
    .groupBy(caseIdOfJob)
  for (const r of rows) map.set(r.caseId, { failed: r.failed, stuck: r.stuck })
  return map
}

function warningText(w: CaseWarning | undefined): string | null {
  if (!w) return null
  if (w.failed > 0) return `${w.failed} WhatsApp message(s) failed`
  if (w.stuck > 0) return `${w.stuck} WhatsApp message(s) not yet delivered to n8n`
  return null
}

// ------------------------------------------------------------------
// Admin
// ------------------------------------------------------------------

export interface AdminCaseRow {
  id: string
  status: ConsultationStatus
  patientName: string | null
  patientPhone: string | null
  whatsappPhone: string | null
  createdAt: Date
  updatedAt: Date
  paymentReceived: boolean
  doctorDecision: string | null
  proposedConsultationTime: Date | null
  doctorApprovedTime: Date | null
  warning: string | null
}

export async function listCasesForAdmin(filter: { status: ConsultationStatus | 'OPEN' | 'ALL'; q?: string | undefined }): Promise<AdminCaseRow[]> {
  const conditions: SQL[] = []
  if (filter.status === 'OPEN') conditions.push(ne(consultationCases.status, 'COMPLETED'))
  else if (filter.status !== 'ALL') conditions.push(eq(consultationCases.status, filter.status))
  const q = filter.q?.trim()
  if (q) {
    const digits = q.replace(/\D/g, '')
    const ors: SQL[] = [ilike(consultationCases.patientName, `%${q.replace(/[%_]/g, '')}%`)]
    if (/^[0-9a-f-]{4,36}$/i.test(q)) ors.push(sql`${consultationCases.id}::text ILIKE ${q.toLowerCase() + '%'}`)
    if (digits.length >= 4) {
      const tail = digits.startsWith('0') ? digits.slice(1) : digits
      ors.push(sql`regexp_replace(coalesce(${consultationCases.patientPhone}, ''), '\\D', '', 'g') LIKE ${'%' + tail + '%'}`)
      ors.push(sql`regexp_replace(coalesce(${consultationCases.whatsappPhone}, ''), '\\D', '', 'g') LIKE ${'%' + tail + '%'}`)
    }
    conditions.push(or(...ors)!)
  }
  const rows = await db
    .select()
    .from(consultationCases)
    .where(conditions.length ? and(...conditions) : undefined)
    .orderBy(desc(consultationCases.updatedAt))
    .limit(200)
  const warnings = await warningsFor(rows.map((r) => r.id))
  return rows.map((c) => ({
    id: c.id,
    status: c.status,
    patientName: c.patientName,
    patientPhone: c.patientPhone,
    whatsappPhone: c.whatsappPhone,
    createdAt: c.createdAt,
    updatedAt: c.updatedAt,
    paymentReceived: c.paymentReceived,
    doctorDecision: c.doctorDecision,
    proposedConsultationTime: c.proposedConsultationTime,
    doctorApprovedTime: c.doctorApprovedTime,
    warning: warningText(warnings.get(c.id)),
  }))
}

export async function statusCounts(): Promise<Record<string, number>> {
  const rows = await db
    .select({ status: consultationCases.status, n: sql<number>`count(*)`.mapWith(Number) })
    .from(consultationCases)
    .groupBy(consultationCases.status)
  return Object.fromEntries(rows.map((r) => [r.status, r.n]))
}

async function loadCase(id: string): Promise<ConsultationCase> {
  const [c] = await db.select().from(consultationCases).where(eq(consultationCases.id, id)).limit(1)
  if (!c) throw new EtabibError('not_found', 'Consultation not found', 404)
  return c
}

async function loadPrescription(prescriptionId: string | null) {
  if (!prescriptionId) return null
  const [rx] = await db.select().from(prescriptions).where(eq(prescriptions.id, prescriptionId)).limit(1)
  if (!rx) return null
  const items = await db
    .select()
    .from(prescriptionItems)
    .where(eq(prescriptionItems.prescriptionId, rx.id))
    .orderBy(asc(prescriptionItems.sortOrder))
  return {
    number: rx.publicId.slice(0, 8).toUpperCase(),
    signedAt: rx.signedAt,
    diagnosis: rx.diagnosis,
    investigations: rx.investigations,
    advice: rx.advice,
    followUp: rx.followUp,
    notes: rx.notes,
    items: items.map((i) => ({
      genericName: i.genericName,
      strength: i.strength,
      formulation: i.formulation,
      dose: i.dose,
      frequency: i.frequency,
      timing: i.timing,
      durationDays: i.durationDays,
      patientInstructions: i.patientInstructions,
    })),
  }
}

async function outboxForCase(caseId: string) {
  const jobs = await db
    .select()
    .from(notificationOutbox)
    .where(and(etabibJob, eq(caseIdOfJob, caseId)))
    .orderBy(asc(notificationOutbox.createdAt))
  return jobs.map((j) => {
    const audience = isOutboundJobType(j.templateKey) ? JOB_AUDIENCE[j.templateKey] : 'PATIENT'
    const to =
      audience === 'ADMIN' ? getAdminWhatsapp() : audience === 'DOCTOR' ? getDoctorWhatsapp() : j.recipientPhone
    const canRetry = j.status === 'failed' || (j.status === 'pending' && j.attempts >= j.maxAttempts)
    return {
      id: j.id,
      type: j.templateKey,
      audience,
      to: maskPhone(to),
      status: j.status,
      attempts: j.attempts,
      providerMessageId: j.providerMessageId,
      lastError: j.lastError,
      createdAt: j.createdAt,
      processedAt: j.processedAt,
      canRetry,
      refs: parseJobRefs(j.templateVariables) ? undefined : 'invalid',
    }
  })
}

export async function getCaseDetailForAdmin(id: string) {
  const c = await loadCase(id)
  const events = await db
    .select()
    .from(caseEvents)
    .where(eq(caseEvents.consultationId, id))
    .orderBy(asc(caseEvents.createdAt), asc(caseEvents.id))
  const actorIds = [...new Set([c.paymentConfirmedBy, ...events.map((e) => e.actorId)].filter((v): v is string => !!v && /^[0-9a-f-]{36}$/.test(v)))]
  const names = actorIds.length
    ? await db.select({ id: users.id, name: users.displayName }).from(users).where(inArray(users.id, actorIds))
    : []
  const nameOf = (uid: string | null) => (uid ? (names.find((n) => n.id === uid)?.name ?? 'Staff user') : null)
  return {
    case: { ...c, paymentConfirmedByName: nameOf(c.paymentConfirmedBy) },
    events: events.map((e) => ({
      id: e.id,
      eventType: e.eventType,
      oldStatus: e.oldStatus,
      newStatus: e.newStatus,
      actorType: e.actorType,
      actorName: nameOf(e.actorId),
      createdAt: e.createdAt,
    })),
    outbox: await outboxForCase(id),
    prescription: await loadPrescription(c.prescriptionId),
    documents: [] as Array<never>, // V1 cases have no uploaded documents yet
  }
}

// ------------------------------------------------------------------
// Doctor (clinical view only — no payment amount/reference/confirmer)
// ------------------------------------------------------------------

function clinicalView(c: ConsultationCase) {
  return {
    id: c.id,
    status: c.status,
    patientName: c.patientName,
    age: c.age,
    sex: c.sex,
    consultationFor: c.consultationFor,
    location: c.location,
    mainComplaint: c.mainComplaint,
    medicalHistory: c.medicalHistory,
    proposedConsultationTime: c.proposedConsultationTime,
    doctorDecision: c.doctorDecision,
    doctorApprovedTime: c.doctorApprovedTime,
    doctorDecisionAt: c.doctorDecisionAt,
    consultationLink: c.consultationLink,
    hasPrescription: Boolean(c.prescriptionId),
    prescriptionSentAt: c.prescriptionSentAt,
    createdAt: c.createdAt,
    updatedAt: c.updatedAt,
  }
}

export async function listCasesForDoctor() {
  const active = await db
    .select()
    .from(consultationCases)
    .where(inArray(consultationCases.status, ['AWAITING_DOCTOR_APPROVAL', 'CONFIRMED', 'IN_CONSULTATION']))
    .orderBy(asc(consultationCases.proposedConsultationTime), asc(consultationCases.createdAt))
  const recent = await db
    .select()
    .from(consultationCases)
    .where(and(inArray(consultationCases.status, ['PRESCRIPTION_SENT', 'COMPLETED']), gt(consultationCases.updatedAt, new Date(Date.now() - 30 * 86_400_000))))
    .orderBy(desc(consultationCases.updatedAt))
    .limit(20)
  const by = (s: ConsultationStatus) => active.filter((c) => c.status === s).map(clinicalView)
  return {
    pendingApproval: by('AWAITING_DOCTOR_APPROVAL'),
    confirmed: by('CONFIRMED'),
    inConsultation: by('IN_CONSULTATION'),
    recentlyCompleted: recent.map(clinicalView),
  }
}

/** Statuses visible to the doctor (the case reached the doctor's workflow). */
const DOCTOR_VISIBLE: readonly ConsultationStatus[] = ['AWAITING_DOCTOR_APPROVAL', 'CONFIRMED', 'IN_CONSULTATION', 'PRESCRIPTION_SENT', 'COMPLETED']

export async function getCaseDetailForDoctor(id: string) {
  const c = await loadCase(id)
  if (!DOCTOR_VISIBLE.includes(c.status)) throw new EtabibError('not_found', 'Consultation not found', 404)
  const events = await db
    .select({ eventType: caseEvents.eventType, newStatus: caseEvents.newStatus, actorType: caseEvents.actorType, createdAt: caseEvents.createdAt })
    .from(caseEvents)
    .where(eq(caseEvents.consultationId, id))
    .orderBy(asc(caseEvents.createdAt), asc(caseEvents.id))
  const delivery = (await outboxForCase(id))
    .filter((j) => j.type === 'PRESCRIPTION_READY')
    .map((j) => ({ status: j.status, delivered: Boolean(j.providerMessageId), lastError: j.lastError, processedAt: j.processedAt }))
  return {
    case: clinicalView(c),
    events: events.filter((e) => !e.eventType.startsWith('PAYMENT')),
    prescription: await loadPrescription(c.prescriptionId),
    prescriptionDelivery: delivery[delivery.length - 1] ?? null,
    documents: [] as Array<never>,
    deliveryMode: 'text' as const,
  }
}

// ------------------------------------------------------------------
// Operational status (admin control panel, read-only)
// ------------------------------------------------------------------

export const SCHEDULER_STATUS_KEY = 'scheduler_last_dispatch'

export async function recordSchedulerHeartbeat(result: { attempted: number; dispatched: number }): Promise<void> {
  const value = { at: new Date().toISOString(), attempted: result.attempted, dispatched: result.dispatched }
  await db
    .insert(etabibRuntimeStatus)
    .values({ key: SCHEDULER_STATUS_KEY, value, updatedAt: new Date() })
    .onConflictDoUpdate({ target: etabibRuntimeStatus.key, set: { value, updatedAt: new Date() } })
}

export async function getOperationalStatus() {
  const policy = getInboundPolicy()
  const [heartbeat] = await db.select().from(etabibRuntimeStatus).where(eq(etabibRuntimeStatus.key, SCHEDULER_STATUS_KEY)).limit(1)
  const outboxCounts = await db
    .select({ status: notificationOutbox.status, n: sql<number>`count(*)`.mapWith(Number) })
    .from(notificationOutbox)
    .where(etabibJob)
    .groupBy(notificationOutbox.status)
  const count = (s: string) => outboxCounts.find((r) => r.status === s)?.n ?? 0
  const since = new Date(Date.now() - 86_400_000)
  const gate = await db
    .select({ disposition: whatsappEvents.disposition, n: sql<number>`count(*)`.mapWith(Number) })
    .from(whatsappEvents)
    .where(gt(whatsappEvents.createdAt, since))
    .groupBy(whatsappEvents.disposition)
  const errors = await db
    .select({ workflowName: integrationErrors.workflowName, node: integrationErrors.node, errorMessage: integrationErrors.errorMessage, occurredAt: integrationErrors.occurredAt })
    .from(integrationErrors)
    .orderBy(desc(integrationErrors.occurredAt))
    .limit(10)
  const senders = await db
    .select({ purpose: whatsappAllowedSenders.purpose, n: sql<number>`count(*)`.mapWith(Number) })
    .from(whatsappAllowedSenders)
    .where(eq(whatsappAllowedSenders.active, true))
    .groupBy(whatsappAllowedSenders.purpose)
  const lastAt = heartbeat ? new Date(String(heartbeat.value.at)) : null
  const ageMin = lastAt ? Math.round((Date.now() - lastAt.getTime()) / 60_000) : null
  return {
    environment: getEnvironmentLabel(),
    whatsappNumber: getWhatsappDisplayNumber(),
    inbound: { enabled: policy.enabled, mode: policy.mode, controlledBy: 'environment (read-only in UI)' },
    scheduler: {
      lastDispatchAt: lastAt,
      minutesSinceLastDispatch: ageMin,
      healthy: ageMin !== null && ageMin <= 10,
      lastResult: heartbeat ? { attempted: heartbeat.value.attempted, dispatched: heartbeat.value.dispatched } : null,
    },
    outbox: { pending: count('pending'), processing: count('processing'), failed: count('failed'), sent: count('sent') + count('delivered') + count('read') },
    inboundLast24h: Object.fromEntries(gate.map((g) => [g.disposition ?? 'processed_legacy', g.n])),
    activeSenders: Object.fromEntries(senders.map((s) => [s.purpose, s.n])),
    templatesApproved: Object.entries(getApprovedTemplates()).map(([intent, t]) => ({ intent, name: t!.name, language: t!.language })),
    recentIntegrationErrors: errors,
    openCases: (await db.select({ n: sql<number>`count(*)`.mapWith(Number) }).from(consultationCases).where(inArray(consultationCases.status, [...OPEN_STATUSES])))[0]?.n ?? 0,
  }
}
