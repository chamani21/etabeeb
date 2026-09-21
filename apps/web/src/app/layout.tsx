import type { Metadata } from 'next'
import { Inter, Noto_Naskh_Arabic, Noto_Nastaliq_Urdu, Noto_Serif } from 'next/font/google'
import './globals.css'

// Self-hosted via next/font (no CDN dependency for low-bandwidth regions)
const inter = Inter({
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-inter',
})

const notoNaskhArabic = Noto_Naskh_Arabic({
  subsets: ['arabic'],
  weight: ['400', '500', '600', '700'],
  display: 'swap',
  variable: '--font-noto-naskh-arabic',
})

const notoNastaliqUrdu = Noto_Nastaliq_Urdu({
  subsets: ['arabic'],
  weight: ['400', '500', '600', '700'],
  display: 'swap',
  variable: '--font-noto-nastaliq-urdu',
})

const notoSerif = Noto_Serif({
  subsets: ['latin'],
  weight: ['400', '600', '700'],
  display: 'swap',
  variable: '--font-noto-serif',
})

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_APP_URL ?? 'https://etabeeb.online'),
  title: {
    default: 'ای طبیب — آنلاین طبي مشوره',
    template: '%s | ای طبیب',
  },
  description: 'ای طبیب — د آنلاین طبي مشورې پلیټفارم | Kozhak Specialist Clinic',
  themeColor: '#004128',
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
      className={`${inter.variable} ${notoNaskhArabic.variable} ${notoNastaliqUrdu.variable} ${notoSerif.variable}`}
    >
      <body className="bg-surface text-on-surface font-naskh antialiased">
        {children}
      </body>
    </html>
  )
}
