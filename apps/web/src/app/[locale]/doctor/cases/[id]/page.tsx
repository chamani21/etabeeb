'use client'

import Link from 'next/link'
import { useCallback, useEffect, useState } from 'react'
import { api } from '@/components/staff/api'
import { clinicLocalToIso, fmtTime, isoToClinicLocal, shortId } from '@/components/staff/format'
import { Button, Card, Dl, Field, Notice, StatusBadge, inputCls, useAction } from '@/components/staff/ui'
import { CancelConsultation, CancellationSummary } from '@/components/staff/CancelConsultation'
import { cancellationReasonLabel } from '@/lib/etabib/cancellation'
import dynamic from 'next/dynamic'
import { DoctorPrescription } from '@/components/staff/rx/DoctorPrescription'
import { CaseChat } from '@/components/staff/inbox/CaseChat'
import type { CallMode } from '@/components/video/callController'

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

      <CancellationSummary c={c} showNote={false} />

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
      {['CONFIRMED', 'IN_CONSULTATION', 'PRESCRIPTION_SENT', 'COMPLETED'].includes(c.status) && <DoctorPrescription caseId={c.id} onCaseChange={load} />}
      <CaseChat caseId={c.id} />
      <CancelConsultation role="DOCTOR" c={c} onDone={load} />

      <Card title="Timeline">
        <ol className="space-y-1 text-sm">
          {data.events.map((e: any, i: number) => (
            <li key={i} className="flex gap-2"><span className="w-40 shrink-0 font-mono text-xs text-gray-500">{fmtTime(e.createdAt)}</span><span className={e.eventType === 'CONSULTATION_CANCELLED' ? 'text-red-700' : ''}>{e.eventType === 'CONSULTATION_CANCELLED' ? 'Consultation cancelled' : e.eventType}</span><span className="text-gray-500">({e.actorType})</span>{e.reason && <span className="text-red-700">— {cancellationReasonLabel(e.reason)}</span>}</li>
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

function DoctorVideoCard({ caseId, video }: { caseId: string; video: any }) {
  const [presence, setPresence] = useState<{ patient: boolean; doctor: boolean } | null>(null)
  const [call, setCall] = useState<{ serverUrl: string; participantToken: string } | null>(null)
  const [state, setState] = useState<'idle' | 'incall' | 'left' | 'dropped' | 'closed' | 'elsewhere'>('idle')
  // Kept across rejoins: Audio Only stays on until the doctor turns it off
  const [mode, setMode] = useState<CallMode>('auto')
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
          role="doctor"
          audio
          video
          initialMode={mode}
          onModeChange={setMode}
          onLeave={() => (setCall(null), setState('left'), void poll())}
          onDropped={(reason) => {
            setCall(null)
            setState(reason === 'ROOM_DELETED' || reason === 'ROOM_CLOSED' ? 'closed' : reason === 'DUPLICATE_IDENTITY' ? 'elsewhere' : 'dropped')
            void poll()
          }}
        />
      ) : (
        <div className="flex flex-wrap items-center gap-3">
          <Button disabled={busy || !video.configured} onClick={() => void join()}>{state === 'idle' ? 'Join consultation' : 'Rejoin consultation'}</Button>
          {state === 'left' && <span className="text-sm text-gray-600">You left the call.</span>}
          {state === 'dropped' && <span className="text-sm text-red-700">Connection lost — the consultation is still open. Rejoin when ready.</span>}
          {state === 'closed' && <span className="text-sm text-gray-700">The video room was closed. Refresh the page to see the consultation status.</span>}
          {state === 'elsewhere' && <span className="text-sm text-amber-800">You joined this call from another tab or device.</span>}
          {mode === 'audio' && <span className="text-xs text-amber-800">Audio only will stay on when you rejoin.</span>}
          <span className="text-xs text-gray-500">Joining does not start the consultation; use “Start consultation” when you begin.</span>
        </div>
      )}
      {error && <div className="mt-2"><Notice kind="error">{error}</Notice></div>}
    </Card>
  )
}
