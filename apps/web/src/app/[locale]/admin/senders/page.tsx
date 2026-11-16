'use client'

import { useCallback, useEffect, useState } from 'react'
import { api } from '@/components/staff/api'
import { fmtTime } from '@/components/staff/format'
import { Button, Card, Field, Notice, inputCls, useAction } from '@/components/staff/ui'

const PURPOSES = ['PATIENT_TEST', 'PILOT_PATIENT', 'STAFF', 'BLOCKED'] as const
const PURPOSE_HELP: Record<string, string> = {
  PATIENT_TEST: 'Synthetic/test patient — may use the patient flow in allowlist mode',
  PILOT_PATIENT: 'Approved pilot patient — may use the patient flow in allowlist mode',
  STAFF: 'Staff phone — never enters the patient flow',
  BLOCKED: 'Ignored in every mode',
}

interface Sender {
  id: string; phoneE164: string; label: string; purpose: string; active: boolean; notes: string | null; createdAt: string; updatedAt: string
}

export default function SendersPage() {
  const [senders, setSenders] = useState<Sender[] | null>(null)
  const [policy, setPolicy] = useState<{ enabled: boolean; mode: string } | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const load = useCallback(async () => {
    try {
      const res = await api<{ senders: Sender[]; policy: { enabled: boolean; mode: string } }>('/api/admin/senders')
      setSenders(res.senders)
      setPolicy(res.policy)
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : 'Failed to load')
    }
  }, [])
  useEffect(() => void load(), [load])

  return (
    <div className="mx-auto max-w-6xl space-y-4">
      <h1 className="text-2xl font-bold text-emerald-900">WhatsApp sender allow-list</h1>
      {policy && (
        <Notice kind={policy.enabled && policy.mode === 'public' ? 'warning' : 'info'}>
          Inbound processing: <b>{policy.enabled ? 'ENABLED' : 'DISABLED (kill switch)'}</b> · mode: <b>{policy.mode}</b>. Set on the server (ETABIB_WHATSAPP_INBOUND_ENABLED / ETABIB_INBOUND_MODE); read-only here.
        </Notice>
      )}
      {loadError && <Notice kind="error">{loadError}</Notice>}
      <AddSender onDone={load} />
      <Card title="Numbers">
        {senders === null ? <p className="text-sm text-gray-500">Loading…</p> : senders.length === 0 ? <p className="text-sm text-gray-500">No numbers yet.</p> : (
          <div className="space-y-2">{senders.map((s) => <SenderRow key={s.id} s={s} onDone={load} />)}</div>
        )}
      </Card>
    </div>
  )
}

function AddSender({ onDone }: { onDone: () => Promise<void> }) {
  const [f, setF] = useState({ phone: '', label: '', purpose: 'PATIENT_TEST', notes: '' })
  const { busy, error, message, run } = useAction()
  return (
    <Card title="Add number">
      <div className="grid grid-cols-1 gap-3 md:grid-cols-4">
        <Field label="Phone" hint="03…, +92…, +1… — stored as E.164"><input className={inputCls} value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} /></Field>
        <Field label="Label"><input className={inputCls} value={f.label} onChange={(e) => setF({ ...f, label: e.target.value })} /></Field>
        <Field label="Purpose" hint={PURPOSE_HELP[f.purpose]}>
          <select className={inputCls} value={f.purpose} onChange={(e) => setF({ ...f, purpose: e.target.value })}>
            {PURPOSES.map((p) => <option key={p} value={p}>{p}</option>)}
          </select>
        </Field>
        <Field label="Notes (optional)"><input className={inputCls} value={f.notes} onChange={(e) => setF({ ...f, notes: e.target.value })} /></Field>
      </div>
      <div className="mt-3 flex items-center gap-3">
        <Button
          disabled={busy || !f.phone || !f.label}
          onClick={() =>
            run(async () => {
              const res = await api('/api/admin/senders', { body: { phone: f.phone, label: f.label, purpose: f.purpose, notes: f.notes.trim() || null } })
              setF({ phone: '', label: '', purpose: 'PATIENT_TEST', notes: '' })
              await onDone()
              return `Added ${res.sender.phoneE164}.`
            })
          }
        >
          Add
        </Button>
        {error && <Notice kind="error">{error}</Notice>}
        {message && <Notice kind="success">{message}</Notice>}
      </div>
    </Card>
  )
}

function SenderRow({ s, onDone }: { s: Sender; onDone: () => Promise<void> }) {
  const [edit, setEdit] = useState(false)
  const [f, setF] = useState({ label: s.label, purpose: s.purpose, notes: s.notes ?? '' })
  const { busy, error, run } = useAction()
  const patch = (body: Record<string, unknown>) =>
    run(async () => {
      await api(`/api/admin/senders/${s.id}`, { method: 'PATCH', body })
      setEdit(false)
      await onDone()
    })
  return (
    <div className={`rounded border p-3 text-sm ${s.active ? 'border-gray-200' : 'border-gray-200 bg-gray-50 opacity-70'}`}>
      <div className="flex flex-wrap items-center gap-3">
        <span className="font-mono">{s.phoneE164}</span>
        <span className="rounded bg-gray-100 px-2 py-0.5 text-xs font-semibold">{s.purpose}</span>
        <span className={s.active ? 'text-emerald-700' : 'text-gray-500'}>{s.active ? 'active' : 'inactive'}</span>
        <span className="font-medium">{s.label}</span>
        {s.notes && <span className="text-gray-500">— {s.notes}</span>}
        <span className="ml-auto text-xs text-gray-500">created {fmtTime(s.createdAt)} · updated {fmtTime(s.updatedAt)}</span>
      </div>
      {edit ? (
        <div className="mt-2 grid grid-cols-1 gap-2 md:grid-cols-4">
          <input className={inputCls} value={f.label} onChange={(e) => setF({ ...f, label: e.target.value })} />
          <select className={inputCls} value={f.purpose} onChange={(e) => setF({ ...f, purpose: e.target.value })}>
            {PURPOSES.map((p) => <option key={p} value={p}>{p}</option>)}
          </select>
          <input className={inputCls} value={f.notes} placeholder="Notes" onChange={(e) => setF({ ...f, notes: e.target.value })} />
          <div className="flex gap-2">
            <Button disabled={busy} onClick={() => patch({ label: f.label, purpose: f.purpose, notes: f.notes.trim() || null })}>Save</Button>
            <Button variant="secondary" onClick={() => setEdit(false)}>Cancel</Button>
          </div>
        </div>
      ) : (
        <div className="mt-2 flex gap-2">
          <Button variant="secondary" onClick={() => setEdit(true)}>Edit</Button>
          {s.active ? (
            <Button variant="danger" disabled={busy} onClick={() => patch({ active: false })}>Deactivate</Button>
          ) : (
            <Button variant="secondary" disabled={busy} onClick={() => patch({ active: true })}>Reactivate</Button>
          )}
        </div>
      )}
      {error && <div className="mt-2"><Notice kind="error">{error}</Notice></div>}
    </div>
  )
}
