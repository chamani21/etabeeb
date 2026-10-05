import { vi } from 'vitest'

// Per-file setup: route the app's lazy DB client to the test database and use
// synthetic configuration values only.
if (process.env.ETABIB_TEST_DATABASE_URL) {
  process.env.DATABASE_URL = process.env.ETABIB_TEST_DATABASE_URL
}
process.env.ETABIB_HOOK_KEY = 'test-hook-key-not-a-real-secret'
delete process.env.ETABIB_N8N_OUTBOUND_URL
delete process.env.ETABIB_N8N_OUTBOUND_KEY
// P1: the inbound kill switch defaults to OFF in production code. Legacy suites
// exercise the patient flow, so they run with inbound enabled in public mode;
// P1 suites override these per test.
process.env.ETABIB_WHATSAPP_INBOUND_ENABLED = 'true'
process.env.ETABIB_INBOUND_MODE = 'public'
delete process.env.ETABIB_WA_TEMPLATES

// Prescription rendering needs a Chromium binary and takes seconds; general suites
// use a tiny deterministic stand-in. test/p3.prescription.render.test.ts uses the
// real renderer (vi.importActual).
vi.mock('@/lib/etabib/rx/render', async () => {
  const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64')
  return {
    RX_IMAGE_SCALE: 1.5,
    chromiumPath: () => null,
    qrDataUri: async () => 'data:image/svg+xml;base64,',
    renderRx: async (doc: { medicines: unknown[] }) => ({
      pages: doc.medicines.length > 12 ? [PNG, PNG] : [PNG],
      pdf: Buffer.from('%PDF-1.4 synthetic test document'),
    }),
  }
})
