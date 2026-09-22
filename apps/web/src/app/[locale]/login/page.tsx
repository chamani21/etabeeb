'use client'

import { useState } from 'react'
import { signIn } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'

export default function LoginPage() {
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
      phone,
      password,
    })

    setLoading(false)

    if (res?.error) {
      setError('Invalid phone or password')
    } else {
      router.push('/patient/dashboard')
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
            لاګ ان شئ
          </p>
        </div>
        <form className="mt-8 space-y-6" onSubmit={handleLogin}>
          {error && <div className="text-error text-center">{error}</div>}
          <div className="-space-y-px rounded-md shadow-sm">
            <div>
              <label htmlFor="phone" className="sr-only">د تلیفون شمیره</label>
              <input
                id="phone"
                name="phone"
                type="text"
                required
                className="relative block w-full rounded-t-md border-0 py-1.5 text-gray-900 ring-1 ring-inset ring-gray-300 placeholder:text-gray-400 focus:z-10 focus:ring-2 focus:ring-inset focus:ring-primary-container sm:text-sm sm:leading-6"
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
                className="relative block w-full rounded-b-md border-0 py-1.5 text-gray-900 ring-1 ring-inset ring-gray-300 placeholder:text-gray-400 focus:z-10 focus:ring-2 focus:ring-inset focus:ring-primary-container sm:text-sm sm:leading-6"
                placeholder="پټنوم"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </div>
          </div>

          <div>
            <button
              type="submit"
              disabled={loading}
              className="group relative flex w-full justify-center rounded-md bg-primary-container px-3 py-2 text-sm font-semibold text-white hover:bg-primary focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
            >
              {loading ? 'روان دی...' : 'لاګ ان'}
            </button>
          </div>
        </form>

        <div className="text-center mt-4">
          <Link href="/register" className="text-primary-container hover:text-primary">
            نوی اکاونټ جوړ کړئ
          </Link>
        </div>
        
        <div className="mt-8 text-center text-sm text-gray-500">
          <p>د مرستې لپاره واټساپ شمیره: 03332357055</p>
        </div>
      </div>
    </div>
  )
}
