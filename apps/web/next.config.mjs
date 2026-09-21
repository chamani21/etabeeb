import createNextIntlPlugin from 'next-intl/plugin'

const withNextIntl = createNextIntlPlugin('./src/i18n.ts')

/** @type {import('next').NextConfig} */
const nextConfig = {
  // Redirect old /etabeeb/ path to canonical /
  async redirects() {
    return [
      {
        source: '/etabeeb',
        destination: '/',
        permanent: true,
      },
      {
        source: '/etabeeb/:path*',
        destination: '/:path*',
        permanent: true,
      },
    ]
  },

  // Security headers
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: [
          { key: 'X-DNS-Prefetch-Control', value: 'on' },
          { key: 'X-Frame-Options', value: 'SAMEORIGIN' },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'Permissions-Policy', value: 'camera=(self), microphone=(self), geolocation=()' },
          {
            key: 'Content-Security-Policy',
            value: [
              "default-src 'self'",
              "script-src 'self' 'unsafe-eval' 'unsafe-inline'", // tighten after audit
              "style-src 'self' 'unsafe-inline'",
              "img-src 'self' data: blob: https://lh3.googleusercontent.com",
              "font-src 'self'",
              "connect-src 'self' wss: https:",
              "media-src 'self' blob:",
              "frame-ancestors 'none'",
            ].join('; '),
          },
        ],
      },
      // Never cache authenticated API responses or medical documents
      {
        source: '/api/(.*)',
        headers: [
          { key: 'Cache-Control', value: 'no-store, no-cache, must-revalidate, private' },
        ],
      },
    ]
  },

  // Image optimization
  images: {
    formats: ['image/avif', 'image/webp'],
    // Only allow our own domain for doctor photos
    domains: [],
  },

  // Experimental
  experimental: {
    typedRoutes: true,
  },
}

export default withNextIntl(nextConfig)
