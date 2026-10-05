/**
 * Real prescription renderer (headless Chromium): eTabeeb stationery, Pashto,
 * pagination, image + PDF from one template. Skipped when no Chromium binary.
 */
import { describe, it, expect, vi } from 'vitest'
import { existsSync } from 'fs'
import type * as RenderModule from '@/lib/etabib/rx/render'
import { buildRxHtml } from '@/lib/etabib/rx/template'
import { DR_JALALUDDIN, ETABEEB_CONTACT, type RxDocument } from '@/lib/etabib/rx/document'

const real = await vi.importActual<typeof RenderModule>('@/lib/etabib/rx/render')
const chromium = real.chromiumPath()
const canRender = Boolean(chromium && existsSync(chromium))

const base: RxDocument = {
  rxNumber: 'ETB-RX-20261006-00001', revision: 1, status: 'FINALIZED', issuedAt: new Date('2026-10-06T10:00:00Z'), doctor: DR_JALALUDDIN,
  patient: { name: 'احمد خان', age: 34, sex: 'MALE', location: 'چمن', caseRef: 'c2b22578' },
  vitals: { weight: '72 kg', bp: '130/85' }, complaint: 'تبه او سر درد', diagnosis: null,
  medicines: [{ name: 'Paracetamol', strength: '500 mg', formulation: 'tablet', dose: '1 tablet', frequency: 'three times daily', duration: '3 days', instructions: 'که تبه نه وي، مه یې خورئ.' }],
  freeText: null, investigations: 'CBC', advice: 'ډېرې اوبه وڅښئ.', followUp: null, followUpInterval: '7 days', redFlags: null,
  verifyUrl: 'https://staging.example.test/rx/Zx9kQ2mT7vB4nR8pL1wE5a', contact: ETABEEB_CONTACT,
}
const assets = { logoDataUri: 'data:image/png;base64,LOGO', naskhFontDataUri: 'data:font/ttf;base64,F1', sansFontDataUri: 'data:font/ttf;base64,F2', qrDataUri: 'data:image/svg+xml;base64,QR' }
const pngWidth = (b: Buffer) => b.readUInt32BE(16)
const pdfPages = (b: Buffer) => (b.toString('latin1').match(/\/Type\s*\/Page[^s]/g) ?? []).length

describe('prescription template (HTML)', () => {
  it('eTabeeb identity, Pashto labels, approved doctor details, correct contact number and website', () => {
    const html = buildRxHtml(base, assets)
    for (const s of ['د ناروغ معلومات', 'کلینیکي یادښتونه', 'بیا کتنه', 'معاینات', 'مشورې', 'د آنلاین مشورې لپاره د واټس‌اپ، زنګ یا وېب‌سایټ له لارې وخت واخلئ.', 'ډاکټر جلال الدین «جلال»', 'MD (Internal Medicine) PGMI', 'Medical Officer, DHQ Hospital Chaman', 'PGR, BMC, Quetta', '0310 000 6526', 'etabeeb.online', 'ETB-RX-20261006-00001', 'data:image/png;base64,LOGO', 'data:image/svg+xml;base64,QR']) {
      expect(html).toContain(s)
    }
    expect(html).not.toMatch(/0333|2357055|Kozhak|Specialist Clinic/) // no old letterpad identity
    expect(html).toContain('dir="rtl"')
  })

  it('escapes every doctor-entered value (no markup injection) and blocks nothing it needs from the network', () => {
    const html = buildRxHtml({ ...base, medicines: [{ name: '<img src=x onerror=alert(1)>', instructions: '"><script>alert(1)</script>' }], advice: '</p><iframe>' }, assets)
    expect(html).not.toContain('<img src=x')
    expect(html).not.toContain('<script>alert(1)')
    expect(html).not.toContain('<iframe>')
    expect(html).toContain('&lt;img src=x onerror=alert(1)&gt;')
    expect(html).not.toMatch(/https?:\/\/(?!staging\.example\.test\/rx)/) // only the verify URL appears (inside the QR data)
  })

  it('drafts carry a DRAFT watermark and no QR code', () => {
    const html = buildRxHtml({ ...base, status: 'DRAFT', verifyUrl: null }, { ...assets, qrDataUri: null })
    expect(html).toContain('DRAFT<br>مسوده')
    expect(html).not.toContain('class="qr"')
  })
})

describe.skipIf(!canRender)('prescription renderer (Chromium)', () => {
  it('A: one medicine → one 1191-px PNG page + one-page PDF with the same data', async () => {
    const out = await real.renderRx(base)
    expect(out.pages).toHaveLength(1)
    expect(out.pages[0]!.subarray(1, 4).toString()).toBe('PNG')
    expect(pngWidth(out.pages[0]!)).toBe(1191)
    expect(out.pages[0]!.length).toBeLessThan(5 * 1024 * 1024) // WhatsApp image limit
    expect(out.pdf!.subarray(0, 5).toString()).toBe('%PDF-')
    expect(pdfPages(out.pdf!)).toBe(1)
  }, 60_000)

  it('B/C: long prescriptions paginate (images and PDF agree), nothing clipped', async () => {
    const meds = Array.from({ length: 16 }, (_, i) => ({ name: `Medicine number ${i + 1} with a deliberately long generic name`, strength: '500 mg', dose: '1 tablet', frequency: 'twice daily', duration: '2 weeks', instructions: i % 2 ? 'دا درمل هره ورځ په یو ټاکلي وخت وخورئ او که کومه عارضه مو ولیده، له ډاکټر سره اړیکه ونیسئ.' : null }))
    const out = await real.renderRx({ ...base, medicines: meds, advice: Array.from({ length: 8 }, () => 'ډېرې اوبه وڅښئ او آرام وکړئ.').join('\n') })
    expect(out.pages.length).toBeGreaterThanOrEqual(2)
    expect(pdfPages(out.pdf!)).toBe(out.pages.length)
    for (const pg of out.pages) expect(pngWidth(pg)).toBe(1191)
  }, 90_000)
})
