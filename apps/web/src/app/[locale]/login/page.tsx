'use client'

import { useState } from 'react'
import { signIn } from 'next-auth/react'
import { useRouter, useParams } from 'next/navigation'
import Link from 'next/link'

export default function LoginPage() {
  const params = useParams()
  const locale = (params?.locale as string) || 'ps'
  const [phone, setPhone] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const router = useRouter()

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setLoading(true)

    const res = await signIn('credentials', {
      redirect: false,
      phone: phone.trim(),
      password,
    })

    setLoading(false)

    if (res?.error) {
      setError(
        locale === 'ps' ? 'د تلیفون شمیره یا پټنوم غلط دي' :
        locale === 'ur' ? 'فون نمبر یا پاس ورڈ غلط ہے' :
        'Invalid phone or password'
      )
    } else {
      // Fetch session to determine role for redirect
      const sessionRes = await fetch('/api/auth/session')
      const session = await sessionRes.json()
      const role = session?.user?.role

      if (role === 'administrator') {
        router.push(`/${locale}/admin/dashboard`)
      } else if (role === 'practitioner') {
        router.push(`/${locale}/doctor/dashboard`)
      } else {
        router.push(`/${locale}/patient/dashboard`)
      }
    }
  }

  const labels = {
    title: locale === 'ps' ? 'ای طبیب' : locale === 'ur' ? 'ای طبیب' : 'eTabeeb',
    subtitle: locale === 'ps' ? 'لاګ ان شئ' : locale === 'ur' ? 'لاگ ان کریں' : 'Sign In',
    phone: locale === 'ps' ? 'د تلیفون شمیره' : locale === 'ur' ? 'فون نمبر' : 'Phone Number',
    password: locale === 'ps' ? 'پټنوم' : locale === 'ur' ? 'پاس ورڈ' : 'Password',
    login: locale === 'ps' ? 'لاګ ان' : locale === 'ur' ? 'لاگ ان' : 'Log In',
    loading: locale === 'ps' ? 'روان دی...' : locale === 'ur' ? 'لوڈ ہو رہا ہے...' : 'Loading...',
    register: locale === 'ps' ? 'نوی اکاونټ جوړ کړئ' : locale === 'ur' ? 'نیا اکاؤنٹ بنائیں' : 'Create New Account',
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center py-12 px-4 sm:px-6 lg:px-8 bg-[#f0faf5]">
      <div className="w-full max-w-md space-y-8">
        <div className="text-center">
          <div className="inline-flex items-center justify-center w-16 h-16 bg-[#00523a] rounded-2xl mb-4">
            <span className="text-white text-2xl">🏥</span>
          </div>
          <h2 className="text-3xl font-bold text-[#00523a]">{labels.title}</h2>
          <p className="mt-2 text-sm text-[#5D6F69]">{labels.subtitle}</p>
        </div>

        <div className="bg-white rounded-2xl shadow-sm border border-[#DDE7E2] p-8">
          <form className="space-y-5" onSubmit={handleLogin}>
            {error && (
              <div className="bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-3 rounded-lg">
                {error}
              </div>
            )}
            <div>
              <label htmlFor="phone" className="block text-sm font-medium text-[#05201a] mb-1">
                {labels.phone}
              </label>
              <input
                id="phone"
                name="phone"
                type="text"
                inputMode="tel"
                required
                className="block w-full rounded-lg border border-[#DDE7E2] px-3 py-2.5 text-[#05201a] placeholder-[#5D6F69] focus:outline-none focus:border-[#00523a] focus:ring-1 focus:ring-[#00523a] sm:text-sm"
                placeholder="+93 / +92 ..."
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                dir="ltr"
              />
            </div>
            <div>
              <label htmlFor="password" className="block text-sm font-medium text-[#05201a] mb-1">
                {labels.password}
              </label>
              <input
                id="password"
                name="password"
                type="password"
                required
                className="block w-full rounded-lg border border-[#DDE7E2] px-3 py-2.5 text-[#05201a] focus:outline-none focus:border-[#00523a] focus:ring-1 focus:ring-[#00523a] sm:text-sm"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full flex justify-center items-center gap-2 rounded-lg bg-[#00523a] px-3 py-3 text-sm font-semibold text-white shadow-sm hover:bg-[#006d4e] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#00523a] disabled:opacity-60 disabled:cursor-not-allowed transition"
            >
              {loading ? (
                <>
                  <svg className="animate-spin w-4 h-4" viewBox="0 0 24 24" fill="none">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                  {labels.loading}
                </>
              ) : labels.login}
            </button>
          </form>

          <div className="mt-6 text-center">
            <Link href={`/${locale}/register`} className="text-[#00523a] hover:text-[#006d4e] text-sm font-medium">
              {labels.register}
            </Link>
          </div>
        </div>

        <div className="text-center text-xs text-[#5D6F69]">
          <p>WhatsApp: <a href="tel:03332357055" className="text-[#00523a]">03332357055</a></p>
        </div>
      </div>
    </div>
  )
}
