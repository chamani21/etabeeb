import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { SignOutButton } from '@/components/sign-out-button'

export default async function AdminLayout({
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
  if (session.user.role !== 'administrator') {
    redirect(`/${locale}/patient/dashboard`)
  }

  const displayName = session.user.displayName || 'Administrator'
  const isRtl = ['ps', 'fa', 'ur'].includes(locale)

  const menuItems = [
    { name: locale === 'ps' ? 'ډشبورډ' : 'Dashboard', href: `/${locale}/admin/dashboard` },
    { name: locale === 'ps' ? 'ډاکټران' : 'Doctors', href: `/${locale}/admin/doctors` },
    { name: locale === 'ps' ? 'ناروغان' : 'Patients', href: `/${locale}/admin/patients` },
    { name: locale === 'ps' ? 'وختونه' : 'Appointments', href: `/${locale}/admin/appointments` },
    { name: locale === 'ps' ? 'خبرتیاوې' : 'Notifications', href: `/${locale}/admin/notifications` },
    { name: locale === 'ps' ? 'رپوټونه' : 'Reports', href: `/${locale}/admin/reports` },
    { name: locale === 'ps' ? 'آډیټ' : 'Audit', href: `/${locale}/admin/audit` },
    { name: locale === 'ps' ? 'تنظیمات' : 'Settings', href: `/${locale}/admin/settings` },
  ]

  return (
    <div className="flex h-screen bg-gray-50 text-gray-900 font-sans" dir={isRtl ? 'rtl' : 'ltr'}>
      <aside className="w-64 bg-[#0B3D2E] text-white flex flex-col flex-shrink-0">
        <div className="p-6 border-b border-white/10">
          <h2 className="text-xl font-bold text-[#D4AF37]">eTabeeb Admin</h2>
          <p className="text-white/50 text-xs mt-0.5">{displayName}</p>
        </div>
        <nav className="flex-1 overflow-y-auto py-4">
          <ul className="space-y-0.5">
            {menuItems.map((item) => (
              <li key={item.name}>
                <Link
                  href={item.href}
                  className="block px-6 py-2.5 text-sm hover:bg-white/10 hover:text-[#D4AF37] transition-colors text-white/80"
                >
                  {item.name}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
        <div className="p-4 border-t border-white/10">
          <SignOutButton locale={locale} />
        </div>
      </aside>

      <main className="flex-1 flex flex-col min-w-0 overflow-hidden">
        <header className="bg-white border-b border-gray-200 px-6 py-4 flex justify-between items-center h-16 shadow-sm flex-shrink-0">
          <h1 className="text-lg font-semibold text-gray-800">
            {locale === 'ps' ? 'د اداري مرکز' : 'Operational Control Center'}
          </h1>
          <div className="flex items-center gap-3">
            <span className="text-sm font-medium text-gray-600">{displayName}</span>
          </div>
        </header>
        <div className="flex-1 overflow-y-auto p-6 bg-[#f0faf5]">
          {children}
        </div>
      </main>
    </div>
  )
}
