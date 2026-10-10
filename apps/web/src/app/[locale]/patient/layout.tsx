import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { SignOutButton } from '@/components/sign-out-button'

export default async function PatientLayout({
  children,
  params,
}: {
  children: React.ReactNode
  params: Promise<{ locale: string }>
}) {
  const { locale } = await params
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) {
    redirect(`/${locale}/login`)
  }
  // Role guard
  if (session.user.role === 'administrator') {
    redirect(`/${locale}/admin/dashboard`)
  }
  if (session.user.role === 'practitioner') {
    redirect(`/${locale}/doctor/dashboard`)
  }

  const displayName = session.user.displayName || session.user.phone || 'Patient'
  const isRtl = ['ps', 'fa', 'ur'].includes(locale)

  return (
    <div className="min-h-screen bg-[#f0faf5]" dir={isRtl ? 'rtl' : 'ltr'}>
      {/* Top Header */}
      <header className="bg-[#00523a] text-white px-4 py-3 flex items-center justify-between sticky top-0 z-50 shadow-md">
        <Link href={`/${locale}/patient/dashboard`} className="font-bold text-lg text-[#D4AF37]">
          ای طبیب
        </Link>
        <div className="flex items-center gap-3">
          <span className="text-sm font-medium text-white/90 hidden sm:block">{displayName}</span>
          <SignOutButton locale={locale} />
        </div>
      </header>

      {/* Main Content */}
      <main className="pb-20">
        <div className="max-w-md mx-auto p-4 space-y-4">
          {children}
        </div>
      </main>

      {/* Bottom Navigation */}
      <nav className="fixed bottom-0 left-0 right-0 bg-white border-t border-[#DDE7E2] z-50 shadow-lg">
        <div className="max-w-md mx-auto flex justify-around p-2">
          <Link
            href={`/${locale}/patient/dashboard`}
            className="flex flex-col items-center p-2 text-[#5D6F69] hover:text-[#00523a] transition"
          >
            <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
            </svg>
            <span className="text-xs mt-1">
              {locale === 'ps' ? 'کور' : locale === 'ur' ? 'ہوم' : 'Home'}
            </span>
          </Link>
          <Link
            href={`/${locale}/patient/appointments`}
            className="flex flex-col items-center p-2 text-[#5D6F69] hover:text-[#00523a] transition"
          >
            <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
            </svg>
            <span className="text-xs mt-1">
              {locale === 'ps' ? 'وختونه' : locale === 'ur' ? 'ملاقاتیں' : 'Appts'}
            </span>
          </Link>
          <Link
            href={`/${locale}/patient/prescriptions`}
            className="flex flex-col items-center p-2 text-[#5D6F69] hover:text-[#00523a] transition"
          >
            <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
            </svg>
            <span className="text-xs mt-1">
              {locale === 'ps' ? 'نسخې' : locale === 'ur' ? 'نسخے' : 'Scripts'}
            </span>
          </Link>
          <Link
            href={`/${locale}/patient/profile`}
            className="flex flex-col items-center p-2 text-[#5D6F69] hover:text-[#00523a] transition"
          >
            <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
            </svg>
            <span className="text-xs mt-1">
              {locale === 'ps' ? 'پروفایل' : locale === 'ur' ? 'پروفائل' : 'Profile'}
            </span>
          </Link>
        </div>
      </nav>
    </div>
  )
}
