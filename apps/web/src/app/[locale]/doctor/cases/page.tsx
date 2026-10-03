'use client'

import Link from 'next/link'
import { useCallback, useEffect, useState } from 'react'
import { api } from '@/components/staff/api'
import { fmtTime, shortId } from '@/components/staff/format'
import { Button, Card, Notice, StatusBadge } from '@/components/staff/ui'

type C = {
  id: string; status: string; patientName: string | null; age: number | null; sex: string | null; location: string | null
  mainComplaint: string | null; proposedConsultationTime: string | null; doctorApprovedTime: string | null; doctorDecision: string | null; updatedAt: string
}
type Lists = { pendingApproval: C[]; confirmed: C[]; inConsultation: C[]; recentlyCompleted: C[] }

export default function DoctorCasesPage() {
  const [data, setData] = useState<Lists | null>(null)
  const [error, setError] = useState<string | null>(null)
  const load = useCallback(async () => {
    try {
      setData(await api<Lists>('/api/doctor/cases'))
      setError(null)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load')
    }
  }, [])
  useEffect(() => {
    void load()
    const t = setInterval(() => void load(), 30_000)
    return () => clearInterval(t)
  }, [load])

  const section = (title: string, rows: C[], empty: string, timeOf: (c: C) => string) => (
    <Card title={`${title} (${rows.length})`}>
      {rows.length === 0 ? <p className="text-sm text-gray-500">{empty}</p> : (
        <ul className="divide-y divide-gray-100">
          {rows.map((c) => (
            <li key={c.id} className="flex flex-wrap items-center gap-3 py-2 text-sm">
              <Link href={`/doctor/cases/${c.id}`} className="font-mono text-emerald-800 underline">{shortId(c.id)}</Link>
              <span className="font-medium">{c.patientName ?? '—'}</span>
              <span className="text-gray-600">{[c.age, c.sex?.toLowerCase(), c.location].filter(Boolean).join(' · ')}</span>
              <span className="min-w-0 flex-1 truncate text-gray-600">{c.mainComplaint}</span>
              <span className="text-xs text-gray-700">{timeOf(c)}</span>
              <StatusBadge status={c.status} />
            </li>
          ))}
        </ul>
      )}
    </Card>
  )

  return (
    <div className="mx-auto max-w-5xl space-y-4">
      <div className="flex items-center gap-3">
        <h1 className="text-2xl font-bold text-emerald-900">My consultations</h1>
        <Button variant="secondary" onClick={() => void load()}>Refresh</Button>
      </div>
      {error && <Notice kind="error">{error}</Notice>}
      {!data ? <p className="text-sm text-gray-500">Loading…</p> : (
        <>
          {section('Approval requests', data.pendingApproval, 'No pending approval requests.', (c) => `proposed ${fmtTime(c.proposedConsultationTime)}${c.doctorDecision && c.doctorDecision !== 'PENDING' ? ` · you: ${c.doctorDecision.replace(/_/g, ' ').toLowerCase()}` : ''}`)}
          {section('Confirmed', data.confirmed, 'No confirmed consultations.', (c) => fmtTime(c.doctorApprovedTime))}
          {section('In consultation', data.inConsultation, 'None in progress.', (c) => fmtTime(c.doctorApprovedTime))}
          {section('Recently completed (30 days)', data.recentlyCompleted, 'None yet.', (c) => fmtTime(c.updatedAt))}
        </>
      )}
    </div>
  )
}
