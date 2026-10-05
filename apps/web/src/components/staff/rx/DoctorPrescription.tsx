'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { api } from '@/components/staff/api'
import { fmtTime } from '@/components/staff/format'
import { Button, Card, Field, Notice, inputCls, useAction } from '@/components/staff/ui'
import { VoiceRecorder } from './VoiceRecorder'

type Med = { name: string; strength: string; formulation: string; route: string; dose: string; frequency: string; timing: string; duration: string; instructions: string }
const emptyMed: Med = { name: '', strength: '', formulation: '', route: '', dose: '', frequency: '', timing: '', duration: '', instructions: '' }
type Vitals = { weight: string; bp: string; pulse: string; temperature: string; respiratoryRate: string }
const emptyVitals: Vitals = { weight: '', bp: '', pulse: '', temperature: '', respiratoryRate: '' }
type Form = { diagnosis: string; vitals: Vitals; medicines: Med[]; freeText: string; investigations: string; advice: string; followUp: string; followUpInterval: string; redFlags: string }

interface RxState {
  caseStatus: string
  patient: { name: string | null; age: number | null; sex: string | null; location: string | null; complaint: string | null }
  current: null | {
    id: string; rxNumber: string | null; revision: number; status: 'DRAFT' | 'FINALIZED'; finalizedAt: string | null; renderedAt: string | null; renderError: string | null
    pages: number; hasPdf: boolean; deliveryRequestedAt: string | null; amendedFromId: string | null
    content: { diagnosis: string | null; vitals: Record<string, string>; freeText: string | null; investigations: string | null; advice: string | null; followUp: string | null; followUpInterval: string | null; redFlags: string | null; medicines: Array<Record<string, string | null>> }
  }
  revisions: Array<{ id: string; rxNumber: string | null; revision: number; status: string; finalizedAt: string | null; pages: number; hasPdf: boolean }>
  voiceNotes: Array<{ id: string; durationMs: number; includeInDelivery: boolean; createdAt: string }>
  deliveries: Array<{ jobId: string; kind: 'image' | 'voice' | 'text'; page: number | null; voiceNoteId: string | null; status: string; lastError: string | null; sentAt: string | null; deliveredAt: string | null; readAt: string | null; canRetry: boolean; createdAt: string }>
  whatsappWindowOpen: boolean
  previous: Array<{ id: string; rxNumber: string | null; revision: number; finalizedAt: string | null; caseId: string }>
}

const INVESTIGATIONS = ['CBC', 'HbA1c', 'LFTs', 'RFTs', 'Urine R/E', 'X-ray chest', 'Ultrasound abdomen', 'ECG']
const FOLLOW_UPS = ['3 days', '7 days', '2 weeks', '1 month']

function toForm(c: NonNullable<RxState['current']>['content'] | null): Form {
  const s = (v: string | null | undefined) => v ?? ''
  return {
    diagnosis: s(c?.diagnosis),
    vitals: { ...emptyVitals, ...(c?.vitals ?? {}) },
    medicines: c?.medicines.length ? c.medicines.map((m) => ({ ...emptyMed, ...Object.fromEntries(Object.entries(m).map(([k, v]) => [k, v ?? ''])) }) as Med) : [{ ...emptyMed }],
    freeText: s(c?.freeText),
    investigations: s(c?.investigations),
    advice: s(c?.advice),
    followUp: s(c?.followUp),
    followUpInterval: s(c?.followUpInterval),
    redFlags: s(c?.redFlags),
  }
}

function deliveryLabel(d: RxState['deliveries'][number]): { text: string; tone: 'ok' | 'warn' | 'bad' | 'wait' } {
  if (d.status === 'read') return { text: `read ${fmtTime(d.readAt)}`, tone: 'ok' }
  if (d.status === 'delivered') return { text: `delivered ${fmtTime(d.deliveredAt)}`, tone: 'ok' }
  if (d.status === 'sent') return { text: `sent ${fmtTime(d.sentAt)}`, tone: 'ok' }
  if (d.status === 'failed') return { text: `failed${d.lastError ? ` — ${d.lastError}` : ''}`, tone: 'bad' }
  if (d.status === 'cancelled') return { text: 'withdrawn', tone: 'warn' }
  if (d.lastError?.startsWith('waiting_for_patient_reply')) return { text: 'waiting — WhatsApp window closed; sends automatically when the patient writes to eTabeeb', tone: 'wait' }
  if (d.lastError?.startsWith('waiting_for_previous_message')) return { text: 'waiting for the prescription image to go first', tone: 'wait' }
  return { text: d.status === 'processing' ? 'sending…' : 'queued', tone: 'wait' }
}

export function DoctorPrescription({ caseId, onCaseChange }: { caseId: string; onCaseChange: () => Promise<void> }) {
  const [st, setSt] = useState<RxState | null>(null)
  const [form, setForm] = useState<Form>(toForm(null))
  const [dirty, setDirty] = useState(false)
  const [savedAt, setSavedAt] = useState<Date | null>(null)
  const [preview, setPreview] = useState<string[] | null>(null)
  const [viewer, setViewer] = useState<{ rx: string; caseId: string; pages: number } | null>(null)
  const [showRedFlags, setShowRedFlags] = useState(false)
  const [loadError, setLoadError] = useState<string | null>(null)
  const act = useAction()
  const dirtyRef = useRef(false)
  dirtyRef.current = dirty

  const load = useCallback(async (resetForm = true) => {
    try {
      const s = await api<RxState>(`/api/doctor/cases/${caseId}/prescription`)
      setSt(s)
      setLoadError(null)
      if (resetForm || !dirtyRef.current) {
        setForm(toForm(s.current?.content ?? null))
        setShowRedFlags(Boolean(s.current?.content.redFlags))
        setDirty(false)
      }
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : 'Failed to load the prescription')
    }
  }, [caseId])
  useEffect(() => void load(), [load])
  // Delivery status refresh (does not touch the form while editing)
  useEffect(() => {
    const t = setInterval(() => void load(false), 15_000)
    return () => clearInterval(t)
  }, [load])

  const isDraft = !st?.current || st.current.status === 'DRAFT'
  const writable = st ? ['CONFIRMED', 'IN_CONSULTATION'].includes(st.caseStatus) : false
  const editing = isDraft && writable

  const body = () => ({
    diagnosis: form.diagnosis,
    vitals: form.vitals,
    medicines: form.medicines.filter((m) => m.name.trim()).map((m) => ({ ...m })),
    freeText: form.freeText,
    investigations: form.investigations,
    advice: form.advice,
    followUp: form.followUp,
    followUpInterval: form.followUpInterval,
    redFlags: showRedFlags ? form.redFlags : '',
  })
  const save = useCallback(async () => {
    await api(`/api/doctor/cases/${caseId}/prescription`, { body: body() })
    setDirty(false)
    setSavedAt(new Date())
  }, [caseId, form, showRedFlags]) // eslint-disable-line react-hooks/exhaustive-deps

  // Autosave the draft (server-side), so a refresh or dropped connection loses nothing
  useEffect(() => {
    if (!dirty || !editing) return
    const t = setTimeout(() => void save().catch(() => undefined), 4000)
    return () => clearTimeout(t)
  }, [dirty, editing, save])

  const set = (patch: Partial<Form>) => (setForm({ ...form, ...patch }), setDirty(true))
  const setMed = (i: number, k: keyof Med, v: string) => set({ medicines: form.medicines.map((m, n) => (n === i ? { ...m, [k]: v } : m)) })
  const moveMed = (i: number, d: -1 | 1) => {
    const j = i + d
    if (j < 0 || j >= form.medicines.length) return
    const m = [...form.medicines]
    ;[m[i], m[j]] = [m[j]!, m[i]!]
    set({ medicines: m })
  }
  const hasContent = form.medicines.some((m) => m.name.trim()) || form.freeText.trim()

  const doPreview = () =>
    act.run(async () => {
      if (editing) await save()
      const r = await api<{ pages: string[] }>(`/api/doctor/cases/${caseId}/prescription/preview`, { method: 'POST', body: {} })
      setPreview(r.pages)
    })
  const finalize = () =>
    act.run(async () => {
      await api(`/api/doctor/cases/${caseId}/prescription/finalize`, { method: 'POST', body: {} })
      setPreview(null)
      await load()
      return 'Prescription finalized and locked.'
    })
  const send = (complete: boolean) =>
    act.run(async () => {
      const r = await api<{ caseStatus: string; queued: number }>(`/api/doctor/cases/${caseId}/prescription/send`, { method: 'POST', body: { complete } })
      await load()
      if (complete) await onCaseChange()
      return complete ? 'Prescription sent and consultation completed.' : r.queued > 0 ? 'Prescription sent to the patient. The call stays open.' : 'Already sent — no duplicate message.'
    })
  const sendVoice = () =>
    act.run(async () => {
      const r = await api<{ queued: number }>(`/api/doctor/cases/${caseId}/prescription/send-voice`, { method: 'POST', body: {} })
      await load()
      return r.queued > 0 ? 'Voice explanation sent.' : 'Already sent.'
    })
  const complete = () =>
    act.run(async () => {
      await api(`/api/doctor/cases/${caseId}/complete`, { method: 'POST', body: {} })
      await load()
      await onCaseChange()
      return 'Consultation completed.'
    })
  const amend = () =>
    act.run(async () => {
      await api(`/api/doctor/cases/${caseId}/prescription/amend`, { method: 'POST', body: {} })
      await load()
      return 'Amendment created — edit and finalize the new revision.'
    })
  const copyFrom = (rxId: string) =>
    act.run(async () => {
      if (dirty) await save()
      await api(`/api/doctor/cases/${caseId}/prescription/copy`, { body: { fromPrescriptionId: rxId } })
      await load()
      return 'Medicines copied into the draft.'
    })
  const retry = (jobId: string) =>
    act.run(async () => {
      await api(`/api/doctor/cases/${caseId}/prescription/retry`, { body: { jobId } })
      await load()
      return 'Retry requested.'
    })
  const uploadVoice = async (blob: Blob) => {
    if (editing && dirty) await save()
    if (!st?.current) await save()
    const fd = new FormData()
    fd.append('audio', blob, `voice.${blob.type.includes('mp4') ? 'm4a' : 'webm'}`)
    const res = await fetch(`/api/doctor/cases/${caseId}/prescription/voice`, { method: 'POST', body: fd, credentials: 'same-origin' })
    const json = await res.json().catch(() => null)
    if (!res.ok) throw new Error(json?.error ?? `Upload failed (${res.status})`)
    await load(false)
  }
  const voiceChange = (id: string, change: 'delete' | boolean) =>
    act.run(async () => {
      if (change === 'delete') await api(`/api/doctor/cases/${caseId}/prescription/voice/${id}`, { method: 'DELETE' })
      else await api(`/api/doctor/cases/${caseId}/prescription/voice/${id}`, { method: 'PATCH', body: { includeInDelivery: change } })
      await load(false)
    })

  if (loadError) return <Notice kind="error">{loadError}</Notice>
  if (!st) return <p className="text-sm text-gray-500">Loading prescription…</p>
  const cur = st.current
  const sent = Boolean(cur?.deliveryRequestedAt)
  const imageJobs = st.deliveries.filter((d) => d.kind === 'image')
  const voiceJobs = st.deliveries.filter((d) => d.kind === 'voice')
  const jobOfVoice = (id: string) => voiceJobs.find((j) => j.voiceNoteId === id && j.status !== 'cancelled')
  const unsentVoices = st.voiceNotes.filter((v) => v.includeInDelivery && !jobOfVoice(v.id))
  const fileUrl = (rx: string, kind: 'pdf' | 'image', page = 1, download = false, ofCase = caseId) =>
    `/api/doctor/cases/${ofCase}/prescription/file?rx=${rx}&kind=${kind}&page=${page}${download ? '&download=1' : ''}`

  return (
    <div className="space-y-3 pb-24" data-testid="doctor-prescription">
      {/* ---------------- Finalized ---------------- */}
      {cur && cur.status === 'FINALIZED' && (
        <Card title="🔒 Prescription finalized">
          <div className="grid grid-cols-1 gap-1 text-sm sm:grid-cols-2">
            <span>ID: <b className="font-mono">{cur.rxNumber}</b></span>
            <span>Revision: <b>{cur.revision}</b></span>
            <span>Finalized: <b>{fmtTime(cur.finalizedAt)}</b></span>
            <span>Document: <b>{cur.renderedAt ? `${cur.pages} page(s) + PDF` : cur.renderError ? 'render failed — will retry on send' : 'rendering…'}</b></span>
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            <Button variant="secondary" disabled={!cur.renderedAt} onClick={() => setViewer({ rx: cur.id, caseId, pages: cur.pages })} className="min-h-[44px]">View prescription</Button>
            <a className={`inline-flex min-h-[44px] items-center rounded border border-gray-300 bg-white px-3 text-sm font-medium ${cur.hasPdf ? '' : 'pointer-events-none opacity-50'}`} href={fileUrl(cur.id, 'pdf', 1, true)}>Download PDF</a>
            {writable && <Button variant="secondary" onClick={() => void amend()} disabled={act.busy} className="min-h-[44px]">Create amendment</Button>}
          </div>
          {sent && (
            <div className="mt-3 space-y-1 text-sm" data-testid="rx-delivery">
              <div className="font-medium text-gray-700">WhatsApp delivery {st.whatsappWindowOpen ? '' : <span className="text-amber-700">(24-hour window closed)</span>}</div>
              {[...imageJobs, ...voiceJobs].map((d) => {
                const l = deliveryLabel(d)
                return (
                  <div key={d.jobId} className="flex flex-wrap items-center gap-2">
                    <span>{d.kind === 'image' ? `Prescription image${d.page && imageJobs.length > 1 ? ` ${d.page}` : ''}` : 'Voice explanation'}</span>
                    <span className={l.tone === 'ok' ? 'text-emerald-700' : l.tone === 'bad' ? 'text-red-700' : 'text-amber-700'}>{l.tone === 'ok' ? '✓ ' : l.tone === 'bad' ? '⚠ ' : '… '}{l.text}</span>
                    {d.canRetry && <Button variant="secondary" onClick={() => void retry(d.jobId)} disabled={act.busy}>Retry</Button>}
                  </div>
                )
              })}
            </div>
          )}
        </Card>
      )}

      {/* ---------------- Draft editor ---------------- */}
      {editing && (
        <>
          {cur?.amendedFromId && <Notice kind="info">Amendment (revision {cur.revision}). The previous revision stays preserved and valid until you finalize this one.</Notice>}
          <Card title="Patient">
            <div className="mb-2 grid grid-cols-2 gap-1 text-sm sm:grid-cols-4">
              <span>{st.patient.name ?? '—'}</span>
              <span>{st.patient.age ?? '—'} · {st.patient.sex?.toLowerCase() ?? '—'}</span>
              <span className="col-span-2">{st.patient.location ?? '—'}</span>
              {st.patient.complaint && <span className="col-span-2 text-gray-600 sm:col-span-4">Complaint: {st.patient.complaint}</span>}
            </div>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
              {([['weight', 'Weight'], ['bp', 'BP'], ['pulse', 'Pulse'], ['temperature', 'Temp'], ['respiratoryRate', 'Resp. rate']] as const).map(([k, label]) => (
                <Field key={k} label={label}><input className={inputCls} value={form.vitals[k]} onChange={(e) => set({ vitals: { ...form.vitals, [k]: e.target.value } })} placeholder="optional" /></Field>
              ))}
            </div>
            <div className="mt-2"><Field label="Diagnosis / assessment (optional)"><input className={inputCls} value={form.diagnosis} onChange={(e) => set({ diagnosis: e.target.value })} /></Field></div>
          </Card>

          <Card title="Medicines">
            <div className="space-y-3">
              {form.medicines.map((m, i) => (
                <div key={i} className="rounded-lg border border-gray-200 p-2" data-testid="rx-med">
                  <div className="mb-2 flex items-center gap-2">
                    <span className="flex h-6 w-6 items-center justify-center rounded-full bg-emerald-800 text-xs font-bold text-white">{i + 1}</span>
                    <input className={`${inputCls} font-semibold`} placeholder="Medicine name *" value={m.name} onChange={(e) => setMed(i, 'name', e.target.value)} />
                  </div>
                  <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
                    <input className={inputCls} placeholder="Strength (500 mg)" value={m.strength} onChange={(e) => setMed(i, 'strength', e.target.value)} />
                    <input className={inputCls} placeholder="Form (tablet, syrup)" value={m.formulation} onChange={(e) => setMed(i, 'formulation', e.target.value)} />
                    <input className={inputCls} placeholder="Dose (1 tablet)" value={m.dose} onChange={(e) => setMed(i, 'dose', e.target.value)} />
                    <input className={inputCls} placeholder="Route (oral)" value={m.route} onChange={(e) => setMed(i, 'route', e.target.value)} />
                    <input className={inputCls} placeholder="Frequency (twice daily)" value={m.frequency} onChange={(e) => setMed(i, 'frequency', e.target.value)} />
                    <input className={inputCls} placeholder="Timing (after meals)" value={m.timing} onChange={(e) => setMed(i, 'timing', e.target.value)} />
                    <input className={inputCls} placeholder="Duration (5 days)" value={m.duration} onChange={(e) => setMed(i, 'duration', e.target.value)} />
                    <input className={`${inputCls} col-span-2 md:col-span-1`} placeholder="Instructions" value={m.instructions} onChange={(e) => setMed(i, 'instructions', e.target.value)} />
                  </div>
                  <div className="mt-2 flex flex-wrap gap-2">
                    <Button variant="secondary" onClick={() => moveMed(i, -1)} disabled={i === 0} aria-label="Move up">↑</Button>
                    <Button variant="secondary" onClick={() => moveMed(i, 1)} disabled={i === form.medicines.length - 1} aria-label="Move down">↓</Button>
                    <Button variant="secondary" onClick={() => set({ medicines: [...form.medicines.slice(0, i + 1), { ...m }, ...form.medicines.slice(i + 1)] })}>Duplicate</Button>
                    <Button variant="secondary" onClick={() => set({ medicines: form.medicines.length > 1 ? form.medicines.filter((_, n) => n !== i) : [{ ...emptyMed }] })}>Remove</Button>
                  </div>
                </div>
              ))}
              <Button variant="secondary" onClick={() => set({ medicines: [...form.medicines, { ...emptyMed }] })} className="min-h-[44px] w-full">+ Add medicine</Button>
            </div>
          </Card>

          <Card title="Free-text prescription (optional)">
            <textarea rows={3} className={inputCls} value={form.freeText} onChange={(e) => set({ freeText: e.target.value })} placeholder="Anything easier to write as text (one item per line)" />
          </Card>

          <Card title="Investigations">
            <div className="mb-2 flex flex-wrap gap-1">
              {INVESTIGATIONS.map((t) => (
                <button key={t} type="button" className="rounded-full border border-gray-300 px-2 py-1 text-xs hover:bg-gray-50" onClick={() => set({ investigations: form.investigations.split('\n').map((l) => l.trim()).includes(t) ? form.investigations : [form.investigations.trim(), t].filter(Boolean).join('\n') })}>+ {t}</button>
              ))}
            </div>
            <textarea rows={3} className={inputCls} value={form.investigations} onChange={(e) => set({ investigations: e.target.value })} placeholder="One test per line" />
          </Card>

          <Card title="Advice">
            <textarea rows={3} className={inputCls} dir="auto" value={form.advice} onChange={(e) => set({ advice: e.target.value })} placeholder="Pashto or English, one point per line" />
          </Card>

          <Card title="Follow-up">
            <div className="mb-2 flex flex-wrap gap-1">
              {FOLLOW_UPS.map((t) => (
                <button key={t} type="button" className={`rounded-full border px-3 py-1 text-xs ${form.followUpInterval === t ? 'border-emerald-700 bg-emerald-700 text-white' : 'border-gray-300'}`} onClick={() => set({ followUpInterval: form.followUpInterval === t ? '' : t })}>{t}</button>
              ))}
              <input className={`${inputCls} w-32`} placeholder="or e.g. 10 days" value={FOLLOW_UPS.includes(form.followUpInterval) ? '' : form.followUpInterval} onChange={(e) => set({ followUpInterval: e.target.value })} />
            </div>
            <textarea rows={2} className={inputCls} dir="auto" value={form.followUp} onChange={(e) => set({ followUp: e.target.value })} placeholder="e.g. Return sooner if symptoms worsen" />
          </Card>

          <Card title="Urgent-care instructions (optional)">
            {!showRedFlags ? (
              <Button variant="secondary" onClick={() => setShowRedFlags(true)}>+ Add urgent-care instructions</Button>
            ) : (
              <>
                <textarea rows={2} className={inputCls} dir="auto" value={form.redFlags} onChange={(e) => set({ redFlags: e.target.value })} placeholder="When the patient must seek urgent care (written by you)" />
                <div className="mt-1"><Button variant="secondary" onClick={() => (setShowRedFlags(false), set({ redFlags: '' }))}>Remove section</Button></div>
              </>
            )}
          </Card>

          {st.previous.length > 0 && (
            <Card title="Previous prescriptions">
              <ul className="space-y-2 text-sm">
                {st.previous.map((p) => (
                  <li key={p.id} className="flex flex-wrap items-center gap-2">
                    <span className="font-mono">{p.rxNumber}{p.revision > 1 ? ` rev ${p.revision}` : ''}</span>
                    <span className="text-gray-600">{fmtTime(p.finalizedAt)}</span>
                    <a className="text-emerald-800 underline" href={fileUrl(p.id, 'pdf', 1, false, p.caseId)} target="_blank" rel="noopener">View</a>
                    <a className="text-emerald-800 underline" href={fileUrl(p.id, 'pdf', 1, true, p.caseId)}>Download</a>
                    <Button variant="secondary" onClick={() => void copyFrom(p.id)} disabled={act.busy}>Copy medicines to draft</Button>
                  </li>
                ))}
              </ul>
            </Card>
          )}
        </>
      )}

      {/* ---------------- Voice explanation ---------------- */}
      {writable && (
        <Card title="🎙 Voice explanation (optional)">
          {st.voiceNotes.length > 0 && (
            <ul className="mb-3 space-y-2">
              {st.voiceNotes.map((v) => {
                const job = jobOfVoice(v.id)
                return (
                  <li key={v.id} className="space-y-1 rounded border border-gray-200 p-2 text-sm">
                    <audio controls preload="none" src={`/api/doctor/cases/${caseId}/prescription/voice/${v.id}`} className="w-full" />
                    <div className="flex flex-wrap items-center gap-3">
                      <span>{Math.round(v.durationMs / 1000)} s</span>
                      <label className="flex items-center gap-1">
                        <input type="checkbox" checked={v.includeInDelivery} disabled={Boolean(job) || act.busy} onChange={(e) => void voiceChange(v.id, e.target.checked)} /> Send with prescription
                      </label>
                      {!job && <Button variant="secondary" onClick={() => void voiceChange(v.id, 'delete')} disabled={act.busy}>Delete</Button>}
                    </div>
                  </li>
                )
              })}
            </ul>
          )}
          <VoiceRecorder onSave={uploadVoice} disabled={act.busy} />
          <p className="mt-2 text-xs text-gray-500">On iPhone, recording may briefly pause your call microphone; speak again in the call after stopping.</p>
          {sent && unsentVoices.length > 0 && st.caseStatus === 'IN_CONSULTATION' && (
            <div className="mt-2"><Button onClick={() => void sendVoice()} disabled={act.busy} className="min-h-[44px]">Send voice explanation</Button></div>
          )}
        </Card>
      )}

      {(act.error || act.message) && <div className="space-y-2">{act.error && <Notice kind="error">{act.error}</Notice>}{act.message && <Notice kind="success">{act.message}</Notice>}</div>}

      {/* ---------------- Sticky action bar ---------------- */}
      {writable && (
        <div className="fixed inset-x-0 bottom-0 z-40 border-t border-gray-200 bg-white/95 px-3 py-2 shadow-[0_-4px_12px_rgba(0,0,0,.06)] backdrop-blur" data-testid="rx-actions">
          <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-end gap-2">
            {editing ? (
              <>
                <span className="mr-auto text-xs text-gray-500">{dirty ? 'Unsaved changes…' : savedAt ? `Draft saved ${fmtTime(savedAt)}` : cur ? 'Draft saved' : 'New prescription'}</span>
                <Button variant="secondary" onClick={() => void act.run(async () => (await save(), 'Draft saved.'))} disabled={act.busy} className="min-h-[44px]">Save draft</Button>
                <Button onClick={() => void doPreview()} disabled={act.busy || !hasContent} className="min-h-[44px]" data-testid="rx-preview">{act.busy ? 'Working…' : 'Preview & finalize'}</Button>
              </>
            ) : cur?.status === 'FINALIZED' ? (
              <>
                {st.caseStatus === 'IN_CONSULTATION' && !sent && <Button onClick={() => void send(false)} disabled={act.busy} className="min-h-[44px]" data-testid="rx-send">Send prescription</Button>}
                {st.caseStatus === 'IN_CONSULTATION' && sent && <Button variant="secondary" onClick={() => void send(false)} disabled={act.busy} className="min-h-[44px]">Send again (no duplicates)</Button>}
                {st.caseStatus === 'IN_CONSULTATION' && (
                  sent
                    ? <Button variant="danger" onClick={() => void complete()} disabled={act.busy} className="min-h-[44px]" data-testid="rx-complete">Complete consultation</Button>
                    : <Button variant="danger" onClick={() => void send(true)} disabled={act.busy} className="min-h-[44px]" data-testid="rx-send-complete">Send & complete</Button>
                )}
                {st.caseStatus === 'CONFIRMED' && <span className="text-xs text-gray-600">Start the consultation to send the prescription.</span>}
              </>
            ) : null}
          </div>
        </div>
      )}

      {/* ---------------- Preview (actual rendered document) ---------------- */}
      {preview && (
        <div className="fixed inset-0 z-50 flex flex-col bg-black/70" role="dialog" aria-modal="true" aria-label="Prescription preview">
          <div className="flex-1 overflow-y-auto p-2 sm:p-6">
            <div className="mx-auto max-w-3xl space-y-3">
              {preview.map((src, i) => <img key={i} src={src} alt={`Prescription page ${i + 1}`} className="w-full rounded bg-white shadow-lg" />)}
            </div>
          </div>
          <div className="flex flex-wrap justify-end gap-2 border-t border-gray-700 bg-white p-3">
            <span className="mr-auto self-center text-xs text-gray-600">This is exactly what the patient receives. Finalizing locks it permanently.</span>
            <Button variant="secondary" onClick={() => setPreview(null)} disabled={act.busy} className="min-h-[44px]">Edit</Button>
            {isDraft && <Button onClick={() => void finalize()} disabled={act.busy} className="min-h-[44px]" data-testid="rx-finalize">{act.busy ? 'Finalizing…' : 'Finalize & lock'}</Button>}
          </div>
        </div>
      )}
      {viewer && (
        <div className="fixed inset-0 z-50 flex flex-col bg-black/70" role="dialog" aria-modal="true" aria-label="Prescription">
          <div className="flex-1 overflow-y-auto p-2 sm:p-6">
            <div className="mx-auto max-w-3xl space-y-3">
              {Array.from({ length: viewer.pages }, (_, i) => <img key={i} src={fileUrl(viewer.rx, 'image', i + 1, false, viewer.caseId)} alt={`Prescription page ${i + 1}`} className="w-full rounded bg-white shadow-lg" />)}
            </div>
          </div>
          <div className="flex justify-end gap-2 border-t border-gray-700 bg-white p-3">
            <Button variant="secondary" onClick={() => setViewer(null)} className="min-h-[44px]">Close</Button>
          </div>
        </div>
      )}
    </div>
  )
}
