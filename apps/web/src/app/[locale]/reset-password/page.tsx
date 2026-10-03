'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import { api } from '@/components/staff/api'
import { Button, Card, Field, Notice, inputCls, useAction } from '@/components/staff/ui'

// Staff password reset (admin-issued one-time link). The token is read from the
// URL fragment (#token=…), which browsers never send to the server, then removed
// from the address bar and posted in the request body.
export default function ResetPasswordPage() {
  const [token, setToken] = useState<string | null>(null)
  const [f, setF] = useState({ newPassword: '', confirmPassword: '' })
  const [done, setDone] = useState(false)
  const { busy, error, run } = useAction()
  useEffect(() => {
    const match = window.location.hash.match(/token=([A-Za-z0-9_-]+)/)
    setToken(match?.[1] ?? '')
    if (match) window.history.replaceState(null, '', window.location.pathname)
  }, [])
  return (
    <div dir="ltr" className="flex min-h-screen items-start justify-center bg-gray-50 px-4 py-12 text-left text-gray-900">
      <div className="w-full max-w-md space-y-4">
        <h1 className="text-2xl font-bold text-emerald-900">Set a new password</h1>
        {token === '' && <Notice kind="error">This reset link is incomplete. Ask an administrator for a new link.</Notice>}
        {done ? (
          <Card>
            <Notice kind="success">Your password has been changed. Any previous sessions were signed out.</Notice>
            <div className="mt-3"><Link href="/login" className="text-emerald-800 underline">Sign in</Link></div>
          </Card>
        ) : token ? (
          <Card>
            <form
              className="space-y-3"
              onSubmit={(e) => {
                e.preventDefault()
                void run(async () => {
                  await api('/api/auth/password-reset', { body: { token, ...f } })
                  setDone(true)
                })
              }}
            >
              <Field label="New password" hint="At least 12 characters. Avoid your name or phone number.">
                <input type="password" autoComplete="new-password" className={inputCls} value={f.newPassword} onChange={(e) => setF({ ...f, newPassword: e.target.value })} />
              </Field>
              <Field label="Confirm new password"><input type="password" autoComplete="new-password" className={inputCls} value={f.confirmPassword} onChange={(e) => setF({ ...f, confirmPassword: e.target.value })} /></Field>
              {error && <Notice kind="error">{error}</Notice>}
              <Button type="submit" disabled={busy || !f.newPassword || !f.confirmPassword}>Set password</Button>
            </form>
          </Card>
        ) : null}
      </div>
    </div>
  )
}
