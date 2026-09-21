import { getRequestConfig } from 'next-intl/server'
import { notFound } from 'next/navigation'

// Supported locales
export const locales = ['ps', 'fa', 'ur', 'en'] as const
export type Locale = (typeof locales)[number]

// RTL locales
export const rtlLocales: Locale[] = ['ps', 'fa', 'ur']

// Default locale
export const defaultLocale: Locale = 'ps'

// Timezone mapping
export const localeTimezones: Record<Locale, string> = {
  ps: 'Asia/Kabul', // Pashto — Afghanistan patients
  fa: 'Asia/Kabul', // Dari — Afghanistan patients
  ur: 'Asia/Karachi', // Urdu — Pakistan / clinic
  en: 'Asia/Karachi', // English — admin fallback
}

export default getRequestConfig(async ({ locale }) => {
  // Validate locale
  if (!locales.includes(locale as Locale)) notFound()

  return {
    messages: (await import(`../messages/${locale}.json`)).default,
    timeZone: localeTimezones[locale as Locale],
    // Kabul is UTC+4:30, Karachi is UTC+5 — 30 min difference
    // All timestamps stored in UTC; displayed per locale timezone
  }
})
