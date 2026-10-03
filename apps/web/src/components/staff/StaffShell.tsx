'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { signOut } from 'next-auth/react'

export interface NavItem {
  href: string
  label: string
}

/** Staff portal frame (English, LTR inside the RTL patient site). */
export function StaffShell({
  title,
  user,
  nav,
  children,
}: {
  title: string
  user: string
  nav: NavItem[]
  children: React.ReactNode
}) {
  const pathname = usePathname() ?? ''
  return (
    <div dir="ltr" className="flex min-h-screen bg-gray-50 text-left font-sans text-gray-900">
      <aside className="hidden w-56 flex-shrink-0 flex-col bg-[#0B3D2E] text-white md:flex">
        <div className="border-b border-white/10 p-4">
          <div className="text-lg font-bold text-[#D4AF37]">eTabeeb V1</div>
          <div className="text-xs text-white/70">{title}</div>
        </div>
        <nav className="flex-1 py-2">
          {nav.map((item) => {
            const active = pathname.endsWith(item.href) || pathname.includes(`${item.href}/`)
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`block px-4 py-2 text-sm ${active ? 'bg-white/15 text-[#D4AF37]' : 'hover:bg-white/10'}`}
              >
                {item.label}
              </Link>
            )
          })}
        </nav>
      </aside>
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-14 items-center justify-between border-b border-gray-200 bg-white px-4">
          <nav className="flex gap-3 text-sm md:hidden">
            {nav.map((item) => (
              <Link key={item.href} href={item.href} className="text-emerald-800 underline">
                {item.label}
              </Link>
            ))}
          </nav>
          <div className="hidden text-sm font-semibold text-gray-700 md:block">{title}</div>
          <div className="flex items-center gap-3 text-sm">
            <span className="text-gray-700">{user}</span>
            <button
              onClick={() => signOut({ callbackUrl: '/login' })}
              className="rounded border border-gray-300 px-2 py-1 text-gray-700 hover:bg-gray-50"
            >
              Log out
            </button>
          </div>
        </header>
        <main className="flex-1 overflow-y-auto p-4 md:p-6">{children}</main>
      </div>
    </div>
  )
}
