'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import { signOut } from 'next-auth/react'
import { api } from '@/components/staff/api'
import { Button, Card, Field, Notice, inputCls, useAction } from '@/components/staff/ui'

export default function ChangePasswordPage() {
  const [me, setMe] = useState<{ displayName: string | null; role: string | null; mustChangePassword: boolean } | null>(null)
  const [f, setF] = useState({ currentPassword: '', newPassword: '', confirmPassword: '' })
  const { busy, error, run } = useAction()
  useEffect(() => {
    void api<{ user: typeof me }>('/api/account/me').then((r) => setMe(r.user)).catch(() => undefined)
  }, [])
  const home = me?.role === 'practitioner' ? '/doctor/cases' : '/admin/cases'
  return (
    <div dir="ltr" className="flex min-h-screen items-start justify-center bg-gray-50 px-4 py-12 text-left text-gray-900">
      <div className="w-full max-w-md space-y-4">
        <h1 className="text-2xl font-bold text-emerald-900">Change password</h1>
        {me?.mustChangePassword && <Notice kind="warning">Your password is temporary. Set a new password to continue.</Notice>}
        <Card>
          <form
            className="space-y-3"
            onSubmit={(e) => {
              e.preventDefault()
              void run(async () => {
                await api('/api/account/password', { body: f })
                // Every session (including this one) has been revoked server-side
                await signOut({ callbackUrl: '/login?changed=1' })
              })
            }}
          >
            <Field label="Current password"><input type="password" autoComplete="current-password" className={inputCls} value={f.currentPassword} onChange={(e) => setF({ ...f, currentPassword: e.target.value })} /></Field>
            <Field label="New password" hint="At least 12 characters. A long passphrase is best; avoid your name or phone number.">
              <input type="password" autoComplete="new-password" className={inputCls} value={f.newPassword} onChange={(e) => setF({ ...f, newPassword: e.target.value })} />
            </Field>
            <Field label="Confirm new password"><input type="password" autoComplete="new-password" className={inputCls} value={f.confirmPassword} onChange={(e) => setF({ ...f, confirmPassword: e.target.value })} /></Field>
            {error && <Notice kind="error">{error}</Notice>}
            <div className="flex items-center gap-3">
              <Button type="submit" disabled={busy || !f.currentPassword || !f.newPassword || !f.confirmPassword}>Change password</Button>
              {!me?.mustChangePassword && <Link href={home} className="text-sm text-emerald-800 underline">Cancel</Link>}
            </div>
            <p className="text-xs text-gray-500">After changing your password you will be signed out everywhere and asked to sign in again.</p>
          </form>
        </Card>
      </div>
    </div>
  )
}
