import { describe, it, expect } from 'vitest'
import { normalizePhone, waIdToE164 } from '../phone'
import { extractInboundMessages, sanitizePatientName } from '../whatsapp'
import { sanitizeErrorText } from '../sanitize'
import { CANCELLATION_REASON_PS, PATIENT_MESSAGES_PS, formatConsultationTimePs } from '../messages.ps'

describe('phone normalization', () => {
  it.each([
    ['03001234567', '+923001234567'],
    ['0300 123 4567', '+923001234567'],
    ['+92 300 1234567', '+923001234567'],
    ['00923001234567', '+923001234567'],
    ['۰۳۰۰۱۲۳۴۵۶۷', '+923001234567'], // Pashto digits
    ['0701234567', '+93701234567'],
    ['+93 70 123 4567', '+93701234567'],
  ])('%s → %s', (input, expected) => {
    expect(normalizePhone(input)).toBe(expected)
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
        { wamid: 'wamid.TEST1', from: '+923001234567', type: 'text', text: 'salam' },
      ])
    }
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
    PATIENT_MESSAGES_PS.consultationConfirmed('2026-10-05 14:30', 'https://example.test/x', 'https://wa.me/920000000000'),
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
  it('formats times in clinic time', () => {
    expect(formatConsultationTimePs(new Date('2026-10-05T09:30:00Z'))).toBe('2026-10-05 14:30 (د پاکستان وخت)')
  })
})
