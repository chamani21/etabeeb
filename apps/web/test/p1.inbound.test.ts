/**
 * P1.1 / P1.2 — backend inbound kill switch, inbound modes, allow-list, staff
 * exclusion. Synthetic data only.
 */
import { describe, it, expect, beforeEach, afterAll } from 'vitest'
import { db } from '@etabeeb/db'
import { consultationCases, notificationOutbox, whatsappAllowedSenders, whatsappEvents } from '@etabeeb/db/schema'
import { eq } from 'drizzle-orm'
import { POST as whatsappHook } from '@/app/api/hooks/whatsapp/route'
import { hasTestDb, HOOK_KEY, resetDb, fakePhone, jsonRequest, metaPayload, createStaffUser } from './helpers'

const headers = { 'x-etabib-key': HOOK_KEY }
let n = 0
async function send(from: string, text = 'Salam', wamid = `wamid.P1IN.${Date.now()}.${++n}`) {
  const res = await whatsappHook(jsonRequest('/api/hooks/whatsapp', metaPayload(from, wamid, text), headers))
  const body = await res.json()
  return { status: res.status, body, wamid, result: body.results?.[0] }
}
const counts = async () => ({
  cases: (await db.select().from(consultationCases)).length,
  jobs: (await db.select().from(notificationOutbox)).length,
})
async function allow(phone: string, purpose: 'PATIENT_TEST' | 'PILOT_PATIENT' | 'STAFF' | 'BLOCKED', active = true) {
  await db.insert(whatsappAllowedSenders).values({ phoneE164: phone, label: `synthetic ${purpose}`, purpose, active })
}
function setInbound(enabled: string | undefined, mode: string | undefined) {
  if (enabled === undefined) delete process.env.ETABIB_WHATSAPP_INBOUND_ENABLED
  else process.env.ETABIB_WHATSAPP_INBOUND_ENABLED = enabled
  if (mode === undefined) delete process.env.ETABIB_INBOUND_MODE
  else process.env.ETABIB_INBOUND_MODE = mode
}

describe.skipIf(!hasTestDb)('P1 inbound control', () => {
  beforeEach(async () => {
    await resetDb()
    process.env.ETABIB_ADMIN_WHATSAPP = '+923009990001'
    process.env.ETABIB_DOCTOR_WHATSAPP = '+923009990002'
  })
  afterAll(() => setInbound('true', 'public'))

  describe('global kill switch', () => {
    it('defaults to OFF: acknowledged with 200, no case, no outbox, ledger records the reason', async () => {
      setInbound(undefined, 'public')
      const r = await send(fakePhone())
      expect(r.status).toBe(200)
      expect(r.body.processed).toBe(0)
      expect(r.result).toMatchObject({ outcome: 'ignored', disposition: 'ignored_disabled', consultationId: null })
      expect(await counts()).toEqual({ cases: 0, jobs: 0 })
      const [ledger] = await db.select().from(whatsappEvents).where(eq(whatsappEvents.wamid, r.wamid))
      expect(ledger!.disposition).toBe('ignored_disabled')
      expect(ledger!.consultationId).toBeNull()
    })

    it('any value other than "true" (case-insensitive) keeps inbound OFF', async () => {
      for (const v of ['false', '1', 'yes', 'on', '']) {
        setInbound(v, 'public')
        expect((await send(fakePhone())).result.disposition).toBe('ignored_disabled')
      }
      expect(await counts()).toEqual({ cases: 0, jobs: 0 })
    })

    it('ON + public: a new sender starts the patient flow', async () => {
      setInbound('true', 'public')
      const r = await send(fakePhone())
      expect(r.result).toMatchObject({ outcome: 'asked_name', disposition: 'processed' })
      expect(await counts()).toEqual({ cases: 1, jobs: 1 })
    })

    it('mode "disabled" (or an unrecognised mode) blocks processing even with the switch ON', async () => {
      for (const mode of ['disabled', 'everyone', 'PUBLIC!']) {
        setInbound('true', mode)
        expect((await send(fakePhone())).result.disposition).toBe('ignored_disabled')
      }
      expect(await counts()).toEqual({ cases: 0, jobs: 0 })
    })

    it('existing open cases do not advance while inbound is OFF', async () => {
      setInbound('true', 'public')
      const sender = fakePhone()
      const first = await send(sender)
      setInbound('false', 'public')
      const r = await send(sender, 'Synthetic Patient')
      expect(r.result.disposition).toBe('ignored_disabled')
      const [c] = await db.select().from(consultationCases).where(eq(consultationCases.id, first.result.consultationId))
      expect(c!.patientName).toBeNull()
      expect(await counts()).toEqual({ cases: 1, jobs: 1 })
    })
  })

  describe('allowlist mode', () => {
    beforeEach(() => setInbound('true', 'allowlist'))

    it('unset mode defaults to allowlist', async () => {
      setInbound('true', undefined)
      expect((await send(fakePhone())).result.disposition).toBe('ignored_not_allowed')
    })

    it('an unknown sender is ignored safely (no case, no reply)', async () => {
      const r = await send(fakePhone())
      expect(r.status).toBe(200)
      expect(r.result.disposition).toBe('ignored_not_allowed')
      expect(await counts()).toEqual({ cases: 0, jobs: 0 })
    })

    it('PATIENT_TEST and PILOT_PATIENT senders are accepted', async () => {
      const a = fakePhone()
      const b = fakePhone()
      await allow(a, 'PATIENT_TEST')
      await allow(b, 'PILOT_PATIENT')
      expect((await send(a)).result.outcome).toBe('asked_name')
      expect((await send(b)).result.outcome).toBe('asked_name')
      expect(await counts()).toEqual({ cases: 2, jobs: 2 })
    })

    it('an inactive entry is not allowed; deactivation also stops an in-progress intake', async () => {
      const inactive = fakePhone()
      await allow(inactive, 'PATIENT_TEST', false)
      expect((await send(inactive)).result.disposition).toBe('ignored_not_allowed')

      const p = fakePhone()
      await allow(p, 'PATIENT_TEST')
      await send(p)
      await db.update(whatsappAllowedSenders).set({ active: false }).where(eq(whatsappAllowedSenders.phoneE164, p))
      expect((await send(p, 'Synthetic Patient')).result.disposition).toBe('ignored_not_allowed')
      const [c] = await db.select().from(consultationCases).where(eq(consultationCases.whatsappPhone, p))
      expect(c!.patientName).toBeNull()
    })
  })

  describe('staff and blocked senders never enter the patient flow (any mode)', () => {
    for (const mode of ['allowlist', 'public']) {
      it(`${mode}: configured admin/doctor WhatsApp numbers`, async () => {
        setInbound('true', mode)
        expect((await send('+923009990001')).result.disposition).toBe('ignored_staff')
        expect((await send('+923009990002')).result.disposition).toBe('ignored_staff')
        expect(await counts()).toEqual({ cases: 0, jobs: 0 })
      })

      it(`${mode}: STAFF allow-list entries and staff user accounts`, async () => {
        setInbound('true', mode)
        const listed = fakePhone()
        await allow(listed, 'STAFF')
        const admin = await createStaffUser('administrator')
        const doctor = await createStaffUser('practitioner')
        for (const phone of [listed, admin.phone, doctor.phone]) {
          expect((await send(phone)).result.disposition).toBe('ignored_staff')
        }
        expect(await counts()).toEqual({ cases: 0, jobs: 0 })
      })

      it(`${mode}: BLOCKED entries`, async () => {
        setInbound('true', mode)
        const blocked = fakePhone()
        await allow(blocked, 'BLOCKED')
        expect((await send(blocked)).result.disposition).toBe('ignored_blocked')
        expect(await counts()).toEqual({ cases: 0, jobs: 0 })
      })
    }

    it('a patient-role user account is NOT treated as staff (explicit identities only)', async () => {
      setInbound('true', 'public')
      const patient = await createStaffUser('patient')
      expect((await send(patient.phone)).result.outcome).toBe('asked_name')
    })

    it('staff exclusion wins even if the staff number is also listed as a test patient', async () => {
      setInbound('true', 'allowlist')
      await allow('+923009990001', 'PATIENT_TEST')
      expect((await send('+923009990001')).result.disposition).toBe('ignored_staff')
    })
  })

  describe('duplicate wamid stays safe across gate decisions', () => {
    it('an ignored message redelivered after inbound is enabled is still a duplicate (no case)', async () => {
      setInbound('false', 'public')
      const sender = fakePhone()
      const first = await send(sender, 'Salam', 'wamid.P1.DUP.1')
      expect(first.result.disposition).toBe('ignored_disabled')
      setInbound('true', 'public')
      const again = await send(sender, 'Salam', 'wamid.P1.DUP.1')
      expect(again.result).toMatchObject({ duplicate: true, outcome: 'duplicate' })
      expect(await counts()).toEqual({ cases: 0, jobs: 0 })
    })

    it('an allowed message redelivered creates no second case or reply', async () => {
      setInbound('true', 'allowlist')
      const p = fakePhone()
      await allow(p, 'PATIENT_TEST')
      await send(p, 'Salam', 'wamid.P1.DUP.2')
      const again = await send(p, 'Salam', 'wamid.P1.DUP.2')
      expect(again.result.duplicate).toBe(true)
      expect(await counts()).toEqual({ cases: 1, jobs: 1 })
    })
  })
})
