import { NextIntlClientProvider } from 'next-intl'
import { getMessages, getTranslations } from 'next-intl/server'
import { notFound } from 'next/navigation'
import { locales, rtlLocales, type Locale } from '../../i18n'
import type { Metadata } from 'next'

interface LocaleLayoutProps {
  children: React.ReactNode
  params: { locale: string }
}

export function generateStaticParams() {
  return locales.map((locale) => ({ locale }))
}

export async function generateMetadata({
  params: { locale },
}: LocaleLayoutProps): Promise<Metadata> {
  const t = await getTranslations({ locale, namespace: 'meta' })
  return {
    title: t('title'),
    description: t('description'),
    alternates: {
      languages: Object.fromEntries(
        locales.map((l) => [l, `/${l === 'ps' ? '' : l}`]),
      ),
    },
  }
}

export default async function LocaleLayout({
  children,
  params: { locale },
}: LocaleLayoutProps) {
  if (!locales.includes(locale as Locale)) notFound()

  const messages = await getMessages()
  const isRtl = rtlLocales.includes(locale as Locale)

  return (
    <html 
      lang={locale} 
      dir={isRtl ? 'rtl' : 'ltr'}
      className="var(--font-inter) var(--font-noto-naskh-arabic) var(--font-noto-nastaliq-urdu) var(--font-noto-serif)"
    >
      <body className="bg-surface text-on-surface font-naskh antialiased">
        <NextIntlClientProvider messages={messages}>
          {children}
        </NextIntlClientProvider>
      </body>
    </html>
  )
}
