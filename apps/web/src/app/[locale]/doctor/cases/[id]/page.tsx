'use client'

import Link from 'next/link'
import { useCallback, useEffect, useState } from 'react'
import { api } from '@/components/staff/api'
import { clinicLocalToIso, fmtTime, isoToClinicLocal, shortId } from '@/components/staff/format'
import { Button, Card, Dl, Field, Notice, StatusBadge, inputCls, useAction } from '@/components/staff/ui'
import dynamic from 'next/dynamic'

const VideoRoom = dynamic(() => import('@/components/video/VideoRoom').then((m) => m.VideoRoom), { ssr: false })

type Detail = { case: any; events: any[]; prescription: any; prescriptionDelivery: any; documents: unknown[]; deliveryMode: 'text'; video: any }

export default function DoctorCaseDetailPage({ params }: { params: { id: string } }) {
  const [data, setData] = useState<Detail | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const load = useCallback(async () => {
    try {
      setData(await api<Detail>(`/api/doctor/cases/${params.id}`))
      setLoadError(null)
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : 'Failed to load')
    }
  }, [params.id])
  useEffect(() => void load(), [load])

  if (loadError) return <Notice kind="error">{loadError}</Notice>
  if (!data) return <p className="text-sm text-gray-500">Loading…</p>
  const c = data.case

  return (
    <div className="mx-auto max-w-5xl space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <Link href="/doctor/cases" className="text-sm text-emerald-800 underline">← Consultations</Link>
        <h1 className="text-xl font-bold text-emerald-900">{c.patientName ?? 'Patient'} <span className="font-mono text-sm text-gray-500">{shortId(c.id)}</span></h1>
        <StatusBadge status={c.status} />
        <Button variant="secondary" onClick={() => void load()}>Refresh</Button>
      </div>

      <Card title="Patient intake">
        <Dl rows={[
          ['Name', c.patientName],
          ['Age / sex', [c.age, c.sex?.toLowerCase()].filter(Boolean).join(' / ')],
          ['Consultation for', c.consultationFor === 'OTHER' ? 'Someone else (relative)' : c.consultationFor === 'SELF' ? 'Self' : null],
          ['Location', c.location],
          ['Chief complaint', c.mainComplaint],
          ['Relevant history', c.medicalHistory],
          ['Documents', data.documents.length ? `${data.documents.length} file(s)` : 'None (document upload is not part of V1)'],
          ['Proposed time', fmtTime(c.proposedConsultationTime)],
          ['Approved time', fmtTime(c.doctorApprovedTime)],
          ['Consultation link', c.consultationLink],
        ]} />
      </Card>

      {(c.status === 'CONFIRMED' || c.status === 'IN_CONSULTATION') && data.video && <DoctorVideoCard caseId={c.id} video={data.video} />}
      {c.status === 'AWAITING_DOCTOR_APPROVAL' && <DecisionForm c={c} onDone={load} />}
      {c.status === 'CONFIRMED' && <StartCard caseId={c.id} approvedTime={c.doctorApprovedTime} onDone={load} />}
      {c.status === 'IN_CONSULTATION' && !c.hasPrescription && <PrescriptionEditor caseId={c.id} patientName={c.patientName} onDone={load} />}
      {data.prescription && <PrescriptionView rx={data.prescription} delivery={data.prescriptionDelivery} status={c.status} />}

      <Card title="Timeline">
        <ol className="space-y-1 text-sm">
          {data.events.map((e: any, i: number) => (
            <li key={i} className="flex gap-2"><span className="w-40 shrink-0 font-mono text-xs text-gray-500">{fmtTime(e.createdAt)}</span><span>{e.eventType}</span><span className="text-gray-500">({e.actorType})</span></li>
          ))}
        </ol>
      </Card>
    </div>
  )
}

function DecisionForm({ c, onDone }: { c: any; onDone: () => Promise<void> }) {
  const [approvedTime, setApprovedTime] = useState(isoToClinicLocal(c.proposedConsultationTime))
  const [link, setLink] = useState('')
  const [newTime, setNewTime] = useState('')
  const { busy, error, message, run } = useAction()
  const decide = (body: Record<string, unknown>, ok: string) =>
    run(async () => {
      await api(`/api/doctor/cases/${c.id}/decision`, { body })
      await onDone()
      return ok
    })
  return (
    <Card title="Your decision">
      {c.doctorDecision && c.doctorDecision !== 'PENDING' && (
        <div className="mb-3"><Notice kind="info">Your last response: <b>{c.doctorDecision.replace(/_/g, ' ')}</b>. The admin will coordinate and may re-request.</Notice></div>
      )}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <div className="space-y-2 rounded border border-emerald-200 p-3">
          <div className="font-semibold text-emerald-900">Approve</div>
          <Field label="Approved time (Pakistan time)"><input type="datetime-local" className={inputCls} value={approvedTime} onChange={(e) => setApprovedTime(e.target.value)} /></Field>
          <Field label="External link (optional)" hint="Not needed: approving creates the secure eTabeeb video room and sends the patient their link."><input className={inputCls} placeholder="https://…" value={link} onChange={(e) => setLink(e.target.value)} /></Field>
          <Button
            disabled={busy || !approvedTime}
            onClick={() => {
              const iso = clinicLocalToIso(approvedTime)
              if (!iso) return
              void decide({ decision: 'APPROVED', approvedTime: iso, ...(link.trim() ? { consultationLink: link.trim() } : {}) }, 'Approved — the patient and you will receive the confirmation.')
            }}
          >
            Approve
          </Button>
        </div>
        <div className="space-y-2 rounded border border-sky-200 p-3">
          <div className="font-semibold text-sky-900">Propose another time</div>
          <Field label="Suggested time (Pakistan time)"><input type="datetime-local" className={inputCls} value={newTime} onChange={(e) => setNewTime(e.target.value)} /></Field>
          <Button
            variant="secondary"
            disabled={busy || !newTime}
            onClick={() => {
              const iso = clinicLocalToIso(newTime)
              if (!iso) return
              void decide({ decision: 'PROPOSE_NEW_TIME', proposedTime: iso }, 'New time proposed — not confirmed until you approve.')
            }}
          >
            Propose new time
          </Button>
        </div>
        <div className="space-y-2 rounded border border-amber-200 p-3">
          <div className="font-semibold text-amber-900">Postpone</div>
          <p className="text-xs text-gray-600">The case stays unconfirmed; the admin coordinates with the patient.</p>
          <Button variant="secondary" disabled={busy} onClick={() => void decide({ decision: 'POSTPONED' }, 'Postponed — case remains unconfirmed.')}>Postpone</Button>
        </div>
      </div>
      <div className="mt-3 space-y-2">
        {error && <Notice kind="error">{error}</Notice>}
        {message && <Notice kind="success">{message}</Notice>}
      </div>
    </Card>
  )
}

function StartCard({ caseId, approvedTime, onDone }: { caseId: string; approvedTime: string; onDone: () => Promise<void> }) {
  const { busy, error, run } = useAction()
  return (
    <Card title="Consultation confirmed">
      <p className="mb-3 text-sm">Scheduled for <b>{fmtTime(approvedTime)}</b>. Start the consultation when you begin; then write the prescription.</p>
      <Button disabled={busy} onClick={() => run(async () => { await api(`/api/doctor/cases/${caseId}/start`, { method: 'POST', body: {} }); await onDone() })}>Start consultation</Button>
      {error && <div className="mt-2"><Notice kind="error">{error}</Notice></div>}
    </Card>
  )
}

type Item = { genericName: string; strength: string; formulation: string; dose: string; frequency: string; timing: string; durationDays: string; patientInstructions: string }
const emptyItem: Item = { genericName: '', strength: '', formulation: '', dose: '', frequency: '', timing: '', durationDays: '', patientInstructions: '' }

function PrescriptionEditor({ caseId, patientName, onDone }: { caseId: string; patientName: string | null; onDone: () => Promise<void> }) {
  const [items, setItems] = useState<Item[]>([{ ...emptyItem }])
  const [sec, setSec] = useState({ diagnosis: '', investigations: '', advice: '', followUp: '', notes: '' })
  const [preview, setPreview] = useState(false)
  const { busy, error, message, run } = useAction()
  const setItem = (i: number, k: keyof Item, v: string) => setItems(items.map((it, n) => (n === i ? { ...it, [k]: v } : it)))
  const valid = items.length > 0 && items.every((i) => i.genericName.trim() && i.dose.trim() && i.frequency.trim())
  const clean = (v: string) => (v.trim() ? v.trim() : null)
  const body = {
    items: items.map((i) => ({
      genericName: i.genericName.trim(),
      ...(i.strength.trim() ? { strength: i.strength.trim() } : {}),
      ...(i.formulation.trim() ? { formulation: i.formulation.trim() } : {}),
      dose: i.dose.trim(),
      frequency: i.frequency.trim(),
      ...(i.timing.trim() ? { timing: i.timing.trim() } : {}),
      ...(i.durationDays ? { durationDays: Number(i.durationDays) } : {}),
      ...(i.patientInstructions.trim() ? { patientInstructions: i.patientInstructions.trim() } : {}),
      substitutionAllowed: true,
      isControlled: false,
    })),
    diagnosis: clean(sec.diagnosis),
    investigations: clean(sec.investigations),
    advice: clean(sec.advice),
    followUp: clean(sec.followUp),
    notes: clean(sec.notes),
  }
  return (
    <Card title="Prescription">
      <div className="mb-3"><Notice kind="warning">Staging: the prescription is sent to the patient as a <b>WhatsApp text message</b> (Pashto headings + your content). No PDF is generated. Once sent it cannot be edited.</Notice></div>
      {!preview ? (
        <>
          <div className="grid grid-cols-1 gap-3">
            <Field label="Diagnosis / assessment"><textarea rows={2} className={inputCls} value={sec.diagnosis} onChange={(e) => setSec({ ...sec, diagnosis: e.target.value })} /></Field>
          </div>
          <div className="mt-3 space-y-3">
            <div className="font-semibold text-gray-800">Medicines</div>
            {items.map((it, i) => (
              <div key={i} className="grid grid-cols-2 gap-2 rounded border border-gray-200 p-2 md:grid-cols-4">
                <input className={inputCls} placeholder="Medicine (generic) *" value={it.genericName} onChange={(e) => setItem(i, 'genericName', e.target.value)} />
                <input className={inputCls} placeholder="Strength (e.g. 500 mg)" value={it.strength} onChange={(e) => setItem(i, 'strength', e.target.value)} />
                <input className={inputCls} placeholder="Form (tablet, syrup…)" value={it.formulation} onChange={(e) => setItem(i, 'formulation', e.target.value)} />
                <input className={inputCls} placeholder="Dose * (e.g. 1 tablet)" value={it.dose} onChange={(e) => setItem(i, 'dose', e.target.value)} />
                <input className={inputCls} placeholder="Frequency * (e.g. twice daily)" value={it.frequency} onChange={(e) => setItem(i, 'frequency', e.target.value)} />
                <input className={inputCls} placeholder="Timing (after meals…)" value={it.timing} onChange={(e) => setItem(i, 'timing', e.target.value)} />
                <input className={inputCls} type="number" min={1} placeholder="Duration (days)" value={it.durationDays} onChange={(e) => setItem(i, 'durationDays', e.target.value)} />
                <div className="flex gap-2">
                  <input className={inputCls} placeholder="Instructions" value={it.patientInstructions} onChange={(e) => setItem(i, 'patientInstructions', e.target.value)} />
                  {items.length > 1 && <Button variant="secondary" onClick={() => setItems(items.filter((_, n) => n !== i))}>✕</Button>}
                </div>
              </div>
            ))}
            <Button variant="secondary" onClick={() => setItems([...items, { ...emptyItem }])}>+ Add medicine</Button>
          </div>
          <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-2">
            <Field label="Investigations"><textarea rows={2} className={inputCls} value={sec.investigations} onChange={(e) => setSec({ ...sec, investigations: e.target.value })} /></Field>
            <Field label="Advice"><textarea rows={2} className={inputCls} value={sec.advice} onChange={(e) => setSec({ ...sec, advice: e.target.value })} /></Field>
            <Field label="Follow-up"><textarea rows={2} className={inputCls} value={sec.followUp} onChange={(e) => setSec({ ...sec, followUp: e.target.value })} /></Field>
            <Field label="Notes"><textarea rows={2} className={inputCls} value={sec.notes} onChange={(e) => setSec({ ...sec, notes: e.target.value })} /></Field>
          </div>
          <div className="mt-3"><Button disabled={!valid} onClick={() => setPreview(true)}>Review before sending</Button></div>
        </>
      ) : (
        <>
          <div className="rounded border border-gray-200 bg-gray-50 p-3 text-sm">
            <div className="mb-2 font-semibold">For: {patientName ?? 'patient'}</div>
            {body.diagnosis && <p><b>Diagnosis:</b> {body.diagnosis}</p>}
            <ol className="my-2 list-decimal pl-5">
              {body.items.map((i, n) => <li key={n}>{[i.genericName, i.strength, i.formulation].filter(Boolean).join(' ')} — {[i.dose, i.frequency, i.timing].filter(Boolean).join(', ')}{i.durationDays ? `, ${i.durationDays} days` : ''}{i.patientInstructions ? ` (${i.patientInstructions})` : ''}</li>)}
            </ol>
            {body.investigations && <p><b>Investigations:</b> {body.investigations}</p>}
            {body.advice && <p><b>Advice:</b> {body.advice}</p>}
            {body.followUp && <p><b>Follow-up:</b> {body.followUp}</p>}
            {body.notes && <p><b>Notes:</b> {body.notes}</p>}
          </div>
          <div className="mt-3 flex gap-2">
            <Button variant="secondary" onClick={() => setPreview(false)}>Back to edit</Button>
            <Button
              disabled={busy}
              onClick={() =>
                run(async () => {
                  await api(`/api/doctor/cases/${caseId}/prescription`, { body })
                  await onDone()
                  return 'Prescription signed and queued for WhatsApp delivery.'
                })
              }
            >
              Sign and send to patient
            </Button>
          </div>
        </>
      )}
      <div className="mt-3 space-y-2">
        {error && <Notice kind="error">{error}</Notice>}
        {message && <Notice kind="success">{message}</Notice>}
      </div>
    </Card>
  )
}

function PrescriptionView({ rx, delivery, status }: { rx: any; delivery: any; status: string }) {
  const deliveryText = !delivery
    ? 'Not queued'
    : delivery.delivered
      ? `Delivered to WhatsApp (${delivery.status})`
      : delivery.status === 'failed'
        ? `FAILED: ${delivery.lastError ?? 'unknown'} — the admin can retry from the case page`
        : `Sending… (${delivery.status})`
  return (
    <Card title={`Prescription #${rx.number}`}>
      <div className="mb-2"><Notice kind={delivery?.delivered ? 'success' : delivery?.status === 'failed' ? 'error' : 'info'}>Delivery: {deliveryText}. Case status: {status.replace(/_/g, ' ')}.</Notice></div>
      <Dl rows={[
        ['Diagnosis', rx.diagnosis],
        ['Medicines', <ol key="m" className="list-decimal pl-5">{rx.items.map((i: any, n: number) => <li key={n}>{[i.genericName, i.strength, i.formulation].filter(Boolean).join(' ')} — {[i.dose, i.frequency, i.timing].filter(Boolean).join(', ')}{i.durationDays ? `, ${i.durationDays} days` : ''}</li>)}</ol>],
        ['Investigations', rx.investigations],
        ['Advice', rx.advice],
        ['Follow-up', rx.followUp],
        ['Notes', rx.notes],
        ['Signed', fmtTime(rx.signedAt)],
      ]} />
    </Card>
  )
}

function DoctorVideoCard({ caseId, video }: { caseId: string; video: any }) {
  const [presence, setPresence] = useState<{ patient: boolean; doctor: boolean } | null>(null)
  const [call, setCall] = useState<{ serverUrl: string; participantToken: string } | null>(null)
  const [state, setState] = useState<'idle' | 'incall' | 'left' | 'dropped'>('idle')
  const { busy, error, run } = useAction()
  const poll = useCallback(async () => {
    try {
      const r = await api<{ presence: { patient: boolean; doctor: boolean } | null }>(`/api/doctor/cases/${caseId}/video/status`)
      setPresence(r.presence)
    } catch {
      /* keep last known */
    }
  }, [caseId])
  useEffect(() => {
    void poll()
    const t = setInterval(() => void poll(), 10_000)
    return () => clearInterval(t)
  }, [poll])
  const join = () =>
    run(async () => {
      const r = await api<{ serverUrl: string; participantToken: string }>(`/api/doctor/cases/${caseId}/video/token`, { method: 'POST', body: {} })
      setCall({ serverUrl: r.serverUrl, participantToken: r.participantToken })
      setState('incall')
    })
  const patientState = presence === null ? 'unknown' : presence.patient ? 'in the room' : 'not connected'
  return (
    <Card title="Video consultation">
      {!video.configured && <div className="mb-3"><Notice kind="warning">Video is not configured on this server yet (LiveKit).</Notice></div>}
      <div className="mb-3 flex flex-wrap gap-x-6 gap-y-1 text-sm">
        <span>Scheduled: <b>{fmtTime(video.scheduledAt)}</b></span>
        <span>Room: <b>{video.status}</b></span>
        <span data-testid="patient-presence">Patient: <b className={presence?.patient ? 'text-emerald-700' : 'text-gray-700'}>{patientState}</b></span>
      </div>
      {state === 'incall' && call ? (
        <VideoRoom
          serverUrl={call.serverUrl}
          token={call.participantToken}
          lang="en"
          audio
          video
          onLeave={() => (setCall(null), setState('left'), void poll())}
          onDropped={() => (setCall(null), setState('dropped'), void poll())}
        />
      ) : (
        <div className="flex flex-wrap items-center gap-3">
          <Button disabled={busy || !video.configured} onClick={() => void join()}>{state === 'idle' ? 'Join consultation' : 'Rejoin consultation'}</Button>
          {state === 'left' && <span className="text-sm text-gray-600">You left the call.</span>}
          {state === 'dropped' && <span className="text-sm text-red-700">Connection lost — rejoin when ready.</span>}
          <span className="text-xs text-gray-500">Joining does not start the consultation; use “Start consultation” when you begin.</span>
        </div>
      )}
      {error && <div className="mt-2"><Notice kind="error">{error}</Notice></div>}
    </Card>
  )
}
