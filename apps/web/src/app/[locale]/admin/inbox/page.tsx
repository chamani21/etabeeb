import { Suspense } from 'react'
import { notFound } from 'next/navigation'
import { isInboxEnabled } from '@/lib/etabib/inbox/core'
import { InboxPage } from '@/components/staff/inbox/InboxPage'

export const dynamic = 'force-dynamic'

// Admin → Messages (shared WhatsApp inbox; feature flag ETABIB_INBOX_ENABLED)
export default function AdminInboxPage() {
  if (!isInboxEnabled()) notFound()
  return (
    <Suspense>
      <InboxPage role="ADMIN" />
    </Suspense>
  )
}
