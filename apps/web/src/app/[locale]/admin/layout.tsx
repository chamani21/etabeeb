import { redirect } from 'next/navigation'
import { getCurrentUser } from '@/lib/auth-helpers'
import { StaffShell } from '@/components/staff/StaffShell'
import { isInboxEnabled } from '@/lib/etabib/inbox/core'

// Server-side gate for every admin page; the APIs enforce the same rules independently.
export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser()
  if (!user?.id) redirect('/login')
  if (user.role !== 'administrator') redirect(user.role === 'practitioner' ? '/doctor/cases' : '/login')
  if (user.mustChangePassword) redirect('/account/password')
  return (
    <StaffShell
      title="Admin — consultation operations"
      user={user.displayName || 'Admin'}
      nav={[
        { href: '/admin/cases', label: 'Consultations' },
        ...(isInboxEnabled() ? [{ href: '/admin/inbox', label: 'Messages', badge: 'inbox' as const }] : []),
        { href: '/admin/senders', label: 'WhatsApp allow-list' },
        { href: '/admin/staff', label: 'Staff accounts' },
        { href: '/admin/status', label: 'System status' },
        { href: '/account/password', label: 'Change password' },
      ]}
    >
      {children}
    </StaffShell>
  )
}
