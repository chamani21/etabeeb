'use client'

import Link from 'next/link'
import { useCallback, useEffect, useState } from 'react'
import { api } from '@/components/staff/api'
import { fmtTime, shortId } from '@/components/staff/format'
import { Button, Card, Notice, StatusBadge, inputCls } from '@/components/staff/ui'

const STATUSES = [
  'NEW', 'ADMIN_INTAKE', 'INTAKE_COMPLETE', 'AWAITING_PAYMENT', 'PAYMENT_RECEIVED',
  'AWAITING_DOCTOR_APPROVAL', 'CONFIRMED', 'IN_CONSULTATION', 'PRESCRIPTION_SENT', 'COMPLETED', 'CANCELLED',
] as const

interface Row {
  id: string
  status: string
  patientName: string | null
  patientPhone: string | null
  whatsappPhone: string | null
  createdAt: string
  updatedAt: string
  paymentReceived: boolean
  doctorDecision: string | null
  proposedConsultationTime: string | null
  doctorApprovedTime: string | null
  warning: string | null
  rxCode: string | null
}

export default function AdminCasesPage() {
  const [status, setStatus] = useState<string>('OPEN')
  const [q, setQ] = useState('')
  const [query, setQuery] = useState('')
  const [rows, setRows] = useState<Row[] | null>(null)
  const [counts, setCounts] = useState<Record<string, number>>({})
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setError(null)
    try {
      const params = new URLSearchParams({ status, ...(query ? { q: query } : {}) })
      const res = await api<{ cases: Row[]; counts: Record<string, number> }>(`/api/admin/cases?${params}`)
      setRows(res.cases)
      setCounts(res.counts)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load')
    }
  }, [status, query])

  useEffect(() => {
    void load()
    const t = setInterval(() => void load(), 30_000)
    return () => clearInterval(t)
  }, [load])

  const total = Object.values(counts).reduce((a, b) => a + b, 0)
  const open = total - (counts.COMPLETED ?? 0) - (counts.CANCELLED ?? 0)
  const chip = (value: string, label: string, n?: number) => (
    <button
      key={value}
      onClick={() => setStatus(value)}
      className={`rounded-full border px-3 py-1 text-xs ${status === value ? 'border-emerald-700 bg-emerald-700 text-white' : 'border-gray-300 bg-white text-gray-700 hover:bg-gray-50'}`}
    >
      {label}
      {n !== undefined ? ` (${n})` : ''}
    </button>
  )

  return (
    <div className="mx-auto max-w-7xl space-y-4">
      <h1 className="text-2xl font-bold text-emerald-900">Consultation queue</h1>
      <Card>
        <div className="flex flex-wrap gap-2">
          {chip('OPEN', 'Open', open)}
          {chip('ALL', 'All', total)}
          {STATUSES.map((s) => chip(s, s.replace(/_/g, ' ').toLowerCase(), counts[s] ?? 0))}
        </div>
        <form
          className="mt-3 flex gap-2"
          onSubmit={(e) => {
            e.preventDefault()
            setQuery(q.trim())
          }}
        >
          <input className={inputCls} placeholder="Search by prescription ID (e.g. K7Q4M), case ID, phone or patient name" value={q} onChange={(e) => setQ(e.target.value)} />
          <Button type="submit">Search</Button>
          {query && (
            <Button type="button" variant="secondary" onClick={() => { setQ(''); setQuery('') }}>
              Clear
            </Button>
          )}
        </form>
      </Card>
      {error && <Notice kind="error">{error}</Notice>}
      <Card>
        {rows === null ? (
          <p className="text-sm text-gray-500">Loading…</p>
        ) : rows.length === 0 ? (
          <p className="text-sm text-gray-500">No consultations match this filter.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="border-b text-left text-xs uppercase text-gray-500">
                  <th className="px-2 py-2">Case</th>
                  <th className="px-2 py-2">Rx ID</th>
                  <th className="px-2 py-2">Patient</th>
                  <th className="px-2 py-2">Phone</th>
                  <th className="px-2 py-2">Status</th>
                  <th className="px-2 py-2">Payment</th>
                  <th className="px-2 py-2">Doctor</th>
                  <th className="px-2 py-2">Consultation time</th>
                  <th className="px-2 py-2">Created</th>
                  <th className="px-2 py-2">Updated</th>
                  <th className="px-2 py-2">Warning</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id} className="border-b last:border-0 hover:bg-gray-50">
                    <td className="px-2 py-2 font-mono">
                      <Link href={`/admin/cases/${r.id}`} className="text-emerald-800 underline">{shortId(r.id)}</Link>
                    </td>
                    <td className="px-2 py-2 font-mono font-semibold tracking-wider">{r.rxCode ?? '—'}</td>
                    <td className="px-2 py-2">{r.patientName ?? <span className="text-gray-400">(not yet given)</span>}</td>
                    <td className="px-2 py-2 font-mono text-xs">{r.patientPhone ?? r.whatsappPhone ?? '—'}</td>
                    <td className="px-2 py-2"><StatusBadge status={r.status} /></td>
                    <td className="px-2 py-2">{r.paymentReceived ? 'Received' : 'Not received'}</td>
                    <td className="px-2 py-2">{r.doctorDecision ? r.doctorDecision.replace(/_/g, ' ').toLowerCase() : '—'}</td>
                    <td className="px-2 py-2 text-xs">
                      {r.doctorApprovedTime ? <>approved {fmtTime(r.doctorApprovedTime)}</> : r.proposedConsultationTime ? <>proposed {fmtTime(r.proposedConsultationTime)}</> : '—'}
                    </td>
                    <td className="px-2 py-2 text-xs">{fmtTime(r.createdAt)}</td>
                    <td className="px-2 py-2 text-xs">{fmtTime(r.updatedAt)}</td>
                    <td className="px-2 py-2 text-xs text-red-700">{r.warning ?? ''}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  )
}
