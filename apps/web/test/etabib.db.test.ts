/**
 * eTabib V1 — database model, state machine and idempotency (real PostgreSQL).
 * Run with ETABIB_TEST_DATABASE_URL set (see docs/ETABIB_V1_BACKEND.md).
 */
import { describe, it, expect, beforeAll, beforeEach } from 'vitest'
import { db } from '@etabeeb/db'
import { consultationCases, caseEvents, whatsappEvents, notificationOutbox } from '@etabeeb/db/schema'
import { eq, sql } from 'drizzle-orm'
import { createCase, transitionCase, type Actor, type ConsultationStatus, type CasePatch } from '@/lib/etabib/transitions'
import { TransitionError } from '@/lib/etabib/errors'
import { processInboundMessage } from '@/lib/etabib/whatsapp'
import { confirmPayment, applyDoctorDecision, applyOutboundResult } from '@/lib/etabib/cases'
import {
  hasTestDb,
  resetDb,
  createUser,
  fakePhone,
  inbound,
  getCase,
  eventsFor,
  jobsOfType,
  caseAt,
  future,
  intake,
} from './helpers'

const SYSTEM: Actor = { type: 'SYSTEM', id: null }

describe.skipIf(!hasTestDb)('eTabib V1 — database model', () => {
  let adminId: string
  beforeEach(async () => {
    await resetDb()
    adminId = await createUser('Synthetic Admin')
  })

  it('1. creates a consultation case in NEW with a CASE_CREATED event', async () => {
    const c = await db.transaction((tx) => createCase(tx, { patientName: 'Synthetic Patient' }, SYSTEM))
    expect(c.status).toBe('NEW')
    expect(c.paymentReceived).toBe(false)
    const events = await eventsFor(c.id)
    expect(events).toHaveLength(1)
    expect(events[0]).toMatchObject({ eventType: 'CASE_CREATED', oldStatus: null, newStatus: 'NEW', actorType: 'SYSTEM' })
  })

  it('2. enforces unique wamid at the database level', async () => {
    await db.insert(whatsappEvents).values({ wamid: 'wamid.DUP', senderPhone: '+923000000001', eventType: 'text' })
    await expect(
      db.insert(whatsappEvents).values({ wamid: 'wamid.DUP', senderPhone: '+923000000001', eventType: 'text' }),
    ).rejects.toThrow()
    const rows = await db.select().from(whatsappEvents).where(eq(whatsappEvents.wamid, 'wamid.DUP'))
    expect(rows).toHaveLength(1)
  })

  it('3. records events for transitions and keeps case_events append-only', async () => {
    const c = await db.transaction((tx) =>
      createCase(tx, { patientName: 'Synthetic Patient', patientPhone: '+923001234567' }, SYSTEM),
    )
    await db.transaction((tx) => transitionCase(tx, { caseId: c.id, to: 'ADMIN_INTAKE', actor: SYSTEM }))
    const events = await eventsFor(c.id)
    expect(events.map((e) => [e.eventType, e.oldStatus, e.newStatus])).toEqual([
      ['CASE_CREATED', null, 'NEW'],
      ['ADMIN_INTAKE_REQUESTED', 'NEW', 'ADMIN_INTAKE'],
    ])
    await expect(db.update(caseEvents).set({ eventType: 'TAMPERED' }).where(eq(caseEvents.consultationId, c.id))).rejects.toThrow(
      /append-only/,
    )
    await expect(db.delete(caseEvents).where(eq(caseEvents.consultationId, c.id))).rejects.toThrow(/append-only/)
  })

  it('DB check constraint blocks CONFIRMED without payment + doctor approval (backstop)', async () => {
    const c = await db.transaction((tx) => createCase(tx, {}, SYSTEM))
    await expect(
      db.execute(sql`UPDATE consultation_cases SET status = 'CONFIRMED' WHERE id = ${c.id}`),
    ).rejects.toThrow()
    expect((await getCase(c.id)).status).toBe('NEW')
  })

  it('allows only one open case per WhatsApp sender', async () => {
    const sender = fakePhone()
    await db.transaction((tx) => createCase(tx, { whatsappPhone: sender }, SYSTEM))
    await expect(db.transaction((tx) => createCase(tx, { whatsappPhone: sender }, SYSTEM))).rejects.toThrow()
  })

  // helper for state-machine tests: a case at `status`, built through the service
  async function at(status: ConsultationStatus): Promise<string> {
    const doctorId = await createUser('Synthetic Doctor')
    if (status === 'NEW') {
      const c = await db.transaction((tx) =>
        createCase(tx, { patientName: 'Synthetic Patient', patientPhone: '+923001234567' }, SYSTEM),
      )
      return c.id
    }
    const map: Partial<Record<ConsultationStatus, Parameters<typeof caseAt>[0]>> = {
      ADMIN_INTAKE: 'ADMIN_INTAKE',
      AWAITING_PAYMENT: 'AWAITING_PAYMENT',
      PAYMENT_RECEIVED: 'PAYMENT_RECEIVED',
      AWAITING_DOCTOR_APPROVAL: 'AWAITING_DOCTOR_APPROVAL',
      CONFIRMED: 'CONFIRMED',
      IN_CONSULTATION: 'IN_CONSULTATION',
    }
    const { id } = await caseAt(map[status]!, { adminId, doctorId })
    return id
  }

  async function tryTransition(caseId: string, to: ConsultationStatus, patch?: CasePatch) {
    return db.transaction((tx) => transitionCase(tx, { caseId, to, actor: SYSTEM, ...(patch ? { patch } : {}) }))
  }

  async function expectRejected(caseId: string, to: ConsultationStatus, code: string, patch?: CasePatch) {
    const before = await getCase(caseId)
    const eventsBefore = (await eventsFor(caseId)).length
    const err = await tryTransition(caseId, to, patch).catch((e) => e)
    expect(err).toBeInstanceOf(TransitionError)
    expect(err.code).toBe(code)
    // Rolled back: no status change, no partial patch, no event
    const after = await getCase(caseId)
    expect(after.status).toBe(before.status)
    expect(after.updatedAt.getTime()).toBe(before.updatedAt.getTime())
    expect((await eventsFor(caseId)).length).toBe(eventsBefore)
  }

  describe('state machine (guarded transitions)', () => {
    it('4. NEW → ADMIN_INTAKE succeeds', async () => {
      const id = await at('NEW')
      expect((await tryTransition(id, 'ADMIN_INTAKE')).status).toBe('ADMIN_INTAKE')
    })

    it('5. NEW → CONFIRMED fails', async () => {
      await expectRejected(await at('NEW'), 'CONFIRMED', 'illegal_transition')
    })

    it('6. ADMIN_INTAKE → INTAKE_COMPLETE succeeds (with intake fields)', async () => {
      const id = await at('ADMIN_INTAKE')
      await expectRejected(id, 'INTAKE_COMPLETE', 'guard_intake')
      const { medicalHistory, ...fields } = intake
      const c = await tryTransition(id, 'INTAKE_COMPLETE', { ...fields, medicalHistory })
      expect(c.status).toBe('INTAKE_COMPLETE')
    })

    it('ADMIN_INTAKE → PAYMENT_RECEIVED fails', async () => {
      await expectRejected(await at('ADMIN_INTAKE'), 'PAYMENT_RECEIVED', 'illegal_transition')
    })

    it('7. AWAITING_PAYMENT → PAYMENT_RECEIVED succeeds only after payment fields are set', async () => {
      const id = await at('AWAITING_PAYMENT')
      await expectRejected(id, 'PAYMENT_RECEIVED', 'guard_payment')
      await expectRejected(id, 'PAYMENT_RECEIVED', 'guard_payment', { paymentReceived: true })
      await expectRejected(id, 'PAYMENT_RECEIVED', 'guard_payment', { paymentReceived: true, paymentConfirmedAt: new Date() })
      const c = await tryTransition(id, 'PAYMENT_RECEIVED', {
        paymentReceived: true,
        paymentConfirmedAt: new Date(),
        paymentConfirmedBy: adminId,
      })
      expect(c.status).toBe('PAYMENT_RECEIVED')
    })

    it('8. AWAITING_PAYMENT → CONFIRMED fails', async () => {
      await expectRejected(await at('AWAITING_PAYMENT'), 'CONFIRMED', 'illegal_transition', {
        paymentReceived: true,
        doctorDecision: 'APPROVED',
        doctorApprovedTime: future(5),
      })
    })

    it('9. PAYMENT_RECEIVED → AWAITING_DOCTOR_APPROVAL succeeds', async () => {
      const id = await at('PAYMENT_RECEIVED')
      const c = await tryTransition(id, 'AWAITING_DOCTOR_APPROVAL', { proposedConsultationTime: future(24) })
      expect(c.status).toBe('AWAITING_DOCTOR_APPROVAL')
    })

    it('10. AWAITING_DOCTOR_APPROVAL → CONFIRMED fails without doctor approval', async () => {
      const id = await at('AWAITING_DOCTOR_APPROVAL')
      await expectRejected(id, 'CONFIRMED', 'guard_doctor_approval')
      await expectRejected(id, 'CONFIRMED', 'guard_doctor_approval', { doctorDecision: 'POSTPONED', doctorApprovedTime: future(5) })
    })

    it('11. confirmation fails without approved time', async () => {
      const id = await at('AWAITING_DOCTOR_APPROVAL')
      await expectRejected(id, 'CONFIRMED', 'guard_approved_time', { doctorDecision: 'APPROVED' })
    })

    it('12. confirmation succeeds with payment + doctor approval + approved time', async () => {
      const id = await at('AWAITING_DOCTOR_APPROVAL')
      const c = await tryTransition(id, 'CONFIRMED', { doctorDecision: 'APPROVED', doctorApprovedTime: future(30) })
      expect(c.status).toBe('CONFIRMED')
      expect(c.paymentReceived).toBe(true)
    })

    it('CONFIRMED → PAYMENT_RECEIVED fails', async () => {
      await expectRejected(await at('CONFIRMED'), 'PAYMENT_RECEIVED', 'illegal_transition')
    })

    it('13. CONFIRMED → IN_CONSULTATION succeeds', async () => {
      const id = await at('CONFIRMED')
      expect((await tryTransition(id, 'IN_CONSULTATION')).status).toBe('IN_CONSULTATION')
    })

    it('14. IN_CONSULTATION → PRESCRIPTION_SENT requires a prescription (and delivery evidence)', async () => {
      const id = await at('IN_CONSULTATION')
      await expectRejected(id, 'PRESCRIPTION_SENT', 'guard_prescription', { prescriptionSentAt: new Date() })
      // With a prescription linked but no delivery evidence → still rejected
      const doctorId = await createUser('Synthetic Doctor')
      const { id: prescribed } = await caseAt('PRESCRIBED', { adminId, doctorId })
      await expectRejected(prescribed, 'PRESCRIPTION_SENT', 'guard_prescription_delivery', { prescriptionSentAt: new Date() })
    })

    it('15. PRESCRIPTION_SENT → COMPLETED succeeds; COMPLETED → IN_CONSULTATION fails', async () => {
      const doctorId = await createUser('Synthetic Doctor')
      const { id } = await caseAt('PRESCRIBED', { adminId, doctorId })
      const [job] = await jobsOfType('PRESCRIPTION_IMAGE')
      const c1 = await db.transaction((tx) =>
        transitionCase(tx, {
          caseId: id,
          to: 'PRESCRIPTION_SENT',
          actor: { type: 'N8N' },
          patch: { prescriptionSentAt: new Date() },
          evidence: { prescriptionDeliveryJobId: job!.id },
        }),
      )
      expect(c1.status).toBe('PRESCRIPTION_SENT')
      expect((await tryTransition(id, 'COMPLETED')).status).toBe('COMPLETED')
      await expectRejected(id, 'IN_CONSULTATION', 'illegal_transition')
    })

    it('concurrent transitions of the same case: exactly one wins', async () => {
      const id = await at('NEW')
      const results = await Promise.allSettled([1, 2, 3, 4].map(() => tryTransition(id, 'ADMIN_INTAKE')))
      expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1)
      const events = (await eventsFor(id)).filter((e) => e.eventType === 'ADMIN_INTAKE_REQUESTED')
      expect(events).toHaveLength(1)
    })
  })

  describe('idempotency', () => {
    it('16. duplicate wamid does not create a duplicate case or job (sequential + concurrent)', async () => {
      const sender = fakePhone()
      const msg = inbound(sender, 'Salam')
      const first = await processInboundMessage(msg)
      const again = await processInboundMessage(msg)
      expect(first.duplicate).toBe(false)
      expect(again.duplicate).toBe(true)
      expect(again.jobs).toHaveLength(0)

      const msg2 = inbound(sender, 'Synthetic Patient')
      const concurrent = await Promise.all([1, 2, 3, 4, 5].map(() => processInboundMessage(msg2)))
      expect(concurrent.filter((r) => !r.duplicate)).toHaveLength(1)

      const cases = await db.select().from(consultationCases).where(eq(consultationCases.whatsappPhone, sender))
      expect(cases).toHaveLength(1)
      expect(cases[0]!.patientName).toBe('Synthetic Patient')
      expect(await jobsOfType('ASK_PATIENT_NAME')).toHaveLength(1)
      expect(await jobsOfType('ADMIN_NEW_CASE')).toHaveLength(1) // name → intake once, despite 5 deliveries
      const nameEvents = (await eventsFor(cases[0]!.id)).filter((e) => e.eventType === 'PATIENT_NAME_RECEIVED')
      expect(nameEvents).toHaveLength(1)
    })

    it('concurrent first messages (different wamids) from one sender converge on one case', async () => {
      const sender = fakePhone()
      await Promise.all([1, 2, 3].map(() => processInboundMessage(inbound(sender, 'Salam'))))
      const cases = await db.select().from(consultationCases).where(eq(consultationCases.whatsappPhone, sender))
      expect(cases).toHaveLength(1)
    })

    it('17. duplicate payment confirmation does not corrupt state', async () => {
      const doctorId = await createUser('Synthetic Doctor')
      const { id } = await caseAt('AWAITING_PAYMENT', { adminId, doctorId })
      const admin: Actor = { type: 'ADMIN', id: adminId }
      const input = { received: true, source: 'EASYPAISA' as const, reference: 'SYN-1', amount: 1500 }
      const results = await Promise.all([confirmPayment(id, input, admin), confirmPayment(id, input, admin)])
      expect(results.filter((r) => r.changed)).toHaveLength(1)
      const first = await getCase(id)
      const third = await confirmPayment(id, { ...input, amount: 99999 }, admin)
      expect(third.changed).toBe(false)
      const c = await getCase(id)
      expect(c.status).toBe('PAYMENT_RECEIVED')
      expect(c.paymentAmount).toBe(1500)
      expect(c.paymentConfirmedAt!.getTime()).toBe(first.paymentConfirmedAt!.getTime())
      expect(c.paymentConfirmedBy).toBe(adminId)
      expect((await eventsFor(id)).filter((e) => e.eventType === 'PAYMENT_CONFIRMED')).toHaveLength(1)
    })

    it('18. duplicate doctor approval is safe', async () => {
      const doctorId = await createUser('Synthetic Doctor')
      const { id, approvedTime } = await caseAt('AWAITING_DOCTOR_APPROVAL', { adminId, doctorId })
      const doctor: Actor = { type: 'DOCTOR', id: doctorId }
      const decision = { decision: 'APPROVED' as const, approvedTime }
      const results = await Promise.all([applyDoctorDecision(id, decision, doctor), applyDoctorDecision(id, decision, doctor)])
      expect(results.filter((r) => r.changed)).toHaveLength(1)
      const retry = await applyDoctorDecision(id, decision, doctor)
      expect(retry.changed).toBe(false)
      expect((await getCase(id)).status).toBe('CONFIRMED')
      const events = await eventsFor(id)
      expect(events.filter((e) => e.eventType === 'DOCTOR_APPROVED')).toHaveLength(1)
      expect(events.filter((e) => e.eventType === 'CONSULTATION_CONFIRMED')).toHaveLength(1)
      expect(await jobsOfType('CONSULTATION_CONFIRMED_PATIENT')).toHaveLength(1)
      expect(await jobsOfType('CONSULTATION_CONFIRMED_DOCTOR')).toHaveLength(1)
      // A different time after confirmation is a conflict, not a silent change
      await expect(applyDoctorDecision(id, { decision: 'APPROVED', approvedTime: future(99) }, doctor)).rejects.toThrow(
        TransitionError,
      )
    })

    it('19. duplicate outbound results are safe; delivery never completes the case by itself', async () => {
      const doctorId = await createUser('Synthetic Doctor')
      const { id } = await caseAt('PRESCRIBED', { adminId, doctorId })
      const [job] = await jobsOfType('PRESCRIPTION_IMAGE')
      expect(job!.status).toBe('pending') // queued only
      expect((await getCase(id)).status).toBe('IN_CONSULTATION')

      const result = { jobId: job!.id, success: true, status: 'sent' as const, wamid: 'wamid.OUT.1' }
      const outcomes = await Promise.all([applyOutboundResult(result), applyOutboundResult(result)])
      // the consultation stays open: the doctor completes it explicitly
      expect(outcomes.every((o) => o.consultationStatus === 'IN_CONSULTATION')).toBe(true)
      await applyOutboundResult(result)
      await applyOutboundResult({ ...result, status: 'delivered' })
      // A late failure report never regresses a delivered job
      await applyOutboundResult({ jobId: job!.id, success: false, error: { message: 'late' } })

      const c = await getCase(id)
      expect(c.status).toBe('IN_CONSULTATION')
      expect(c.prescriptionSentAt).not.toBeNull()
      const events = await eventsFor(id)
      expect(events.filter((e) => e.eventType === 'PRESCRIPTION_IMAGE_SENT')).toHaveLength(1)
      expect(events.filter((e) => e.eventType === 'CASE_COMPLETED')).toHaveLength(0)
      const [after] = await db.select().from(notificationOutbox).where(eq(notificationOutbox.id, job!.id))
      expect(after!.status).toBe('delivered')
      expect(after!.providerMessageId).toBe('wamid.OUT.1')
    })

    it('failed prescription delivery is recorded; the case stays open; a retry succeeds', async () => {
      const doctorId = await createUser('Synthetic Doctor')
      const { id } = await caseAt('PRESCRIBED', { adminId, doctorId })
      const [job] = await jobsOfType('PRESCRIPTION_IMAGE')
      const out = await applyOutboundResult({
        jobId: job!.id,
        success: false,
        status: 'failed',
        error: { code: 131026, message: 'Undeliverable to +92 300 1234567 token=abcdef' },
      })
      expect(out.consultationStatus).toBe('IN_CONSULTATION')
      const [after] = await db.select().from(notificationOutbox).where(eq(notificationOutbox.id, job!.id))
      expect(after!.status).toBe('failed')
      expect(after!.lastError).not.toMatch(/1234567|abcdef/)
      expect((await eventsFor(id)).filter((e) => e.eventType === 'PRESCRIPTION_DELIVERY_FAILED')).toHaveLength(1)
      await applyOutboundResult({ jobId: job!.id, success: true, status: 'sent', wamid: 'wamid.RETRY' })
      expect((await getCase(id)).status).toBe('IN_CONSULTATION')
    })
  })
})
