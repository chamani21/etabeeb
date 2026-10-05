'use client'

import { useCallback, useEffect, useState } from 'react'
import { api } from '@/components/staff/api'
import { fmtTime } from '@/components/staff/format'
import { Button, Card, Dl, Notice, useAction } from '@/components/staff/ui'

interface AdminRxState {
  current: null | { id: string; rxNumber: string | null; revision: number; status: string; finalizedAt: string | null; renderedAt: string | null; renderError: string | null; pages: number; hasPdf: boolean; deliveryRequestedAt: string | null }
  revisions: Array<{ id: string; rxNumber: string | null; revision: number; status: string; finalizedAt: string | null; pages: number; hasPdf: boolean }>
  voiceNotes: Array<{ id: string; durationMs: number; includeInDelivery: boolean }>
  deliveries: Array<{ jobId: string; kind: 'image' | 'voice' | 'text'; page: number | null; status: string; lastError: string | null; sentAt: string | null; deliveredAt: string | null; readAt: string | null; canRetry: boolean }>
  whatsappWindowOpen: boolean
}

const statusText = (d: AdminRxState['deliveries'][number]) =>
  d.status === 'read' ? `read ${fmtTime(d.readAt)}`
    : d.status === 'delivered' ? `delivered ${fmtTime(d.deliveredAt)}`
      : d.status === 'sent' ? `sent ${fmtTime(d.sentAt)}`
        : d.status === 'failed' ? `failed — ${d.lastError ?? 'unknown'}`
          : d.lastError?.startsWith('waiting_for_patient_reply') ? 'waiting — 24-hour window closed (sends when the patient writes)'
            : d.status

/** Admin: view / download / resend / retry. Finalized clinical content is never editable here. */
export function AdminPrescription({ caseId }: { caseId: string }) {
  const [st, setSt] = useState<AdminRxState | null>(null)
  const [viewer, setViewer] = useState<{ rx: string; pages: number } | null>(null)
  const act = useAction()
  const load = useCallback(async () => {
    try {
      setSt(await api<AdminRxState>(`/api/admin/cases/${caseId}/prescription`))
    } catch {
      /* keep last */
    }
  }, [caseId])
  useEffect(() => {
    void load()
    const t = setInterval(() => void load(), 20_000)
    return () => clearInterval(t)
  }, [load])
  if (!st || (!st.current && st.revisions.length === 0)) return null
  const cur = st.current
  const file = (rx: string, kind: 'pdf' | 'image', page = 1, download = false) => `/api/admin/cases/${caseId}/prescription/file?rx=${rx}&kind=${kind}&page=${page}${download ? '&download=1' : ''}`
  const images = st.deliveries.filter((d) => d.kind === 'image')
  const voices = st.deliveries.filter((d) => d.kind === 'voice')
  return (
    <Card title="Prescription (read-only)">
      {cur && (
        <Dl rows={[
          ['Status', cur.status === 'DRAFT' ? 'Draft (doctor is writing)' : `🔒 Finalized${cur.revision > 1 ? ` — revision ${cur.revision}` : ''}`],
          ['Prescription ID', cur.rxNumber],
          ['Finalized', fmtTime(cur.finalizedAt)],
          ['Image / PDF', cur.renderedAt ? `${cur.pages} image page(s) + PDF` : cur.renderError ? `render failed (${cur.renderError})` : cur.status === 'DRAFT' ? '—' : 'pending'],
          ['Sent to WhatsApp', cur.deliveryRequestedAt ? fmtTime(cur.deliveryRequestedAt) : 'not yet'],
          ['Prescription image', images.length ? images.map((d) => statusText(d)).join(' · ') : '—'],
          ['Voice explanation', st.voiceNotes.length ? `${st.voiceNotes.length} recorded${voices.length ? ` · ${voices.map((d) => statusText(d)).join(' · ')}` : ' · not sent'}` : 'none'],
          ['Patient WhatsApp window', st.whatsappWindowOpen ? 'open (patient wrote in the last 24 h)' : 'closed'],
        ]} />
      )}
      {cur && cur.status !== 'DRAFT' && (
        <div className="mt-3 flex flex-wrap gap-2">
          <Button variant="secondary" disabled={!cur.renderedAt} onClick={() => setViewer({ rx: cur.id, pages: cur.pages })}>View image</Button>
          <a className={`inline-flex items-center rounded border border-gray-300 bg-white px-3 py-1.5 text-sm font-medium ${cur.hasPdf ? '' : 'pointer-events-none opacity-50'}`} href={file(cur.id, 'pdf', 1, true)}>Download PDF</a>
          <Button variant="secondary" disabled={act.busy || !cur.deliveryRequestedAt} onClick={() => void act.run(async () => { const r = await api<{ changed: boolean }>(`/api/admin/cases/${caseId}/prescription/resend`, { method: 'POST', body: {} }); await load(); return r.changed ? 'Prescription image resent.' : 'Resent less than a minute ago — not sent again.' })}>Resend</Button>
          {st.deliveries.filter((d) => d.canRetry).map((d) => (
            <Button key={d.jobId} variant="secondary" disabled={act.busy} onClick={() => void act.run(async () => { await api(`/api/admin/cases/${caseId}/outbox/${d.jobId}/retry`, { method: 'POST', body: {} }); await load(); return 'Retry requested.' })}>Retry failed {d.kind}</Button>
          ))}
        </div>
      )}
      {st.revisions.length > 1 && (
        <div className="mt-3 text-sm">
          <div className="font-medium text-gray-700">Revisions (all preserved)</div>
          <ul className="mt-1 space-y-1">
            {st.revisions.map((r) => (
              <li key={r.id} className="flex flex-wrap gap-2">
                <span className="font-mono">{r.rxNumber} rev {r.revision}</span><span className="text-gray-600">{r.status.toLowerCase()} {fmtTime(r.finalizedAt)}</span>
                {r.hasPdf && <a className="text-emerald-800 underline" href={file(r.id, 'pdf', 1, true)}>PDF</a>}
              </li>
            ))}
          </ul>
        </div>
      )}
      {(act.error || act.message) && <div className="mt-2">{act.error ? <Notice kind="error">{act.error}</Notice> : <Notice kind="success">{act.message}</Notice>}</div>}
      {viewer && (
        <div className="fixed inset-0 z-50 flex flex-col bg-black/70" role="dialog" aria-modal="true" aria-label="Prescription">
          <div className="flex-1 overflow-y-auto p-2 sm:p-6"><div className="mx-auto max-w-3xl space-y-3">
            {Array.from({ length: viewer.pages }, (_, i) => <img key={i} src={file(viewer.rx, 'image', i + 1)} alt={`Prescription page ${i + 1}`} className="w-full rounded bg-white" />)}
          </div></div>
          <div className="flex justify-end border-t bg-white p-3"><Button variant="secondary" onClick={() => setViewer(null)}>Close</Button></div>
        </div>
      )}
    </Card>
  )
}
