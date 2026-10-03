/**
 * Middleware routing: API routes must never be locale-rewritten by next-intl,
 * NextAuth routes and /api/health are public, everything else under /api/
 * still requires a session. Synthetic data only.
 */
import { describe, it, expect, beforeAll } from 'vitest'
import { NextRequest } from 'next/server'
import { encode } from 'next-auth/jwt'
import { middleware } from '@/middleware'

const SECRET = 'synthetic-nextauth-secret-not-a-real-secret'
let sessionCookie = ''

beforeAll(async () => {
  process.env.NEXTAUTH_SECRET = SECRET
  const jwt = await encode({
    token: {
      id: 'synthetic-user',
      publicId: 'synthetic-public-id',
      phone: '+920000000000',
      displayName: 'Synthetic Admin',
      role: 'administrator',
      locale: 'en',
    },
    secret: SECRET,
  })
  sessionCookie = `next-auth.session-token=${jwt}`
})

function req(path: string, headers: Record<string, string> = {}) {
  return new NextRequest(`http://localhost${path}`, { headers: { host: 'localhost', ...headers } })
}

const passedThrough = (res: Response) => res.headers.get('x-middleware-next') === '1'
const rewrite = (res: Response) => res.headers.get('x-middleware-rewrite')

describe('middleware API routing', () => {
  it.each(['/api/auth/session', '/api/auth/csrf', '/api/auth/providers', '/api/auth/callback/credentials'])(
    '%s is public and not locale-rewritten',
    async (path) => {
      const res = await middleware(req(path))
      expect(res.status).toBe(200)
      expect(passedThrough(res)).toBe(true)
      expect(rewrite(res)).toBeNull()
    }
  )

  it('/api/health is public and not locale-rewritten', async () => {
    const res = await middleware(req('/api/health'))
    expect(passedThrough(res)).toBe(true)
    expect(rewrite(res)).toBeNull()
  })

  it.each([
    '/api/admin/cases/00000000-0000-0000-0000-000000000000/intake',
    '/api/doctor/cases/00000000-0000-0000-0000-000000000000/decision',
    '/api/healthz',
    '/api/health/extra',
  ])('%s without a session is rejected with 401', async (path) => {
    const res = await middleware(req(path))
    expect(res.status).toBe(401)
  })

  it('authenticated API calls pass through without a locale rewrite', async () => {
    const res = await middleware(req('/api/admin/cases/00000000-0000-0000-0000-000000000000/intake', { cookie: sessionCookie }))
    expect(passedThrough(res)).toBe(true)
    expect(rewrite(res)).toBeNull()
  })

  it('cross-origin API calls are still rejected', async () => {
    const res = await middleware(req('/api/admin/cases/x/intake', { cookie: sessionCookie, origin: 'https://evil.example' }))
    expect(res.status).toBe(403)
  })

  it('UI pages still go through next-intl', async () => {
    const res = await middleware(req('/login'))
    expect(rewrite(res)).toBe('http://localhost/ps/login')
  })

  it('protected UI pages still redirect to /login without a session', async () => {
    for (const path of ['/admin', '/admin/cases', '/doctor/cases', '/account/password']) {
      const res = await middleware(req(path))
      expect(res.status).toBe(307)
      const location = new URL(res.headers.get('location')!)
      expect(location.pathname).toBe('/login')
      expect(location.searchParams.get('callbackUrl')).toBe(path)
    }
  })

  it('the staff reset page and the reset API are reachable without a session', async () => {
    expect((await middleware(req('/reset-password'))).status).not.toBe(307)
    const api = await middleware(req('/api/auth/password-reset'))
    expect(passedThrough(api)).toBe(true)
  })

  it('new admin/doctor/account APIs require a session', async () => {
    for (const path of ['/api/admin/cases', '/api/admin/senders', '/api/admin/status', '/api/doctor/cases', '/api/account/password']) {
      expect((await middleware(req(path))).status).toBe(401)
    }
  })
})

describe('post-login callback (WhatsApp case links)', () => {
  it('keeps the requested case link, including the query string', async () => {
    const res = await middleware(req('/admin/cases/0b6a9a3e-1111-4222-8333-444455556666?x=1'))
    expect(new URL(res.headers.get('location')!).searchParams.get('callbackUrl')).toBe('/admin/cases/0b6a9a3e-1111-4222-8333-444455556666?x=1')
  })

  it('accepts only same-site staff paths', async () => {
    const { safeStaffCallback } = await import('@/components/staff/callback')
    for (const ok of ['/admin/cases/0b6a9a3e-1111-4222-8333-444455556666', '/en/admin/cases', '/doctor/cases/abc', '/admin/cases?status=OPEN']) {
      expect(safeStaffCallback(ok)).toBe(ok)
    }
    for (const bad of [null, '', 'https://evil.example/admin', '//evil.example/admin', '/\\evil.example', '/patient/dashboard', '/login', '/admin<script>', 'javascript:alert(1)', '/api/admin/cases']) {
      expect(safeStaffCallback(bad)).toBeNull()
    }
  })
})
