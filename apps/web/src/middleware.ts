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

const protectedPaths = ['/patient', '/doctor', '/admin']

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl

  // Protect API routes — add CSRF check header requirement
  if (pathname.startsWith('/api/')) {
    if (!pathname.startsWith('/api/auth/')) {
      const origin = request.headers.get('origin')
      const host = request.headers.get('host')
      // Only allow same-origin API calls if origin is present
      if (origin && host && !origin.includes(host)) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
      }

      // Public API routes that do not require auth:
      const isPublicApi =
        pathname === '/api/health' ||
        pathname.startsWith('/api/prescriptions/verify/') ||
        (request.method === 'GET' && (
          pathname === '/api/doctors' ||
          /^\/api\/doctors\/[^/]+\/slots$/.test(pathname)
        ))

      if (!isPublicApi) {
        const token = await getToken({ req: request })
        if (!token) {
          return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
        }
      }
    }

    // API paths have already completed CSRF/auth checks; don't feed them to next-intl.
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

  // The default Pashto homepage has an explicit app/page.tsx route. Sending the
  // bare base-path root back through as-needed locale detection loops to itself.
  if (pathname === '/') return NextResponse.next()

  return intlMiddleware(request)
}

export const config = {
  matcher: [
    // The bare /etabeeb base path must reach locale routing to serve the Pashto home page.
    '/',
    // Skip internals and static files
    '/((?!_next|_vercel|api/webhooks|.*\\..*).*)',
  ],
}
