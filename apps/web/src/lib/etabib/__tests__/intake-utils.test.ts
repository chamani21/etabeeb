import { describe, it, expect } from 'vitest'
import { normalizePhone, waIdToE164 } from '../phone'
import { extractInboundMessages, sanitizePatientName } from '../whatsapp'
import { sanitizeErrorText } from '../sanitize'
import { CANCELLATION_REASON_PS, PATIENT_MESSAGES_PS } from '../messages.ps'
import { consultationTimeBlockPs, consultationTimeLinePs, formatConsultationForPatient } from '../patient-time'

describe('phone normalization', () => {
  it.each([
    ['03001234567', '+923001234567'],
    ['0300 123 4567', '+923001234567'],
    ['+92 300 1234567', '+923001234567'],
    ['00923001234567', '+923001234567'],
    ['۰۳۰۰۱۲۳۴۵۶۷', '+923001234567'], // Pashto digits
    ['0701234567', '+93701234567'],
    ['+93 70 123 4567', '+93701234567'],
    ['+923001234567', '+923001234567'], // already international: unchanged
    ['+93701234567', '+93701234567'],
    ['0093701234567', '+93701234567'],
    // the exact examples shown to patients normalize correctly
    ['0300 0000000', '+923000000000'],
    ['+92 300 0000000', '+923000000000'],
    ['070 000 0000', '+93700000000'],
    ['+93 70 000 0000', '+93700000000'],
  ])('%s → %s', (input, expected) => {
    expect(normalizePhone(input)).toBe(expected)
  })

  it('an Afghan number is never given the Pakistan country code (and vice versa)', () => {
    expect(normalizePhone('0701234567')).not.toMatch(/^\+92/)
    expect(normalizePhone('03001234567')).not.toMatch(/^\+93/)
    // ambiguous lengths are rejected instead of guessed
    expect(normalizePhone('0301234567')).toBeNull()
    expect(normalizePhone('07012345678')).toBeNull()
  })

  it.each(['hello', '12345', '0300123', '+92123', 'call me 0300', ''])('rejects %s', (input) => {
    expect(normalizePhone(input)).toBeNull()
  })

  it('converts WhatsApp wa_id to E.164', () => {
    expect(waIdToE164('923001234567')).toBe('+923001234567')
    expect(waIdToE164('abc')).toBeNull()
  })
})

describe('patient name sanitization', () => {
  it('accepts Pashto and Latin names', () => {
    expect(sanitizePatientName('  احمد   خان ')).toBe('احمد خان')
    expect(sanitizePatientName('Test Patient')).toBe('Test Patient')
  })
  it.each([null, '', 'a', '03001234567', 'Ali 123', 'http://x.y', '!!!'])('rejects %s', (v) => {
    expect(sanitizePatientName(v)).toBeNull()
  })
})

describe('Meta webhook extraction', () => {
  const message = { from: '923001234567', id: 'wamid.TEST1', timestamp: '1', type: 'text', text: { body: 'salam' } }
  const full = {
    object: 'whatsapp_business_account',
    entry: [{ id: 'x', changes: [{ field: 'messages', value: { messaging_product: 'whatsapp', messages: [message] } }] }],
  }

  it('parses the full Meta body, the value object and the n8n body wrapper', () => {
    for (const payload of [full, { body: full }, { messages: [message] }]) {
      expect(extractInboundMessages(payload)).toEqual([
        expect.objectContaining({ wamid: 'wamid.TEST1', from: '+923001234567', type: 'text', text: 'salam' }),
      ])
    }
  })

  it('keeps inbox metadata: media id (never a URL), caption, reply-to and provider time', () => {
    const [m] = extractInboundMessages({
      metadata: { phone_number_id: 'PNID' },
      contacts: [{ wa_id: '923001234567', profile: { name: 'Syn' } }],
      messages: [{ from: '923001234567', id: 'w9', timestamp: '1700000000', type: 'document', context: { id: 'wPrev' }, document: { id: 'MEDIA9', mime_type: 'application/pdf', filename: 'r.pdf', caption: 'report' } }],
    })
    expect(m).toMatchObject({ media: { id: 'MEDIA9', mimeType: 'application/pdf', filename: 'r.pdf', caption: 'report' }, replyTo: 'wPrev', profileName: 'Syn', businessPhoneNumberId: 'PNID' })
    expect(m!.providerTimestamp?.toISOString()).toBe('2023-11-14T22:13:20.000Z')
  })

  it('reads interactive/button replies and tolerates media', () => {
    const msgs = extractInboundMessages({
      messages: [
        { from: '923001234567', id: 'w2', type: 'interactive', interactive: { button_reply: { title: 'Yes' } } },
        { from: '923001234567', id: 'w3', type: 'image', image: { id: 'media' } },
      ],
    })
    expect(msgs.map((m) => m.text)).toEqual(['Yes', null])
  })

  it('ignores status-only webhooks and garbage', () => {
    expect(extractInboundMessages({ entry: [{ changes: [{ value: { statuses: [{ id: 'w' }] } }] }] })).toEqual([])
    expect(extractInboundMessages('nope')).toEqual([])
    expect(extractInboundMessages(null)).toEqual([])
  })
})

describe('error sanitization', () => {
  it('redacts tokens, phone numbers, e-mails and URL queries and truncates', () => {
    const out = sanitizeErrorText(
      'Bearer abc.def failed for +92 300 1234567 test@example.com at https://h.example/x?token=zzz ' + 'k'.repeat(40),
    )
    expect(out).not.toMatch(/abc\.def|1234567|example\.com\?|zzz|k{40}/)
    expect(sanitizeErrorText('node failed '.repeat(200), 100)!.length).toBe(100)
    expect(sanitizeErrorText('Authorization: Bearer Zq9x')).toBe('Authorization=[REDACTED]')
    expect(sanitizeErrorText(undefined)).toBeNull()
  })
})

describe('Pashto patient messages', () => {
  // Letters used in Urdu but not in Pashto: ے ں ہ ھ ٹ ڈ ڑ
  const URDU_ONLY = /[ےںہھٹڈڑ]/
  const texts = [
    PATIENT_MESSAGES_PS.askName,
    PATIENT_MESSAGES_PS.invalidName,
    PATIENT_MESSAGES_PS.askPhone('احمد'),
    PATIENT_MESSAGES_PS.invalidPhone,
    PATIENT_MESSAGES_PS.acknowledged('احمد', 'https://etabeeb.example/help'),
    PATIENT_MESSAGES_PS.caseInProgress('https://etabeeb.example/help'),
    PATIENT_MESSAGES_PS.consultationConfirmed(consultationTimeBlockPs(new Date('2026-10-06T12:00:00Z')), 'https://example.test/x', 'https://wa.me/920000000000'),
    PATIENT_MESSAGES_PS.consultationCancelled({ name: 'احمد', sex: 'MALE', reason: CANCELLATION_REASON_PS.DOCTOR_UNAVAILABLE!, helpUrl: 'https://wa.me/920000000000' }),
    ...Object.values(CANCELLATION_REASON_PS),
    PATIENT_MESSAGES_PS.prescriptionReady,
  ]
  it('are Arabic-script Pashto without Urdu-only letters', () => {
    for (const t of texts) {
      expect(t).toMatch(/[؀-ۿ]/)
      expect(t).not.toMatch(URDU_ONLY)
    }
  })
  it('do not ask clinical questions in the acknowledgement', () => {
    // (the representative link's own query string is not a question)
    expect(PATIENT_MESSAGES_PS.acknowledged('احمد', 'https://etabeeb.example/help')).not.toMatch(/\?|؟/)
    expect(PATIENT_MESSAGES_PS.acknowledged(null, null)).not.toMatch(/\?|؟|https?:/)
  })
  it('shows consultation times for Pakistan AND Afghanistan from one timestamp (timezone database)', () => {
    // Pakistan 5:00 PM → Afghanistan 4:30 PM
    expect(formatConsultationForPatient(new Date('2026-10-06T12:00:00Z'))).toEqual({
      pakistan: { date: '06 اکتوبر 2026', time: '5:00 ماښام' },
      afghanistan: { date: '06 اکتوبر 2026', time: '4:30 ماښام' },
    })
    // Pakistan 10:00 AM → Afghanistan 9:30 AM
    expect(formatConsultationForPatient(new Date('2026-10-06T05:00:00Z'))).toEqual({
      pakistan: { date: '06 اکتوبر 2026', time: '10:00 سهار' },
      afghanistan: { date: '06 اکتوبر 2026', time: '9:30 سهار' },
    })
    // Pakistan 12:15 AM on 7 Oct → Afghanistan 11:45 PM on the PREVIOUS date (6 Oct)
    expect(formatConsultationForPatient(new Date('2026-10-06T19:15:00Z'))).toEqual({
      pakistan: { date: '07 اکتوبر 2026', time: '12:15 شپه' },
      afghanistan: { date: '06 اکتوبر 2026', time: '11:45 شپه' },
    })
  })
  it('renders the Pashto block (messages) and a single-line form (template variables)', () => {
    const ts = new Date('2026-10-06T12:00:00Z')
    expect(consultationTimeBlockPs(ts)).toBe('🇵🇰 د پاکستان وخت:\n06 اکتوبر 2026 — 5:00 ماښام\n\n🇦🇫 د افغانستان وخت:\n06 اکتوبر 2026 — 4:30 ماښام')
    expect(consultationTimeLinePs(ts)).toBe('پاکستان: 06 اکتوبر 2026، 5:00 ماښام | افغانستان: 06 اکتوبر 2026، 4:30 ماښام')
    expect(consultationTimeLinePs(ts)).not.toMatch(/[\n\t]| {5,}/) // valid WhatsApp template parameter
  })
})
