'use client'

import { signOut } from 'next-auth/react'

export function SignOutButton({ locale }: { locale: string }) {
  const label =
    locale === 'ps' ? 'وتل' :
    locale === 'ur' ? 'لاگ آؤٹ' :
    locale === 'fa' ? 'خروج' :
    'Log Out'

  return (
    <button
      onClick={() => signOut({ callbackUrl: `/${locale}/login` })}
      className="text-sm px-3 py-1.5 bg-white/10 hover:bg-white/20 text-white rounded-full border border-white/20 transition"
    >
      {label}
    </button>
  )
}
