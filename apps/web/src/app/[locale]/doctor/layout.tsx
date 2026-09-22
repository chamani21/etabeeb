import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { SignOutButton } from '@/components/sign-out-button'

export default async function DoctorLayout({
  children,
  params: { locale },
}: {
  children: React.ReactNode
  params: { locale: string }
}) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) {
    redirect(`/${locale}/login`)
  }
  if (session.user.role !== 'practitioner' && session.user.role !== 'administrator') {
    redirect(`/${locale}/patient/dashboard`)
  }

  const displayName = session.user.displayName || 'Doctor'
  const isRtl = ['ps', 'fa', 'ur'].includes(locale)

  const navItems = [
    { href: `/${locale}/doctor/dashboard`, label: locale === 'ps' ? 'ډشبورډ' : 'Dashboard' },
    { href: `/${locale}/doctor/schedule`, label: locale === 'ps' ? 'شیډول' : 'Schedule' },
    { href: `/${locale}/doctor/appointments`, label: locale === 'ps' ? 'وختونه' : 'Appointments' },
    { href: `/${locale}/doctor/patients`, label: locale === 'ps' ? 'ناروغان' : 'Patients' },
    { href: `/${locale}/doctor/prescriptions`, label: locale === 'ps' ? 'نسخې' : 'Prescriptions' },
    { href: `/${locale}/doctor/profile`, label: locale === 'ps' ? 'پروفایل' : 'Profile' },
  ]

  return (
    <div className="min-h-screen flex bg-[#f0faf5] text-gray-900 font-sans" dir={isRtl ? 'rtl' : 'ltr'}>
      {/* Sidebar */}
      <aside className="w-64 bg-[#006d4e] text-white flex-shrink-0 hidden md:flex flex-col">
        <div className="p-4 border-b border-[#00523a]">
          <div className="text-xl font-bold text-[#D4AF37]">ای طبیب</div>
          <div className="text-sm text-white/70 mt-0.5">
            {locale === 'ps' ? 'ډاکټر پورټل' : 'Doctor Portal'}
          </div>
        </div>
        <nav className="p-4 space-y-1 flex-1">
          {navItems.map(item => (
            <Link
              key={item.href}
              href={item.href}
              className="block py-2 px-4 rounded-lg hover:bg-white/10 transition text-white/90 hover:text-white text-sm"
            >
              {item.label}
            </Link>
          ))}
        </nav>
        <div className="p-4 border-t border-[#00523a]">
          <div className="text-sm text-white/70 truncate mb-2">{displayName}</div>
          <SignOutButton locale={locale} />
        </div>
      </aside>

      {/* Main Content */}
      <div className="flex-1 flex flex-col min-h-screen overflow-hidden">
        {/* Top bar */}
        <header className="bg-white border-b border-gray-200 px-6 py-4 flex justify-between items-center shadow-sm">
          <div className="md:hidden font-bold text-[#006d4e]">ای طبیب</div>
          <div className="hidden md:block font-semibold text-gray-700">
            {locale === 'ps' ? 'ډاکټر پورټل' : locale === 'ur' ? 'ڈاکٹر پورٹل' : 'Doctor Portal'}
          </div>
          <div className="flex items-center gap-3">
            <span className="text-sm font-medium text-gray-600 hidden sm:block">{displayName}</span>
            <div className="md:hidden">
              <SignOutButton locale={locale} />
            </div>
          </div>
        </header>

        {/* Content area */}
        <main className="p-6 flex-1 overflow-auto bg-[#f0faf5]">
          {children}
        </main>
      </div>
    </div>
  )
}
