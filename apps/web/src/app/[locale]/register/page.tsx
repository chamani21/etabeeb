'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { signIn } from 'next-auth/react'

export default function RegisterPage() {
  const [displayName, setDisplayName] = useState('')
  const [phone, setPhone] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const router = useRouter()

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')

    if (password !== confirmPassword) {
      setError('پټنومونه سره نه دي ورته')
      return
    }

    setLoading(true)

    try {
      const res = await fetch('/api/auth/register', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ displayName, phone, password }),
      })

      if (res.ok) {
        const loginRes = await signIn('credentials', {
          redirect: false,
          phone,
          password,
        })
        if (!loginRes?.error) {
          router.push('/patient/dashboard')
        } else {
          router.push('/login')
        }
      } else {
        const data = await res.json()
        setError(data.error || 'د ثبتولو پر مهال ستونزه رامنځته شوه')
      }
    } catch (err) {
      setError('یو څه غلط شول')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center py-12 px-4 sm:px-6 lg:px-8 bg-surface text-on-surface">
      <div className="w-full max-w-md space-y-8">
        <div>
          <h2 className="mt-6 text-center text-3xl font-bold tracking-tight text-primary-container">
            ای طبیب
          </h2>
          <p className="mt-2 text-center text-sm">
            نوی اکاونټ جوړ کړئ
          </p>
        </div>
        <form className="mt-8 space-y-6" onSubmit={handleRegister}>
          {error && <div className="text-error text-center">{error}</div>}
          <div className="-space-y-px rounded-md shadow-sm">
            <div>
              <label htmlFor="displayName" className="sr-only">نوم</label>
              <input
                id="displayName"
                name="displayName"
                type="text"
                required
                className="relative block w-full rounded-t-md border-0 py-1.5 text-gray-900 ring-1 ring-inset ring-gray-300 placeholder:text-gray-400 focus:z-10 focus:ring-2 focus:ring-inset focus:ring-primary-container sm:text-sm sm:leading-6"
                placeholder="نوم"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
              />
            </div>
            <div>
              <label htmlFor="phone" className="sr-only">د تلیفون شمیره</label>
              <input
                id="phone"
                name="phone"
                type="text"
                required
                className="relative block w-full border-0 py-1.5 text-gray-900 ring-1 ring-inset ring-gray-300 placeholder:text-gray-400 focus:z-10 focus:ring-2 focus:ring-inset focus:ring-primary-container sm:text-sm sm:leading-6"
                placeholder="د تلیفون شمیره"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                dir="ltr"
              />
            </div>
            <div>
              <label htmlFor="password" className="sr-only">پټنوم</label>
              <input
                id="password"
                name="password"
                type="password"
                required
                className="relative block w-full border-0 py-1.5 text-gray-900 ring-1 ring-inset ring-gray-300 placeholder:text-gray-400 focus:z-10 focus:ring-2 focus:ring-inset focus:ring-primary-container sm:text-sm sm:leading-6"
                placeholder="پټنوم"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </div>
            <div>
              <label htmlFor="confirmPassword" className="sr-only">پټنوم تکرار</label>
              <input
                id="confirmPassword"
                name="confirmPassword"
                type="password"
                required
                className="relative block w-full rounded-b-md border-0 py-1.5 text-gray-900 ring-1 ring-inset ring-gray-300 placeholder:text-gray-400 focus:z-10 focus:ring-2 focus:ring-inset focus:ring-primary-container sm:text-sm sm:leading-6"
                placeholder="پټنوم تکرار"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
              />
            </div>
          </div>

          <div>
            <button
              type="submit"
              disabled={loading}
              className="group relative flex w-full justify-center rounded-md bg-primary-container px-3 py-2 text-sm font-semibold text-white hover:bg-primary focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
            >
              {loading ? 'روان دی...' : 'ثبت کړئ'}
            </button>
          </div>
        </form>

        <div className="text-center mt-4">
          <Link href="/login" className="text-primary-container hover:text-primary">
            لاګ ان شئ
          </Link>
        </div>
      </div>
    </div>
  )
}
