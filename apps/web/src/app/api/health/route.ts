import { NextResponse } from 'next/server'

// GET /api/health — Platform health check
export async function GET() {
  const checks: Record<string, { status: string; message?: string }> = {}
  let healthy = true

  // 1. Application
  checks.application = { status: 'ok' }

  // 2. Database
  try {
    const { db } = await import('@etabeeb/db')
    const result = await db.execute({ sql: 'SELECT 1 as health' })
    checks.database = { status: 'ok' }
  } catch (error: any) {
    checks.database = { status: 'error', message: error.message }
    healthy = false
  }

  // 3. Environment
  const requiredEnvs = ['DATABASE_URL', 'NEXTAUTH_SECRET', 'NEXTAUTH_URL']
  const missingEnvs = requiredEnvs.filter(key => !process.env[key])
  if (missingEnvs.length > 0) {
    checks.environment = { status: 'warning', message: `Missing: ${missingEnvs.join(', ')}` }
  } else {
    checks.environment = { status: 'ok' }
  }

  // 4. External services
  const whatsappConfigured = !!process.env.WHATSAPP_CLOUD_API_TOKEN
  const emailConfigured = !!process.env.RESEND_API_KEY || !!process.env.SMTP_HOST
  const livekitConfigured = !!process.env.LIVEKIT_API_KEY

  checks.whatsapp = whatsappConfigured
    ? { status: 'ok' }
    : { status: 'unconfigured', message: 'WhatsApp API not configured' }

  checks.email = emailConfigured
    ? { status: 'ok' }
    : { status: 'unconfigured', message: 'Email service not configured' }

  checks.livekit = livekitConfigured
    ? { status: 'ok' }
    : { status: 'unconfigured', message: 'LiveKit not configured (demo mode)' }

  return NextResponse.json(
    {
      status: healthy ? 'healthy' : 'degraded',
      timestamp: new Date().toISOString(),
      version: process.env.npm_package_version || '0.1.0',
      checks,
    },
    { status: healthy ? 200 : 503 }
  )
}
