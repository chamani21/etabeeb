'use client'

import { useState } from 'react'
import { Button } from '@/components/staff/ui'

/**
 * Two-step delete: the first tap only asks, the second tap deletes. Inline (no
 * browser dialog), so a stray tap during a call can never lose a recording.
 */
export function ConfirmDeleteButton({
  onConfirm,
  disabled,
  question = 'Delete this voice note?',
}: {
  onConfirm: () => void
  disabled?: boolean
  question?: string
}) {
  const [asking, setAsking] = useState(false)
  if (!asking) {
    return (
      <Button variant="secondary" onClick={() => setAsking(true)} disabled={disabled} className="min-h-[44px]">
        Delete
      </Button>
    )
  }
  return (
    <span className="inline-flex flex-wrap items-center gap-2" role="group" aria-label={question} data-testid="confirm-delete">
      <span className="text-sm font-medium text-red-700">{question}</span>
      <Button variant="danger" onClick={() => (setAsking(false), onConfirm())} disabled={disabled} className="min-h-[44px]">
        Yes, delete
      </Button>
      <Button variant="secondary" onClick={() => setAsking(false)} className="min-h-[44px]">
        Keep
      </Button>
    </span>
  )
}
