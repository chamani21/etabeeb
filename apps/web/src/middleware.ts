import createMiddleware from 'next-intl/middleware'
import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { locales, defaultLocale } from './i18n'
import { getToken } from 'next-auth/jwt'

const intlMiddleware = createMiddleware({
  locales,
  defaultLocale,
  localePrefix: 'as-needed', // /ps/... for non-default, / for ps default
})

const protectedPaths = ['/patient', '/doctor', '/admin', '/account']

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl

  if (pathname.startsWith('/api/')) {
    // Protect API routes — add CSRF check header requirement.
    // Public: NextAuth's own routes and the unauthenticated health probe.
    if (!pathname.startsWith('/api/auth/') && pathname !== '/api/health') {
      const origin = request.headers.get('origin')
      const host = request.headers.get('host')
      // Only allow same-origin API calls
      if (origin && host && !origin.includes(host)) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
      }

      const token = await getToken({ req: request })
      if (!token) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
      }
    }

    // API routes are not localized: never let next-intl rewrite them to
    // /<locale>/api/..., which has no route and returns 404.
    return NextResponse.next()
  }

  // Check UI protected paths
  const isProtectedPath = protectedPaths.some((path) => 
    pathname.startsWith(path) || locales.some((locale) => pathname.startsWith(`/${locale}${path}`))
  )

  if (isProtectedPath) {
    const token = await getToken({ req: request })
    if (!token) {
      const loginUrl = new URL('/login', request.url)
      return NextResponse.redirect(loginUrl)
    }
  }

  return intlMiddleware(request)
}

export const config = {
  matcher: [
    // Skip internals and static files.
    // api/hooks: n8n → app hooks authenticate with the x-etabib-key shared
    // secret inside each route handler (no browser session exists).
    '/((?!_next|_vercel|api/webhooks|api/hooks/|.*\\..*).*)',
  ],
}
