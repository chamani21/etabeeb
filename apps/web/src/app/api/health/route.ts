import { NextResponse } from 'next/server'
import { db } from '@etabeeb/db'
import { sql } from 'drizzle-orm'

export const dynamic = 'force-dynamic'

// GET /api/health — public liveness/readiness probe (no session required).
// Returns status only: no error messages, configuration, or environment details.
export async function GET() {
  let database: 'ok' | 'error' = 'ok'
  try {
    await db.execute(sql`SELECT 1`)
  } catch (error) {
    database = 'error'
    console.error('[health] database check failed:', error instanceof Error ? error.name : 'unknown')
  }

  const healthy = database === 'ok'
  return NextResponse.json(
    {
      status: healthy ? 'healthy' : 'degraded',
      timestamp: new Date().toISOString(),
      checks: { application: 'ok', database },
    },
    { status: healthy ? 200 : 503 }
  )
}
