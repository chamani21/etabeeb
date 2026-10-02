// Per-file setup: route the app's lazy DB client to the test database and use
// synthetic configuration values only.
if (process.env.ETABIB_TEST_DATABASE_URL) {
  process.env.DATABASE_URL = process.env.ETABIB_TEST_DATABASE_URL
}
process.env.ETABIB_HOOK_KEY = 'test-hook-key-not-a-real-secret'
delete process.env.ETABIB_N8N_OUTBOUND_URL
delete process.env.ETABIB_N8N_OUTBOUND_KEY
