'use client'

import { useCallback, useEffect, useState } from 'react'
import { api } from '@/components/staff/api'
import { fmtTime } from '@/components/staff/format'
import { Button, Card, Notice, useAction } from '@/components/staff/ui'

interface Staff {
  id: string; displayName: string | null; email: string | null; phone: string | null; role: string; isActive: boolean; mustChangePassword: boolean; passwordChangedAt: string | null
}

export default function StaffPage() {
  const [staff, setStaff] = useState<Staff[] | null>(null)
  const [link, setLink] = useState<{ name: string; url: string; expiresAt: string } | null>(null)
  const { busy, error, run } = useAction()
  const load = useCallback(async () => {
    const res = await api<{ staff: Staff[] }>('/api/admin/staff')
    setStaff(res.staff)
  }, [])
  useEffect(() => void load().catch(() => undefined), [load])

  return (
    <div className="mx-auto max-w-5xl space-y-4">
      <h1 className="text-2xl font-bold text-emerald-900">Staff accounts</h1>
      <Notice kind="info">
        A reset creates a one-time link valid for 30 minutes. It is shown once — hand it to the staff member over a trusted channel.
        When they set a new password, all their existing sessions are signed out. Passwords are never shown or e-mailed.
      </Notice>
      {link && (
        <Card title={`Reset link for ${link.name}`}>
          <p className="mb-2 text-sm">Expires {fmtTime(link.expiresAt)}. This link will not be shown again.</p>
          <div className="flex gap-2">
            <input readOnly className="w-full rounded border border-gray-300 px-2 py-1 font-mono text-xs" value={link.url} onFocus={(e) => e.target.select()} />
            <Button variant="secondary" onClick={() => void navigator.clipboard?.writeText(link.url)}>Copy</Button>
            <Button variant="secondary" onClick={() => setLink(null)}>Hide</Button>
          </div>
        </Card>
      )}
      {error && <Notice kind="error">{error}</Notice>}
      <Card>
        {staff === null ? <p className="text-sm text-gray-500">Loading…</p> : (
          <table className="min-w-full text-sm">
            <thead><tr className="border-b text-left text-xs uppercase text-gray-500"><th className="px-2 py-1">Name</th><th className="px-2 py-1">Role</th><th className="px-2 py-1">Login phone</th><th className="px-2 py-1">Password</th><th /></tr></thead>
            <tbody>
              {staff.map((s) => (
                <tr key={s.id} className="border-b last:border-0">
                  <td className="px-2 py-2">{s.displayName ?? '—'}<div className="text-xs text-gray-500">{s.email}</div></td>
                  <td className="px-2 py-2">{s.role}</td>
                  <td className="px-2 py-2 font-mono text-xs">{s.phone}</td>
                  <td className="px-2 py-2 text-xs">
                    {s.mustChangePassword ? <span className="font-semibold text-amber-700">Temporary — must be changed at next login</span> : `Changed ${fmtTime(s.passwordChangedAt)}`}
                  </td>
                  <td className="px-2 py-2">
                    <Button
                      variant="secondary"
                      disabled={busy}
                      onClick={() =>
                        run(async () => {
                          const res = await api<{ resetUrl: string; expiresAt: string }>(`/api/admin/staff/${s.id}/reset-password`, { method: 'POST', body: {} })
                          setLink({ name: s.displayName ?? 'staff user', url: res.resetUrl, expiresAt: res.expiresAt })
                        })
                      }
                    >
                      Create reset link
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>
    </div>
  )
}
