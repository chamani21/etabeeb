'use client'

import { useState } from 'react'
import { usePoll } from './usePoll'

/** Small count next to "Messages": unread in my conversations + handovers waiting for me (+ admin queue). */
export function InboxBadge() {
  const [n, setN] = useState(0)
  usePoll(async () => {
    const res = await fetch('/api/inbox/summary', { cache: 'no-store', credentials: 'same-origin' })
    if (!res.ok) throw new Error(String(res.status))
    const s = (await res.json()) as { unreadMine: number; pendingForMe: number; adminQueue: number }
    setN(s.unreadMine + s.pendingForMe + s.adminQueue)
  }, 20_000)
  if (n <= 0) return null
  return (
    <span className="ml-2 inline-flex min-w-[1.25rem] items-center justify-center rounded-full bg-[#D4AF37] px-1.5 text-xs font-bold text-[#0B3D2E]" aria-label={`${n} waiting`}>
      {n > 99 ? '99+' : n}
    </span>
  )
}
