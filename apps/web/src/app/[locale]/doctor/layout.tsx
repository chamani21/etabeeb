import { redirect } from 'next/navigation'
import { getCurrentUser } from '@/lib/auth-helpers'
import { getV1DoctorUserId } from '@/lib/etabib/config'
import { StaffShell } from '@/components/staff/StaffShell'
import { isInboxEnabled } from '@/lib/etabib/inbox/core'

// Server-side gate: only the configured V1 doctor (Dr. Jalaluddin). APIs enforce the same rule.
export default async function DoctorLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser()
  if (!user?.id) redirect('/login')
  if (user.role === 'administrator') redirect('/admin/cases')
  if (user.role !== 'practitioner' || user.id !== getV1DoctorUserId()) redirect('/login')
  if (user.mustChangePassword) redirect('/account/password')
  return (
    <StaffShell
      title="Doctor — consultations"
      user={user.displayName || 'Doctor'}
      nav={[
        { href: '/doctor/cases', label: 'Consultations' },
        ...(isInboxEnabled() ? [{ href: '/doctor/inbox', label: 'Messages', badge: 'inbox' as const }] : []),
        { href: '/account/password', label: 'Change password' },
      ]}
    >
      {children}
    </StaffShell>
  )
}
