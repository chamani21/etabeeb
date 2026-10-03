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
