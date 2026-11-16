'use client'

import { useState } from 'react'
import { api } from '@/components/staff/api'
import { fmtTime } from '@/components/staff/format'
import { Button, Card, Dl, Field, Notice, StatusBadge, inputCls, useAction } from '@/components/staff/ui'
import {
  CANCELLATION_REASONS,
  CANCELLATION_REASON_LABELS,
  cancellationReasonLabel,
  canCancel,
  type CancelActorRole,
  type CancellationReason,
} from '@/lib/etabib/cancellation'

/**
 * "Cancel consultation" control: shown only when the role may cancel from the
 * current status. Opens an in-page confirmation dialog that requires a reason.
 */
export function CancelConsultation({
  role,
  c,
  onDone,
}: {
  role: CancelActorRole
  c: { id: string; status: string; patientName: string | null; doctorApprovedTime?: string | null; proposedConsultationTime?: string | null }
  onDone: () => Promise<void>
}) {
  const [open, setOpen] = useState(false)
  const [reason, setReason] = useState<CancellationReason | ''>('')
  const [note, setNote] = useState('')
  const { busy, error, run } = useAction()
  if (!canCancel(role, c.status)) return null

  const scheduled = c.doctorApprovedTime ?? c.proposedConsultationTime ?? null
  const needsNote = reason === 'OTHER'
  const ready = reason !== '' && (!needsNote || note.trim().length > 0)
  const endpoint = role === 'ADMIN' ? `/api/admin/cases/${c.id}/cancel` : `/api/doctor/cases/${c.id}/cancel`
  const close = () => {
    if (busy) return
    setOpen(false)
    setReason('')
    setNote('')
  }
  const submit = () =>
    run(async () => {
      await api(endpoint, { body: { reason, ...(needsNote ? { note: note.trim() } : {}) } })
      setOpen(false)
      await onDone()
    })

  return (
    <>
      <Card>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-sm text-gray-600">
            Cancelling ends this consultation permanently. The patient is notified on WhatsApp and any video link stops working.
          </p>
          <Button variant="danger" onClick={() => setOpen(true)} data-testid="cancel-open">
            Cancel consultation
          </Button>
        </div>
      </Card>
      {open && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-0 sm:items-center sm:p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="cancel-title"
          onKeyDown={(e) => e.key === 'Escape' && close()}
        >
          <div className="w-full max-w-md space-y-3 rounded-t-xl bg-white p-4 shadow-xl sm:rounded-xl">
            <h2 id="cancel-title" className="text-lg font-semibold text-red-800">Cancel this consultation?</h2>
            <Dl rows={[
              ['Patient', c.patientName],
              ['Current state', <StatusBadge key="s" status={c.status} />],
              ['Scheduled time', scheduled ? fmtTime(scheduled) : null],
            ]} />
            <Field label="Reason (required)">
              <select className={inputCls} value={reason} onChange={(e) => setReason(e.target.value as CancellationReason | '')} data-testid="cancel-reason" autoFocus>
                <option value="">Choose a reason…</option>
                {CANCELLATION_REASONS.map((r) => (
                  <option key={r} value={r}>{CANCELLATION_REASON_LABELS[r]}</option>
                ))}
              </select>
            </Field>
            {needsNote && (
              <Field label="Short note (required for Other)" hint="Internal only — never sent to the patient. Avoid clinical details.">
                <input className={inputCls} maxLength={200} value={note} onChange={(e) => setNote(e.target.value)} data-testid="cancel-note" />
              </Field>
            )}
            {error && <Notice kind="error">{error}</Notice>}
            <div className="flex flex-col-reverse gap-2 pt-1 sm:flex-row sm:justify-end">
              <Button variant="secondary" onClick={close} disabled={busy} className="min-h-[44px]">Keep consultation</Button>
              <Button variant="danger" onClick={() => void submit()} disabled={!ready || busy} className="min-h-[44px]" data-testid="cancel-confirm">
                {busy ? 'Cancelling…' : 'Cancel consultation'}
              </Button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}

/** Read-only cancellation summary shown on a CANCELLED case. */
export function CancellationSummary({
  c,
  showNote,
}: {
  c: { status: string; cancelledAt: string | null; cancelledByRole: string | null; cancelledByName?: string | null; cancellationReason: string | null; cancellationNote?: string | null; cancelledFromStatus?: string | null }
  showNote: boolean
}) {
  if (c.status !== 'CANCELLED') return null
  const by = [c.cancelledByRole === 'DOCTOR' ? 'Doctor' : c.cancelledByRole === 'ADMIN' ? 'Admin' : c.cancelledByRole, c.cancelledByName].filter(Boolean).join(' — ')
  return (
    <div className="rounded-lg border border-red-200 bg-red-50 p-4" data-testid="cancellation-summary">
      <h3 className="mb-2 font-semibold text-red-800">Consultation cancelled</h3>
      <Dl rows={[
        ['Reason', cancellationReasonLabel(c.cancellationReason)],
        ...(showNote && c.cancellationNote ? [['Note', c.cancellationNote] as [string, string]] : []),
        ['Cancelled by', by],
        ['Cancelled at', fmtTime(c.cancelledAt)],
        ...(c.cancelledFromStatus ? [['Was', c.cancelledFromStatus.replace(/_/g, ' ')] as [string, string]] : []),
      ]} />
    </div>
  )
}
