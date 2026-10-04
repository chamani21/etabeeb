'use client'

import Link from 'next/link'
import { useCallback, useEffect, useState } from 'react'
import { api } from '@/components/staff/api'
import { clinicLocalToIso, fmtTime, isoToClinicLocal, shortId } from '@/components/staff/format'
import { Button, Card, Dl, Field, Notice, StatusBadge, inputCls, useAction } from '@/components/staff/ui'

const INTAKE_STATUSES = ['ADMIN_INTAKE', 'INTAKE_COMPLETE', 'AWAITING_PAYMENT', 'PAYMENT_RECEIVED', 'AWAITING_DOCTOR_APPROVAL', 'CONFIRMED']

type Detail = {
  case: any
  events: Array<{ id: string; eventType: string; oldStatus: string | null; newStatus: string | null; actorType: string; actorName: string | null; createdAt: string }>
  outbox: Array<{ id: string; type: string; audience: string; to: string | null; status: string; attempts: number; providerMessageId: string | null; lastError: string | null; createdAt: string; processedAt: string | null; deliveredAt: string | null; readAt: string | null; failedAt: string | null; canRetry: boolean }>
  prescription: any
  documents: unknown[]
  video: any
}

export default function AdminCaseDetailPage({ params }: { params: { id: string } }) {
  const [data, setData] = useState<Detail | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const load = useCallback(async () => {
    try {
      setData(await api<Detail>(`/api/admin/cases/${params.id}`))
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
    <div className="mx-auto max-w-6xl space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <Link href="/admin/cases" className="text-sm text-emerald-800 underline">← Queue</Link>
        <h1 className="text-xl font-bold text-emerald-900">Case <span className="font-mono">{shortId(c.id)}</span></h1>
        <StatusBadge status={c.status} />
        <Button variant="secondary" onClick={() => void load()}>Refresh</Button>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card title="Patient">
          <Dl rows={[
            ['Name', c.patientName],
            ['Phone', c.patientPhone],
            ['WhatsApp sender', c.whatsappPhone],
            ['Age', c.age],
            ['Sex', c.sex],
            ['Consultation for', c.consultationFor],
            ['Location', c.location],
          ]} />
        </Card>
        <Card title="Operational">
          <Dl rows={[
            ['Status', <StatusBadge key="s" status={c.status} />],
            ['Payment', c.paymentReceived ? `Received (${c.paymentSource ?? '—'})` : 'Not received'],
            ['Amount (PKR)', c.paymentAmount],
            ['Reference', c.paymentReference],
            ['Confirmed by', c.paymentConfirmedByName ? `${c.paymentConfirmedByName}, ${fmtTime(c.paymentConfirmedAt)}` : null],
            ['Doctor decision', c.doctorDecision],
            ['Proposed time', fmtTime(c.proposedConsultationTime)],
            ['Approved time', fmtTime(c.doctorApprovedTime)],
            ['Consultation link', c.consultationLink],
            ['Created / updated', `${fmtTime(c.createdAt)} / ${fmtTime(c.updatedAt)}`],
          ]} />
        </Card>
      </div>

      <Card title="Clinical intake">
        <Dl rows={[
          ['Chief complaint', c.mainComplaint],
          ['Relevant history', c.medicalHistory],
          ['Documents', data.documents.length ? `${data.documents.length} file(s)` : 'None (document upload is not part of V1)'],
        ]} />
      </Card>

      {INTAKE_STATUSES.includes(c.status) && <IntakeForm c={c} onDone={load} />}
      {c.status === 'AWAITING_PAYMENT' && <PaymentForm caseId={c.id} onDone={load} />}
      {(c.status === 'PAYMENT_RECEIVED' || c.status === 'AWAITING_DOCTOR_APPROVAL') && <ApprovalRequestForm c={c} onDone={load} />}
      {data.video && <VideoAdminCard c={c} video={data.video} outbox={data.outbox} onDone={load} />}
      <NotesForm c={c} onDone={load} />

      {data.prescription && (
        <Card title={`Prescription #${data.prescription.number}`}>
          <Dl rows={[
            ['Diagnosis / assessment', data.prescription.diagnosis],
            ['Medicines', (
              <ol key="m" className="list-decimal pl-5">
                {data.prescription.items.map((i: any, n: number) => (
                  <li key={n}>{[i.genericName, i.strength, i.formulation].filter(Boolean).join(' ')} — {[i.dose, i.frequency, i.timing].filter(Boolean).join(', ')}{i.durationDays ? `, ${i.durationDays} days` : ''}{i.patientInstructions ? ` (${i.patientInstructions})` : ''}</li>
                ))}
              </ol>
            )],
            ['Investigations', data.prescription.investigations],
            ['Advice', data.prescription.advice],
            ['Follow-up', data.prescription.followUp],
            ['Notes', data.prescription.notes],
            ['Signed', fmtTime(data.prescription.signedAt)],
          ]} />
        </Card>
      )}

      <OutboxCard caseId={c.id} outbox={data.outbox} onDone={load} />

      <Card title="Audit trail (case events)">
        <ol className="space-y-1 text-sm">
          {data.events.map((e) => (
            <li key={e.id} className="flex flex-wrap gap-2 border-b border-gray-100 py-1 last:border-0">
              <span className="w-40 shrink-0 font-mono text-xs text-gray-500">{fmtTime(e.createdAt)}</span>
              <span className="font-medium">{e.eventType}</span>
              {e.oldStatus !== e.newStatus && <span className="text-gray-600">{e.oldStatus ?? '∅'} → {e.newStatus}</span>}
              <span className="text-gray-500">by {e.actorType}{e.actorName ? ` (${e.actorName})` : ''}</span>
            </li>
          ))}
        </ol>
      </Card>
    </div>
  )
}

function IntakeForm({ c, onDone }: { c: any; onDone: () => Promise<void> }) {
  const editing = c.status !== 'ADMIN_INTAKE' && c.status !== 'INTAKE_COMPLETE'
  const [f, setF] = useState({
    age: c.age ?? '',
    sex: c.sex ?? '',
    consultationFor: c.consultationFor ?? '',
    location: c.location ?? '',
    mainComplaint: c.mainComplaint ?? '',
    medicalHistory: c.medicalHistory ?? '',
    patientName: c.patientName ?? '',
    patientPhone: c.patientPhone ?? '',
  })
  const { busy, error, message, run } = useAction()
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => setF({ ...f, [k]: e.target.value })
  const submit = () =>
    run(async () => {
      const body: Record<string, unknown> = {
        age: Number(f.age),
        sex: f.sex,
        consultationFor: f.consultationFor,
        location: f.location,
        mainComplaint: f.mainComplaint,
        medicalHistory: f.medicalHistory.trim() ? f.medicalHistory : null,
      }
      if (f.patientName.trim() && f.patientName !== c.patientName) body.patientName = f.patientName.trim()
      if (f.patientPhone.trim() && f.patientPhone !== c.patientPhone) body.patientPhone = f.patientPhone.trim()
      const res = await api(`/api/admin/cases/${c.id}/intake`, { body })
      await onDone()
      return res.changed ? (editing ? 'Intake updated.' : 'Intake completed — case is now awaiting payment.') : 'No changes.'
    })
  return (
    <Card title={editing ? 'Edit intake (allowed until the consultation starts)' : 'Complete intake'}>
      <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
        <Field label="Age"><input type="number" min={0} max={130} className={inputCls} value={f.age} onChange={set('age')} /></Field>
        <Field label="Sex">
          <select className={inputCls} value={f.sex} onChange={set('sex')}>
            <option value="">Select…</option><option value="MALE">Male</option><option value="FEMALE">Female</option>
          </select>
        </Field>
        <Field label="Consultation for">
          <select className={inputCls} value={f.consultationFor} onChange={set('consultationFor')}>
            <option value="">Select…</option><option value="SELF">Self</option><option value="OTHER">Someone else</option>
          </select>
        </Field>
        <Field label="Location"><input className={inputCls} value={f.location} onChange={set('location')} /></Field>
        <Field label="Patient name (correction)"><input className={inputCls} value={f.patientName} onChange={set('patientName')} /></Field>
        <Field label="Patient phone (correction)"><input className={inputCls} value={f.patientPhone} onChange={set('patientPhone')} /></Field>
        <div className="md:col-span-3"><Field label="Chief complaint"><textarea rows={2} className={inputCls} value={f.mainComplaint} onChange={set('mainComplaint')} /></Field></div>
        <div className="md:col-span-3"><Field label="Relevant history (optional)"><textarea rows={2} className={inputCls} value={f.medicalHistory} onChange={set('medicalHistory')} /></Field></div>
      </div>
      <div className="mt-3 flex items-center gap-3">
        <Button disabled={busy} onClick={submit}>{editing ? 'Save changes' : 'Complete intake'}</Button>
        {error && <Notice kind="error">{error}</Notice>}
        {message && <Notice kind="success">{message}</Notice>}
      </div>
    </Card>
  )
}

function PaymentForm({ caseId, onDone }: { caseId: string; onDone: () => Promise<void> }) {
  const [f, setF] = useState({ source: 'EASYPAISA', reference: '', amount: '' })
  const [confirm, setConfirm] = useState(false)
  const { busy, error, message, run } = useAction()
  const submit = () =>
    run(async () => {
      await api(`/api/admin/cases/${caseId}/payment`, {
        body: { received: true, source: f.source, reference: f.reference.trim() || null, amount: f.amount ? Number(f.amount) : null },
      })
      await onDone()
      return 'Payment recorded.'
    })
  return (
    <Card title="Confirm manual payment">
      <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
        <Field label="Source">
          <select className={inputCls} value={f.source} onChange={(e) => setF({ ...f, source: e.target.value })}>
            <option value="EASYPAISA">EasyPaisa</option><option value="OTHER">Other</option>
          </select>
        </Field>
        <Field label="Reference"><input className={inputCls} value={f.reference} onChange={(e) => setF({ ...f, reference: e.target.value })} /></Field>
        <Field label="Amount (PKR)"><input type="number" min={0} className={inputCls} value={f.amount} onChange={(e) => setF({ ...f, amount: e.target.value })} /></Field>
      </div>
      <label className="mt-3 flex items-center gap-2 text-sm">
        <input type="checkbox" checked={confirm} onChange={(e) => setConfirm(e.target.checked)} />
        I have verified this payment was received. (Your account and the time are recorded.)
      </label>
      <div className="mt-3 flex items-center gap-3">
        <Button disabled={busy || !confirm} onClick={submit}>Mark payment received</Button>
        {error && <Notice kind="error">{error}</Notice>}
        {message && <Notice kind="success">{message}</Notice>}
      </div>
    </Card>
  )
}

function ApprovalRequestForm({ c, onDone }: { c: any; onDone: () => Promise<void> }) {
  const [time, setTime] = useState(isoToClinicLocal(c.proposedConsultationTime))
  const { busy, error, message, run } = useAction()
  const reRequest = c.status === 'AWAITING_DOCTOR_APPROVAL'
  const submit = () =>
    run(async () => {
      const iso = clinicLocalToIso(time)
      if (!iso) throw new Error('Choose a date and time')
      const res = await api(`/api/admin/cases/${c.id}/request-doctor-approval`, { body: { proposedConsultationTime: iso } })
      await onDone()
      return res.changed ? 'Approval request sent to Dr. Jalaluddin.' : 'Already requested for this time.'
    })
  return (
    <Card title={reRequest ? 'Doctor approval pending — re-request with another time' : 'Propose consultation time and request doctor approval'}>
      {reRequest && c.doctorDecision && c.doctorDecision !== 'PENDING' && (
        <div className="mb-3"><Notice kind="warning">Doctor responded: <b>{c.doctorDecision.replace(/_/g, ' ')}</b>{c.doctorDecision === 'PROPOSE_NEW_TIME' ? ` — suggested ${fmtTime(c.proposedConsultationTime)}` : ''}. Coordinate with the patient, then re-request.</Notice></div>
      )}
      <div className="flex flex-wrap items-end gap-3">
        <Field label="Proposed time (Pakistan time)"><input type="datetime-local" className={inputCls} value={time} onChange={(e) => setTime(e.target.value)} /></Field>
        <Button disabled={busy || !time} onClick={submit}>{reRequest ? 'Re-request approval' : 'Request doctor approval'}</Button>
      </div>
      <div className="mt-2 space-y-2">
        {error && <Notice kind="error">{error}</Notice>}
        {message && <Notice kind="success">{message}</Notice>}
      </div>
    </Card>
  )
}

function NotesForm({ c, onDone }: { c: any; onDone: () => Promise<void> }) {
  const [notes, setNotes] = useState(c.adminNotes ?? '')
  const { busy, error, message, run } = useAction()
  return (
    <Card title="Admin notes (internal — never sent to WhatsApp)">
      <textarea rows={3} className={inputCls} value={notes} onChange={(e) => setNotes(e.target.value)} />
      <div className="mt-2 flex items-center gap-3">
        <Button
          variant="secondary"
          disabled={busy}
          onClick={() =>
            run(async () => {
              const res = await api(`/api/admin/cases/${c.id}/notes`, { body: { notes } })
              await onDone()
              return res.changed ? 'Notes saved.' : 'No changes.'
            })
          }
        >
          Save notes
        </Button>
        {error && <Notice kind="error">{error}</Notice>}
        {message && <Notice kind="success">{message}</Notice>}
      </div>
    </Card>
  )
}

function OutboxCard({ caseId, outbox, onDone }: { caseId: string; outbox: Detail['outbox']; onDone: () => Promise<void> }) {
  const { busy, error, message, run } = useAction()
  return (
    <Card title="WhatsApp messages (outbox)">
      {outbox.length === 0 ? (
        <p className="text-sm text-gray-500">No messages yet.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="border-b text-left text-xs uppercase text-gray-500">
                <th className="px-2 py-1">Created</th><th className="px-2 py-1">Message</th><th className="px-2 py-1">To</th>
                <th className="px-2 py-1">Status</th><th className="px-2 py-1">Delivery</th><th className="px-2 py-1">Meta message ID</th><th className="px-2 py-1">Failure reason</th><th />
              </tr>
            </thead>
            <tbody>
              {outbox.map((j) => (
                <tr key={j.id} className="border-b last:border-0">
                  <td className="px-2 py-1 text-xs">{fmtTime(j.createdAt)}</td>
                  <td className="px-2 py-1">{j.type}</td>
                  <td className="px-2 py-1 font-mono text-xs">{j.audience.toLowerCase()} {j.to ?? ''}</td>
                  <td className={`px-2 py-1 font-semibold ${j.status === 'failed' ? 'text-red-700' : j.status === 'pending' || j.status === 'processing' ? 'text-amber-700' : 'text-emerald-700'}`}>{j.status}</td>
                  <td className="px-2 py-1 text-xs">{deliveryText(j)}</td>
                  <td className="px-2 py-1 font-mono text-xs">{j.providerMessageId ? `${j.providerMessageId.slice(0, 18)}…` : '—'}</td>
                  <td className="px-2 py-1 text-xs text-gray-600">{j.lastError ?? ''}</td>
                  <td className="px-2 py-1">
                    {j.canRetry && (
                      <Button
                        variant="secondary"
                        disabled={busy}
                        onClick={() =>
                          run(async () => {
                            const res = await api(`/api/admin/cases/${caseId}/outbox/${j.id}/retry`, { method: 'POST', body: {} })
                            await onDone()
                            return res.dispatched ? 'Retry sent to WhatsApp transport.' : `Retry queued (${res.reason ?? 'pending'}).`
                          })
                        }
                      >
                        Retry
                      </Button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <div className="mt-2 space-y-2">
        {error && <Notice kind="error">{error}</Notice>}
        {message && <Notice kind="success">{message}</Notice>}
      </div>
    </Card>
  )
}

function deliveryText(j: { status: string; processedAt: string | null; deliveredAt: string | null; readAt: string | null; failedAt: string | null }): string {
  if (j.failedAt) return `failed ${fmtTime(j.failedAt)}`
  if (j.readAt) return `read ${fmtTime(j.readAt)}`
  if (j.deliveredAt) return `delivered ${fmtTime(j.deliveredAt)}`
  if (j.status === 'sent') return 'accepted by Meta (no delivery receipt yet)'
  return '—'
}

function VideoAdminCard({ c, video, outbox, onDone }: { c: any; video: any; outbox: Detail['outbox']; onDone: () => Promise<void> }) {
  const { busy, error, message, run } = useAction()
  const linkMsgs = outbox.filter((j) => j.type === 'CONSULTATION_CONFIRMED_PATIENT')
  const lastMsg = linkMsgs[linkMsgs.length - 1]
  const canRotate = (c.status === 'CONFIRMED' || c.status === 'IN_CONSULTATION') && video.status !== 'ENDED' && video.status !== 'EXPIRED'
  return (
    <Card title="Video session">
      {!video.configured && <div className="mb-3"><Notice kind="warning">LiveKit is not configured on this server — patients cannot join yet.</Notice></div>}
      <Dl rows={[
        ['Scheduled', fmtTime(video.scheduledAt)],
        ['Session status', video.status],
        ['Patient link', video.links.generated === 0 ? 'Not generated yet (created when the confirmation is sent)' : `${video.links.active} active of ${video.links.generated} generated${video.links.expiresAt ? ` · expires ${fmtTime(video.links.expiresAt)}` : ''}`],
        ['Link last used', fmtTime(video.links.lastUsedAt)],
        ['Link message (WhatsApp)', lastMsg ? `${lastMsg.status} · ${deliveryText(lastMsg)}` : 'not queued'],
        ['Patient joined', fmtTime(video.patientJoinedAt)],
        ['Doctor joined', fmtTime(video.doctorJoinedAt)],
        ['Ended', fmtTime(video.endedAt)],
      ]} />
      {canRotate && (
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <Button
            variant="secondary"
            disabled={busy}
            onClick={() =>
              run(async () => {
                const r = await api(`/api/admin/cases/${c.id}/video/regenerate-link`, { method: 'POST', body: {} })
                await onDone()
                return r.changed ? 'Old link revoked; a new link was sent to the patient.' : 'A new link was just sent — wait a minute before sending another.'
              })
            }
          >
            Revoke link &amp; send a new one
          </Button>
          <span className="text-xs text-gray-500">Use if the link was shared by mistake or may be compromised. The old link stops working immediately.</span>
        </div>
      )}
      <div className="mt-2 space-y-2">
        {error && <Notice kind="error">{error}</Notice>}
        {message && <Notice kind="success">{message}</Notice>}
      </div>
    </Card>
  )
}
