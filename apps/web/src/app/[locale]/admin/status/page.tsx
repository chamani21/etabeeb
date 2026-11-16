'use client'

import { useCallback, useEffect, useState } from 'react'
import { api } from '@/components/staff/api'
import { fmtTime } from '@/components/staff/format'
import { Button, Card, Dl, Notice } from '@/components/staff/ui'

export default function StatusPage() {
  const [s, setS] = useState<any>(null)
  const [error, setError] = useState<string | null>(null)
  const load = useCallback(async () => {
    try {
      setS((await api<{ status: any }>('/api/admin/status')).status)
      setError(null)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load')
    }
  }, [])
  useEffect(() => {
    void load()
    const t = setInterval(() => void load(), 60_000)
    return () => clearInterval(t)
  }, [load])

  if (error) return <Notice kind="error">{error}</Notice>
  if (!s) return <p className="text-sm text-gray-500">Loading…</p>
  return (
    <div className="mx-auto max-w-5xl space-y-4">
      <div className="flex items-center gap-3">
        <h1 className="text-2xl font-bold text-emerald-900">System status</h1>
        <Button variant="secondary" onClick={() => void load()}>Refresh</Button>
      </div>
      <Notice kind="info">Read-only. Inbound switches and secrets are server configuration and cannot be changed from the UI.</Notice>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <Card title="WhatsApp inbound">
          <Dl rows={[
            ['Environment', s.environment],
            ['WhatsApp number', s.whatsappNumber],
            ['Inbound processing', s.inbound.enabled ? 'ENABLED' : 'DISABLED (kill switch)'],
            ['Inbound mode', s.inbound.mode],
            ['Active allow-list', Object.entries(s.activeSenders).map(([k, v]) => `${k}: ${v}`).join(', ') || 'none'],
            ['Last 24h inbound', Object.entries(s.inboundLast24h).map(([k, v]) => `${k}: ${v}`).join(', ') || 'none'],
          ]} />
        </Card>
        <Card title="Outbound / scheduler">
          <Dl rows={[
            ['Scheduler', s.scheduler.lastDispatchAt ? `${s.scheduler.healthy ? 'healthy' : 'STALE'} — last run ${fmtTime(s.scheduler.lastDispatchAt)} (${s.scheduler.minutesSinceLastDispatch} min ago)` : 'no run recorded yet'],
            ['Pending messages', s.outbox.pending],
            ['In flight', s.outbox.processing],
            ['Failed messages', <span key="f" className={s.outbox.failed ? 'font-semibold text-red-700' : ''}>{s.outbox.failed}</span>],
            ['Sent', s.outbox.sent],
            ['Open consultations', s.openCases],
            ['Approved templates', s.templatesApproved.length ? s.templatesApproved.map((t: any) => `${t.intent} → ${t.name} (${t.language})`).join('; ') : 'none (text messages only — 24-hour window applies)'],
          ]} />
        </Card>
      </div>
      <Card title="Recent integration errors (sanitized)">
        {s.recentIntegrationErrors.length === 0 ? <p className="text-sm text-gray-500">None.</p> : (
          <ul className="space-y-1 text-sm">
            {s.recentIntegrationErrors.map((e: any, i: number) => (
              <li key={i} className="border-b border-gray-100 py-1 last:border-0">
                <span className="font-mono text-xs text-gray-500">{fmtTime(e.occurredAt)}</span> · <b>{e.workflowName}</b> @ {e.node ?? '—'} — {e.errorMessage}
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  )
}
