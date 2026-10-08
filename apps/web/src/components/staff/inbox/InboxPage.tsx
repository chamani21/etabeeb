'use client'

import { useCallback, useEffect, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { api } from '@/components/staff/api'
import { fmtTime } from '@/components/staff/format'
import { Notice } from '@/components/staff/ui'
import { Conversation } from './Conversation'
import { usePoll } from './usePoll'

interface Row {
  id: string
  name: string | null
  phone: string | null
  owner: 'BOT' | 'ADMIN' | 'DOCTOR'
  ownerName: string | null
  mine: boolean
  pendingHandover: boolean
  pendingForMe: boolean
  unread: number
  lastMessageAt: string | null
  window: { open: boolean }
  preview: { direction: string; senderRole: string; kind: string; text: string | null } | null
}

const FILTERS: Array<{ id: string; label: string }> = [
  { id: 'mine', label: 'Mine' },
  { id: 'admin_queue', label: 'Admin queue' },
  { id: 'doctor_queue', label: 'Doctor queue' },
  { id: 'pending', label: 'Pending handovers' },
  { id: 'all', label: 'All' },
]
const OWNER_CLS: Record<string, string> = { BOT: 'bg-gray-100 text-gray-700', ADMIN: 'bg-sky-100 text-sky-800', DOCTOR: 'bg-emerald-100 text-emerald-800' }
const OWNER_LABEL: Record<string, string> = { BOT: 'Bot', ADMIN: 'Admin', DOCTOR: 'Doctor' }

/** Shared inbox: list + conversation (desktop side by side; mobile one panel at a time). */
export function InboxPage({ role }: { role: 'ADMIN' | 'DOCTOR' }) {
  const router = useRouter()
  const params = useSearchParams()
  const selected = params?.get('c') ?? null
  const [filter, setFilter] = useState(role === 'DOCTOR' ? 'all' : 'all')
  const [rows, setRows] = useState<Row[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    try {
      const r = await api<{ conversations: Row[] }>(`/api/inbox/conversations?filter=${filter}`)
      setRows(r.conversations)
      setError(null)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load')
      throw e
    }
  }, [filter])
  const refresh = usePoll(load, 10_000)
  useEffect(() => refresh(), [filter, refresh])

  const open = (id: string | null) => {
    const base = window.location.pathname
    router.push(id ? `${base}?c=${id}` : base)
  }

  const list = (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex gap-2 overflow-x-auto border-b border-gray-200 bg-white p-2">
        {FILTERS.map((f) => (
          <button
            key={f.id}
            type="button"
            onClick={() => setFilter(f.id)}
            className={`min-h-[44px] flex-shrink-0 rounded-full px-3 text-sm ${filter === f.id ? 'bg-emerald-700 text-white' : 'border border-gray-300 bg-white text-gray-700'}`}
          >
            {f.label}
          </button>
        ))}
      </div>
      {error && <div className="p-2"><Notice kind="error">{error}</Notice></div>}
      <ul className="min-h-0 flex-1 divide-y divide-gray-100 overflow-y-auto bg-white">
        {rows === null && <li className="p-3 text-sm text-gray-500">Loading…</li>}
        {rows?.length === 0 && <li className="p-3 text-sm text-gray-500">No conversations{role === 'DOCTOR' ? ' for you' : ''} in this view.</li>}
        {rows?.map((r) => (
          <li key={r.id}>
            <button
              type="button"
              onClick={() => open(r.id)}
              className={`flex w-full min-h-[64px] flex-col gap-1 px-3 py-2 text-left hover:bg-gray-50 ${selected === r.id ? 'bg-emerald-50' : ''}`}
            >
              <div className="flex w-full items-center gap-2">
                <span className="min-w-0 flex-1 truncate font-medium" dir="auto">
                  {r.name ?? 'WhatsApp contact'}
                </span>
                {r.unread > 0 && <span className="rounded-full bg-emerald-700 px-2 text-xs font-bold text-white">{r.unread}</span>}
                <span className="text-xs text-gray-500">{r.lastMessageAt ? fmtTime(r.lastMessageAt) : ''}</span>
              </div>
              <div className="flex w-full flex-wrap items-center gap-1 text-xs">
                <span className="text-gray-500" dir="ltr">
                  {r.phone}
                </span>
                <span className={`rounded px-1.5 ${OWNER_CLS[r.owner]}`}>
                  {OWNER_LABEL[r.owner]}
                  {r.ownerName ? `: ${r.ownerName}` : r.owner === 'ADMIN' ? ' (unclaimed)' : ''}
                </span>
                {r.pendingHandover && <span className="rounded bg-amber-100 px-1.5 text-amber-900">{r.pendingForMe ? 'Handover for you' : 'Handover pending'}</span>}
              </div>
              {r.preview && (
                <p className="w-full truncate text-xs text-gray-600" dir="auto">
                  {r.preview.direction === 'IN' ? '' : '↪ '}
                  {r.preview.text ?? `[${r.preview.kind}]`}
                </p>
              )}
            </button>
          </li>
        ))}
      </ul>
    </div>
  )

  return (
    <div className="-m-4 md:-m-6">
      {/* Desktop: list + conversation. Mobile: only one of them, with a back button. */}
      <div className="flex h-[calc(100dvh-3.5rem)]">
        <div className={`${selected ? 'hidden md:block' : 'block'} h-full w-full md:w-80 md:flex-shrink-0 md:border-r md:border-gray-200`}>{list}</div>
        <div className={`${selected ? 'block' : 'hidden md:flex md:items-center md:justify-center'} h-full min-w-0 flex-1`}>
          {selected ? (
            <Conversation key={selected} conversationId={selected} onBack={() => open(null)} />
          ) : (
            <p className="text-sm text-gray-500">Select a conversation.</p>
          )}
        </div>
      </div>
    </div>
  )
}
