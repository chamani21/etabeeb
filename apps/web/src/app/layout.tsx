import type { Metadata } from 'next'
import localFont from 'next/font/local'
import './globals.css'
import { Providers } from '../components/providers'

// Keep the Pashto font in the release image so builds need no Google Fonts access.
const notoNaskhArabic = localFont({
  src: './fonts/NotoNaskhArabic.ttf',
  weight: '400',
  display: 'swap',
  variable: '--font-noto-naskh-arabic',
})

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_APP_URL ?? 'https://etabeeb.online/etabeeb'),
  title: {
    default: 'ای طبیب — آنلاین طبي مشوره',
    template: '%s | ای طبیب',
  },
  description: 'ای طبیب — د آنلاین طبي مشورې پلیټفارم | Kozhak Specialist Clinic',
  alternates: {
    canonical: 'https://etabeeb.online/etabeeb',
  },
  openGraph: {
    type: 'website',
    url: 'https://etabeeb.online/etabeeb',
    siteName: 'eTabeeb',
    title: 'ای طبیب — آنلاین طبي مشوره',
    description: 'ای طبیب — د آنلاین طبي مشورې پلیټفارم | Kozhak Specialist Clinic',
    locale: 'ps_AF',
  },
  twitter: {
    card: 'summary',
    title: 'ای طبیب — آنلاین طبي مشوره',
    description: 'ای طبیب — د آنلاین طبي مشورې پلیټفارم | Kozhak Specialist Clinic',
  },
  manifest: '/manifest.json',
  robots: {
    index: true,
    follow: true,
    googleBot: { index: true, follow: true },
  },
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html
      lang="ps"
      dir="rtl"
      className={notoNaskhArabic.variable}
      suppressHydrationWarning
    >
      <body className="bg-surface text-on-surface font-sans antialiased">
        <Providers>{children}</Providers>
      </body>
    </html>
  )
}
