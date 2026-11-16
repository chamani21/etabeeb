/**
 * Prepares the eTabib test database (DB-backed suites only).
 * Requires ETABIB_TEST_DATABASE_URL pointing at a DISPOSABLE database whose
 * name contains "test". The public schema is dropped and rebuilt from the
 * repository migrations — never point this at a real database.
 */
import path from 'path'
import postgres from 'postgres'
import { drizzle } from 'drizzle-orm/postgres-js'
import { migrate } from 'drizzle-orm/postgres-js/migrator'

export default async function globalSetup() {
  const url = process.env.ETABIB_TEST_DATABASE_URL
  if (!url) {
    console.warn('[test] ETABIB_TEST_DATABASE_URL not set — DB-backed suites will be skipped')
    return
  }
  const dbName = new URL(url).pathname.replace(/^\//, '')
  if (!/test/i.test(dbName)) {
    throw new Error(`Refusing to reset database "${dbName}": name must contain "test"`)
  }
  const sql = postgres(url, { max: 1, onnotice: () => undefined })
  try {
    await sql`DROP SCHEMA IF EXISTS drizzle CASCADE`
    await sql`DROP SCHEMA IF EXISTS public CASCADE`
    await sql`CREATE SCHEMA public`
    await migrate(drizzle(sql), {
      migrationsFolder: path.resolve(__dirname, '../../../packages/db/migrations'),
    })
  } finally {
    await sql.end()
  }
}
