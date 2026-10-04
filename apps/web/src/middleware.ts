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
    // Public: NextAuth, health, patient video links (token is the credential),
    // integration hooks (shared key / signature checked in each handler; also
    // excluded by the matcher) and the signed LiveKit webhook.
    const publicApi =
      pathname.startsWith('/api/auth/') ||
      pathname.startsWith('/api/hooks/') ||
      pathname === '/api/health' ||
      pathname.startsWith('/api/video/patient/') ||
      pathname === '/api/video/livekit-webhook'
    if (!publicApi) {
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
      // Return to the requested page after sign-in (e.g. the case link in WhatsApp)
      loginUrl.searchParams.set('callbackUrl', `${pathname}${request.nextUrl.search}`)
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
