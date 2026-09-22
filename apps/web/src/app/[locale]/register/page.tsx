'use client'

import { useState } from 'react'
import { useRouter, useParams } from 'next/navigation'
import Link from 'next/link'
import { signIn } from 'next-auth/react'

export default function RegisterPage() {
  const params = useParams()
  const locale = (params?.locale as string) || 'ps'
  const [displayName, setDisplayName] = useState('')
  const [phone, setPhone] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const router = useRouter()

  const t = {
    title: locale === 'ps' ? 'ای طبیب' : locale === 'ur' ? 'ای طبیب' : 'eTabeeb',
    subtitle: locale === 'ps' ? 'نوی اکاونټ' : locale === 'ur' ? 'نیا اکاؤنٹ' : 'Create Account',
    name: locale === 'ps' ? 'نوم' : locale === 'ur' ? 'نام' : 'Full Name',
    phone: locale === 'ps' ? 'د تلیفون شمیره' : locale === 'ur' ? 'فون نمبر' : 'Phone Number',
    password: locale === 'ps' ? 'پټنوم' : locale === 'ur' ? 'پاس ورڈ' : 'Password',
    confirm: locale === 'ps' ? 'پټنوم تکرار' : locale === 'ur' ? 'پاس ورڈ تصدیق' : 'Confirm Password',
    submit: locale === 'ps' ? 'ثبت کړئ' : locale === 'ur' ? 'رجسٹر کریں' : 'Register',
    loading: locale === 'ps' ? 'روان دی...' : locale === 'ur' ? 'لوڈ ہو رہا ہے...' : 'Loading...',
    login: locale === 'ps' ? 'لاګ ان شئ' : locale === 'ur' ? 'لاگ ان کریں' : 'Already have an account? Sign In',
    mismatch: locale === 'ps' ? 'پټنومونه سره نه دي ورته' : locale === 'ur' ? 'پاس ورڈ مماثل نہیں ہیں' : 'Passwords do not match',
    minPassword: locale === 'ps' ? 'پټنوم باید لږ تر لږه ۶ توري ولري' : 'Password must be at least 6 characters',
  }

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')

    if (password !== confirmPassword) {
      setError(t.mismatch)
      return
    }
    if (password.length < 6) {
      setError(t.minPassword)
      return
    }

    setLoading(true)

    try {
      const res = await fetch('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          displayName: displayName.trim(),
          phone: phone.trim(),
          password,
        }),
      })

      if (res.ok) {
        const loginRes = await signIn('credentials', {
          redirect: false,
          phone: phone.trim(),
          password,
        })
        if (!loginRes?.error) {
          router.push(`/${locale}/patient/dashboard`)
        } else {
          router.push(`/${locale}/login`)
        }
      } else {
        const data = await res.json()
        if (res.status === 409) {
          setError(
            locale === 'ps' ? 'دا تلیفون شمیره دمخه ثبت شوې ده' :
            locale === 'ur' ? 'یہ فون نمبر پہلے سے رجسٹرڈ ہے' :
            'This phone number is already registered'
          )
        } else {
          setError(data.error || (locale === 'ps' ? 'ستونزه رامنځته شوه' : 'Something went wrong'))
        }
      }
    } catch {
      setError(locale === 'ps' ? 'یو ستونزه رامنځته شوه' : 'An error occurred')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center py-12 px-4 sm:px-6 lg:px-8 bg-[#f0faf5]">
      <div className="w-full max-w-md space-y-8">
        <div className="text-center">
          <div className="inline-flex items-center justify-center w-16 h-16 bg-[#00523a] rounded-2xl mb-4">
            <span className="text-white text-2xl">🏥</span>
          </div>
          <h2 className="text-3xl font-bold text-[#00523a]">{t.title}</h2>
          <p className="mt-2 text-sm text-[#5D6F69]">{t.subtitle}</p>
        </div>

        <div className="bg-white rounded-2xl shadow-sm border border-[#DDE7E2] p-8">
          <form className="space-y-4" onSubmit={handleRegister}>
            {error && (
              <div className="bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-3 rounded-lg">
                {error}
              </div>
            )}
            <div>
              <label htmlFor="displayName" className="block text-sm font-medium text-[#05201a] mb-1">
                {t.name}
              </label>
              <input
                id="displayName"
                type="text"
                required
                minLength={2}
                className="block w-full rounded-lg border border-[#DDE7E2] px-3 py-2.5 text-[#05201a] placeholder-[#5D6F69] focus:outline-none focus:border-[#00523a] focus:ring-1 focus:ring-[#00523a] sm:text-sm"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
              />
            </div>
            <div>
              <label htmlFor="phone" className="block text-sm font-medium text-[#05201a] mb-1">
                {t.phone}
              </label>
              <input
                id="phone"
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
                {t.password}
              </label>
              <input
                id="password"
                type="password"
                required
                minLength={6}
                className="block w-full rounded-lg border border-[#DDE7E2] px-3 py-2.5 text-[#05201a] focus:outline-none focus:border-[#00523a] focus:ring-1 focus:ring-[#00523a] sm:text-sm"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </div>
            <div>
              <label htmlFor="confirmPassword" className="block text-sm font-medium text-[#05201a] mb-1">
                {t.confirm}
              </label>
              <input
                id="confirmPassword"
                type="password"
                required
                className="block w-full rounded-lg border border-[#DDE7E2] px-3 py-2.5 text-[#05201a] focus:outline-none focus:border-[#00523a] focus:ring-1 focus:ring-[#00523a] sm:text-sm"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full flex justify-center items-center gap-2 rounded-lg bg-[#00523a] px-3 py-3 text-sm font-semibold text-white shadow-sm hover:bg-[#006d4e] disabled:opacity-60 disabled:cursor-not-allowed transition mt-2"
            >
              {loading ? (
                <>
                  <svg className="animate-spin w-4 h-4" viewBox="0 0 24 24" fill="none">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                  {t.loading}
                </>
              ) : t.submit}
            </button>
          </form>

          <div className="mt-6 text-center">
            <Link href={`/${locale}/login`} className="text-[#00523a] hover:text-[#006d4e] text-sm font-medium">
              {t.login}
            </Link>
          </div>
        </div>
      </div>
    </div>
  )
}
