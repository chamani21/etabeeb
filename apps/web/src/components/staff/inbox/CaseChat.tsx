'use client'

import { useEffect, useState } from 'react'
import { Card } from '@/components/staff/ui'
import { Conversation } from './Conversation'

/**
 * "Patient chat" card on the existing case pages. Renders nothing when the
 * inbox is disabled (the API answers 404) or the actor may not see the chat.
 */
export function CaseChat({ caseId }: { caseId: string }) {
  const [conversationId, setConversationId] = useState<string | null>(null)
  const [open, setOpen] = useState(false)
  useEffect(() => {
    let alive = true
    fetch(`/api/inbox/by-case/${caseId}`, { cache: 'no-store', credentials: 'same-origin' })
      .then((r) => (r.ok ? r.json() : null))
      .then((j: { conversationId: string | null } | null) => alive && setConversationId(j?.conversationId ?? null))
      .catch(() => undefined)
    return () => {
      alive = false
    }
  }, [caseId])
  if (!conversationId) return null
  return (
    <Card
      title="💬 Patient chat (WhatsApp)"
      actions={
        <button type="button" onClick={() => setOpen((o) => !o)} className="min-h-[44px] rounded border border-gray-300 px-3 text-sm">
          {open ? 'Hide' : 'Open chat'}
        </button>
      }
    >
      {open ? <Conversation conversationId={conversationId} compact /> : <p className="text-sm text-gray-600">Messages, files and handover for this patient’s WhatsApp number.</p>}
    </Card>
  )
}
