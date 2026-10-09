/**
 * WhatsApp message sequence + wording (patient Pashto, staff English) and the
 * /help representative redirect. Synthetic data only; n8n is stubbed (fetch).
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { processInboundMessage } from '@/lib/etabib/whatsapp'
import { dispatchOutboundJobs } from '@/lib/etabib/outbound'
import { REPRESENTATIVE_PREFILL_PS } from '@/lib/etabib/links'
import { GET as helpRoute } from '@/app/[locale]/help/route'
import { hasTestDb, resetDb, createUser, fakePhone, inbound, jobsOfType, caseAt, getCase } from './helpers'
import { db } from '@etabeeb/db'
import { notificationOutbox, whatsappEvents } from '@etabeeb/db/schema'
import { asc, eq, like } from 'drizzle-orm'

const N8N_URL = 'https://n8n.example.test/webhook/outbound'
const HELP = 'https://staging.example.test/help'
const UUID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i
const STATE_NAMES = /ADMIN_INTAKE|AWAITING_|PAYMENT_RECEIVED|CONFIRMED|IN_CONSULTATION|COMPLETED|CANCELLED|status/

describe('/help representative redirect', () => {
  afterEach(() => {
    for (const k of ['ETABIB_REPRESENTATIVE_WHATSAPP', 'ETABIB_ADMIN_WHATSAPP']) delete process.env[k]
  })

  it('302-redirects to the configured representative chat with an encoded Pashto greeting', async () => {
    process.env.ETABIB_REPRESENTATIVE_WHATSAPP = '+92 300-999 0009'
    const res = await helpRoute()
    expect(res.status).toBe(302)
    expect(res.headers.get('location')).toBe(`https://wa.me/923009990009?text=${encodeURIComponent(REPRESENTATIVE_PREFILL_PS)}`)
    expect(res.headers.get('cache-control')).toBe('no-store')
  })

  it('falls back to the admin number; 404 when nothing is configured', async () => {
    process.env.ETABIB_ADMIN_WHATSAPP = '+923009990001'
    expect((await helpRoute()).headers.get('location')).toMatch(/^https:\/\/wa\.me\/923009990001\?text=/)
    delete process.env.ETABIB_ADMIN_WHATSAPP
    expect((await helpRoute()).status).toBe(404)
  })

  it('cannot be turned into an open redirect (no request input is used)', async () => {
    process.env.ETABIB_REPRESENTATIVE_WHATSAPP = '+923009990009'
    expect(helpRoute.length).toBe(0) // the handler takes no request at all
    const location = (await helpRoute()).headers.get('location')!
    expect(new URL(location).host).toBe('wa.me')
    expect(location).not.toContain('evil')
  })
})

describe.skipIf(!hasTestDb)('patient + staff WhatsApp sequence', () => {
  let adminId: string
  let doctorId: string
  let fetchMock: ReturnType<typeof vi.fn>
  const sent = () => fetchMock.mock.calls.filter((c) => String(c[0]) === N8N_URL).map((c) => JSON.parse(c[1].body))
  /** Run one inbound message and dispatch whatever it queued (as the webhook route does). */
  const say = async (from: string, text: string, wamid?: string) => {
    const msg = inbound(from, text)
    const r = await processInboundMessage(wamid ? { ...msg, wamid } : msg)
    await dispatchOutboundJobs((r.jobs ?? []).filter((j) => j.created).map((j) => j.id))
    return r
  }

  beforeEach(async () => {
    await resetDb()
    adminId = await createUser('Synthetic Admin')
    doctorId = await createUser('Synthetic Doctor')
    Object.assign(process.env, {
      ETABIB_V1_DOCTOR_USER_ID: doctorId,
      ETABIB_ADMIN_WHATSAPP: '+923009990001',
      ETABIB_DOCTOR_WHATSAPP: '+923009990002',
      ETABIB_REPRESENTATIVE_WHATSAPP: '+923009990009',
      ETABIB_N8N_OUTBOUND_URL: N8N_URL,
      ETABIB_N8N_OUTBOUND_KEY: 'test-outbound-key',
      NEXT_PUBLIC_APP_URL: 'https://staging.example.test/',
      ETABIB_WHATSAPP_INBOUND_ENABLED: 'true',
      ETABIB_INBOUND_MODE: 'public',
    })
    fetchMock = vi.fn().mockResolvedValue(new Response('{}', { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)
  })
  afterEach(() => {
    vi.unstubAllGlobals()
    for (const k of ['ETABIB_REPRESENTATIVE_WHATSAPP', 'ETABIB_N8N_OUTBOUND_URL', 'ETABIB_N8N_OUTBOUND_KEY', 'NEXT_PUBLIC_APP_URL', 'ETABIB_WHATSAPP_INBOUND_ENABLED', 'ETABIB_INBOUND_MODE']) delete process.env[k]
  })

  it('exact sequence: name only (WhatsApp number is the phone) → one registration message with the clean help link; admin notified at once', async () => {
    const from = fakePhone()
    await say(from, 'Salam')
    const nameWamid = `wamid.SEQ.${Date.now()}`
    await say(from, 'احمد خان', nameWamid)
    // duplicate Meta delivery of the name message + the patient writing again
    await say(from, 'احمد خان', nameWamid)
    await say(from, '03001234567')

    const patient = sent().filter((m) => m.audience === 'PATIENT')
    expect(patient.map((m) => m.type)).toEqual(['ASK_PATIENT_NAME', 'PATIENT_ACKNOWLEDGED'])
    const [m1, m2] = patient.map((m) => m.text as string)
    expect(m1).toBe('السلام علیکم، eTabeeb ته ښه راغلاست.\n\nد آنلاین مشورې لپاره مهرباني وکړئ د ناروغ نوم ولیکئ.')
    expect(m2).toBe(
      'مننه احمد خان.\n\nستاسو د آنلاین مشورې غوښتنه ثبت شوه.\n\nزموږ استازی به ډېر ژر له تاسو سره اړیکه ونیسي.\n\nکه کومه پوښتنه لرئ:\n' + HELP,
    )
    expect(m1).not.toContain('شمېره') // the phone number is never asked
    expect(await jobsOfType('ASK_PATIENT_PHONE')).toHaveLength(0)

    // admin notice dispatched together with the acknowledgement (same inbound message)
    const kinds = sent().map((m) => m.type)
    expect(kinds.indexOf('ADMIN_NEW_CASE')).toBe(kinds.indexOf('PATIENT_ACKNOWLEDGED') - 1)
    expect(await jobsOfType('PATIENT_ACKNOWLEDGED')).toHaveLength(1)
    expect(await jobsOfType('PATIENT_CASE_IN_PROGRESS')).toHaveLength(0)
  })

  it('patient messages: Pashto, no UUID, no state names, no wa.me / encoded URLs, help link on its own line', async () => {
    const { id } = await caseAt('CONFIRMED', { adminId, doctorId })
    const jobs = await db.select().from(notificationOutbox).where(like(notificationOutbox.idempotencyKey, 'etabib:%')).orderBy(asc(notificationOutbox.createdAt))
    await dispatchOutboundJobs(jobs.map((j) => j.id))
    const patient = sent().filter((m) => m.audience === 'PATIENT')
    expect(patient.length).toBeGreaterThanOrEqual(3)
    for (const m of patient) {
      const text = m.text as string
      expect(text).toMatch(/[؀-ۿ]/)
      expect(text).not.toMatch(UUID)
      expect(text).not.toContain(id.slice(0, 8))
      expect(text).not.toMatch(STATE_NAMES)
      expect(text).not.toMatch(/wa\.me|%[0-9A-F]{2}/)
    }
    const confirmed = patient.find((m) => m.type === 'CONSULTATION_CONFIRMED_PATIENT')!.text as string
    expect(confirmed).toMatch(
      /^ستاسو مشوره له ډاکټر جلال الدین سره تایید شوه\.\n\nستاسو د آنلاین مشورې وخت:\n\n🇵🇰 د پاکستان وخت:\n\d{2} \S+ \d{4} — \d{1,2}:\d{2} \S+\n\n🇦🇫 د افغانستان وخت:\n\d{2} \S+ \d{4} — \d{1,2}:\d{2} \S+\n\nد مشورې لینک:\nhttps:\/\/staging\.example\.test\/consult\/[A-Za-z0-9_-]{43}\n\nمرستې لپاره:\nhttps:\/\/staging\.example\.test\/help$/,
    )
    expect(confirmed).not.toMatch(/etb-[0-9a-f]{32}|livekit|eyJ/i)
  })

  it('admin new-case: short, two obvious actions, plain wa.me chat link, no prefill, no case id outside the URL', async () => {
    const { id } = await caseAt('ADMIN_INTAKE', { adminId, doctorId })
    const c = await getCase(id)
    await dispatchOutboundJobs((await jobsOfType('ADMIN_NEW_CASE')).map((j) => j.id))
    const [m] = sent()
    expect(m.to).toBe('+923009990001')
    const lines = (m.text as string).split('\n')
    expect(lines[0]).toBe('eTabeeb — New consultation')
    expect(m.text).toContain(`Patient: Synthetic Patient\nPhone: ${c.patientPhone}\nReceived: `)
    expect(m.text).toContain(`💬 Chat with patient\nhttps://wa.me/${c.whatsappPhone!.slice(1)}\n`)
    expect(m.text).toContain(`📋 Open intake\nhttps://staging.example.test/admin/cases/${id}`)
    expect(m.text).not.toContain('?text=')
    expect((m.text as string).replace(`/admin/cases/${id}`, '')).not.toContain(id.slice(0, 8))
  })

  it('approved templates get values in the exact approved order (confirmation, approval, staff cancellation)', async () => {
    process.env.ETABIB_WA_TEMPLATES = JSON.stringify({
      CONSULTATION_CONFIRMED: { name: 'etabib_consultation_confirmed_ps', language: 'ps_AF' },
      DOCTOR_APPROVAL_REQUEST: { name: 'etabib_doctor_approval_request_v2', language: 'en' },
      DOCTOR_CONSULTATION_CANCELLED: { name: 'etabib_staff_consultation_cancelled', language: 'en' },
    })
    try {
      const { id, sender } = await caseAt('CONFIRMED', { adminId, doctorId })
      // patient window closed → template; (staff numbers never wrote → template)
      await db.update(whatsappEvents).set({ createdAt: new Date(Date.now() - 30 * 3600_000) }).where(eq(whatsappEvents.senderPhone, sender))
      await dispatchOutboundJobs([...(await jobsOfType('DOCTOR_APPROVAL_REQUEST')), ...(await jobsOfType('CONSULTATION_CONFIRMED_PATIENT'))].map((j) => j.id))
      const vals = (type: string) => sent().find((m) => m.type === type).template.components[0].parameters.map((x: { text: string }) => x.text)
      expect(vals('DOCTOR_APPROVAL_REQUEST')).toEqual(['Synthetic Patient', '34 / FEMALE', 'Synthetic District', expect.stringMatching(/\(Pakistan time\)$/), `https://staging.example.test/doctor/cases/${id}`])
      const conf = vals('CONSULTATION_CONFIRMED_PATIENT')
      expect(conf[0]).toBe('Synthetic Patient')
      expect(conf[1]).toMatch(/^پاکستان: \d{2} \S+ \d{4}، \d{1,2}:\d{2} \S+ \| افغانستان: \d{2} \S+ \d{4}، \d{1,2}:\d{2} \S+$/)
      expect(conf[2]).toMatch(/^https:\/\/staging\.example\.test\/consult\/[A-Za-z0-9_-]{43}$/)
      const { cancelConsultation } = await import('@/lib/etabib/cases')
      const r = await cancelConsultation(id, { reason: 'SCHEDULING_PROBLEM' }, { type: 'ADMIN', id: adminId })
      await dispatchOutboundJobs(r.jobs.map((j) => j.id))
      expect(vals('CONSULTATION_CANCELLED_DOCTOR')).toEqual(['by the admin', 'Synthetic Patient', expect.stringMatching(/\(Pakistan time\)$/), 'Scheduling problem', `https://staging.example.test/doctor/cases/${id}`])
    } finally {
      delete process.env.ETABIB_WA_TEMPLATES
    }
  })

  it('templates are used only when the recipient window is closed; inside it, free text (with links) is sent', async () => {
    process.env.ETABIB_WA_TEMPLATES = JSON.stringify({ DOCTOR_APPROVAL_REQUEST: { name: 'etabib_doctor_approval_request_v2', language: 'en' } })
    try {
      await caseAt('AWAITING_DOCTOR_APPROVAL', { adminId, doctorId })
      const [job] = await jobsOfType('DOCTOR_APPROVAL_REQUEST')
      await dispatchOutboundJobs([job!.id])
      expect(sent()[0].messageKind).toBe('template') // the doctor never wrote to eTabeeb
      // the doctor writes to eTabeeb (ignored as staff, but it opens the window)
      await db.insert(whatsappEvents).values({ wamid: `wamid.SYN.DOC.${Date.now()}`, senderPhone: '+923009990002', eventType: 'text', disposition: 'ignored_staff' })
      await db.update(notificationOutbox).set({ status: 'pending' }).where(eq(notificationOutbox.id, job!.id))
      await dispatchOutboundJobs([job!.id])
      expect(sent()[1].messageKind).toBe('text')
      expect(sent()[1].text).toContain('🩺 Review & approve')
    } finally {
      delete process.env.ETABIB_WA_TEMPLATES
    }
  })

  it('doctor approval: short, actionable, no complaint/history, deep link to the case', async () => {
    const { id } = await caseAt('AWAITING_DOCTOR_APPROVAL', { adminId, doctorId })
    await dispatchOutboundJobs((await jobsOfType('DOCTOR_APPROVAL_REQUEST')).map((j) => j.id))
    const [m] = sent()
    expect(m.to).toBe('+923009990002')
    expect(m.text).toMatch(
      new RegExp(
        '^eTabeeb — Approval needed\\n\\nPatient: Synthetic Patient\\nAge/Sex: 34 / FEMALE\\nLocation: Synthetic District\\nTime: .+ \\(Pakistan time\\)\\n\\n' +
          `🩺 Review & approve\\nhttps://staging\\.example\\.test/doctor/cases/${id}\\n\\nClinical details are available in the secure dashboard\\.$`,
      ),
    )
    expect(JSON.stringify(m)).not.toMatch(/Synthetic complaint|None \(synthetic\)/)
  })
})
