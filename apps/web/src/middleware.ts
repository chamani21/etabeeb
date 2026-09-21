import createMiddleware from 'next-intl/middleware'
import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { locales, defaultLocale } from './i18n'

const intlMiddleware = createMiddleware({
  locales,
  defaultLocale,
  localePrefix: 'as-needed', // /ps/... for non-default, / for ps default
})

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl

  // Protect API routes — add CSRF check header requirement
  if (pathname.startsWith('/api/') && !pathname.startsWith('/api/auth/')) {
    const origin = request.headers.get('origin')
    const host = request.headers.get('host')
    // Only allow same-origin API calls
    if (origin && host && !origin.includes(host)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }
  }

  return intlMiddleware(request)
}

export const config = {
  matcher: [
    // Skip internals and static files
    '/((?!_next|_vercel|api/webhooks|.*\\..*).*)',
  ],
}
