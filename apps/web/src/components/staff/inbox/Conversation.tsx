'use client'

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { api, ApiError } from '@/components/staff/api'
import { fmtTime } from '@/components/staff/format'
import { Button, Notice, StatusBadge, inputCls } from '@/components/staff/ui'
import { VoiceRecorder } from '@/components/staff/rx/VoiceRecorder'
import { newRequestKey, usePoll } from './usePoll'

// ---------------------------------------------------------------- types
export interface Att {
  id: string
  messageId: string | null
  caseId: string | null
  source: string
  mimeType: string | null
  sizeBytes: number | null
  durationMs: number | null
  filename: string | null
  fetchStatus: 'PENDING' | 'REQUESTED' | 'STORED' | 'FAILED' | 'UNSUPPORTED'
  fetchError: string | null
  canRetry: boolean
  label: string | null
  flaggedAt: string | null
  reviewedAt: string | null
  reviewedBy: string | null
  createdAt: string
}
interface Msg {
  id: string
  direction: 'IN' | 'OUT'
  senderRole: 'PATIENT' | 'BOT' | 'SYSTEM' | 'ADMIN' | 'DOCTOR'
  senderName: string | null
  kind: string
  body: string | null
  historical: boolean
  templateKey: string | null
  caseId: string | null
  caseLink: 'AUTO' | 'MANUAL' | 'NEEDED'
  status: string
  error: string | null
  at: string
  createdAt: string
  attachment: Att | null
}
interface Note {
  id: string
  body: string
  kind: string
  authorRole: string
  authorName: string
  createdAt: string
}
export interface View {
  conversation: {
    id: string
    name: string | null
    profileName: string | null
    phone: string | null
    owner: 'BOT' | 'ADMIN' | 'DOCTOR'
    ownerUserId: string | null
    ownerName: string | null
    ownerVersion: number
    window: { open: boolean; closesAt: string | null; lastPatientMessageAt: string | null }
  }
  me: { id: string; role: 'ADMIN' | 'DOCTOR'; isOwner: boolean; canSend: boolean }
  pending: { id: string; toMe: boolean; requestedBy: string; summary: string | null; attachmentIds: string[]; createdAt: string } | null
  actions: string[]
  resumeBlocker: string | null
  cases: Array<{ id: string; status: string; patientName: string | null; createdAt: string }>
  messages: Msg[]
  hasMore: boolean
  notes: Note[]
  attachments: Att[]
}

// ---------------------------------------------------------------- labels
const OWNER_LABEL: Record<string, string> = { BOT: 'Bot', ADMIN: 'Admin', DOCTOR: 'Doctor' }
const OWNER_CLS: Record<string, string> = { BOT: 'bg-gray-100 text-gray-700', ADMIN: 'bg-sky-100 text-sky-800', DOCTOR: 'bg-emerald-100 text-emerald-800' }
const TEMPLATE_LABEL: Record<string, string> = {
  ASK_PATIENT_NAME: 'Bot asked for the patient’s name',
  ASK_PATIENT_PHONE: 'Bot asked for the phone number',
  PATIENT_ACKNOWLEDGED: 'Bot confirmed the request was registered',
  PATIENT_CASE_IN_PROGRESS: 'Bot: “your case is in progress”',
  CONSULTATION_CONFIRMED_PATIENT: 'Consultation confirmation + link',
  CONSULTATION_CANCELLED_PATIENT: 'Cancellation notice',
  PRESCRIPTION_IMAGE: 'Prescription image',
  PRESCRIPTION_VOICE: 'Doctor’s voice explanation',
  PRESCRIPTION_READY: 'Prescription (text)',
}
const STATUS_TEXT: Record<string, string> = {
  queued: 'Queued',
  sending: 'Sending…',
  sent: 'Sent',
  delivered: 'Delivered',
  read: 'Read',
  failed: 'Failed',
  cancelled: 'Not sent (cancelled)',
  unknown: 'Unknown — check before resending',
  received: '',
}
const ACTION_LABEL: Record<string, string> = {
  take_over: 'Take over',
  take_back: 'Take back to admin',
  request_doctor: 'Request doctor handover',
  cancel_request: 'Cancel doctor request',
  accept: 'Accept',
  decline: 'Decline',
  return_to_admin: 'Return to admin',
  resume_bot: 'Resume bot',
}

const kb = (n: number | null) => (n === null ? '' : n > 1024 * 1024 ? `${(n / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`)
const fileUrl = (id: string, download = false) => `/api/inbox/attachments/${id}${download ? '?download=1' : ''}`
const isPdf = (a: Att) => a.mimeType === 'application/pdf'
const isImage = (a: Att) => Boolean(a.mimeType?.startsWith('image/'))
const isAudio = (a: Att) => Boolean(a.mimeType?.startsWith('audio/')) || Boolean(a.durationMs)

// ---------------------------------------------------------------- attachment view
function AttachmentView({ a, onRetry }: { a: Att; onRetry: (id: string) => void }) {
  const [show, setShow] = useState(false)
  if (a.fetchStatus === 'UNSUPPORTED') return <p className="text-xs italic text-amber-800">File type not supported — ask the patient to send a photo or a PDF.</p>
  if (a.fetchStatus !== 'STORED')
    return (
      <div className="flex flex-wrap items-center gap-2 text-xs text-gray-600">
        {a.fetchStatus === 'FAILED' ? <span className="text-red-700">Download from WhatsApp failed{a.fetchError ? ` (${a.fetchError})` : ''}.</span> : <span>Downloading the file from WhatsApp…{a.fetchError === 'media_download_not_configured' ? ' (download not configured)' : ''}</span>}
        {a.canRetry && (
          <button type="button" onClick={() => onRetry(a.id)} className="min-h-[44px] rounded border border-gray-300 bg-white px-3 text-xs">
            Retry download
          </button>
        )}
      </div>
    )
  if (isAudio(a)) return <audio controls preload="none" src={fileUrl(a.id)} className="w-full max-w-xs" />
  if (isImage(a))
    return show ? (
      <a href={fileUrl(a.id)} target="_blank" rel="noopener noreferrer">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={fileUrl(a.id)} alt="Attachment" loading="lazy" className="max-h-64 max-w-full rounded border border-gray-200" />
      </a>
    ) : (
      <button type="button" onClick={() => setShow(true)} className="min-h-[44px] rounded border border-gray-300 bg-white px-3 text-xs">
        🖼 Show photo ({kb(a.sizeBytes)})
      </button>
    )
  return (
    <a href={fileUrl(a.id)} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-[44px] items-center rounded border border-gray-300 bg-white px-3 text-xs text-emerald-800 underline">
      📄 {isPdf(a) ? 'Open PDF' : 'Open file'} ({kb(a.sizeBytes)})
    </a>
  )
}

// ---------------------------------------------------------------- files panel
function FilesPanel({ view, onChanged, onClose }: { view: View; onChanged: () => void; onClose: () => void }) {
  const isDoctor = view.me.role === 'DOCTOR'
  const [onlyFlagged, setOnlyFlagged] = useState(isDoctor)
  const [err, setErr] = useState<string | null>(null)
  const [editing, setEditing] = useState<string | null>(null)
  const [labelText, setLabelText] = useState('')
  const files = view.attachments.filter((a) => a.source === 'PATIENT' && (!onlyFlagged || a.flaggedAt))
  const patch = async (id: string, body: Record<string, unknown>) => {
    setErr(null)
    try {
      await api(`/api/inbox/attachments/${id}`, { method: 'PATCH', body })
      onChanged()
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Failed')
    }
  }
  const canLink = view.me.role === 'ADMIN' || view.me.isOwner
  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between border-b border-gray-200 p-3">
        <h3 className="text-sm font-semibold">Patient files</h3>
        <button type="button" onClick={onClose} className="min-h-[44px] min-w-[44px] rounded border border-gray-300 px-3 text-sm text-gray-700" aria-label="Close files">
          Close
        </button>
      </div>
      <label className="flex min-h-[44px] items-center gap-2 border-b border-gray-100 px-3 text-sm">
        <input type="checkbox" checked={onlyFlagged} onChange={(e) => setOnlyFlagged(e.target.checked)} className="h-5 w-5" /> Flagged for review
      </label>
      {err && <div className="p-2"><Notice kind="error">{err}</Notice></div>}
      <ul className="flex-1 space-y-3 overflow-y-auto p-3">
        {files.length === 0 && <li className="text-sm text-gray-500">{onlyFlagged ? 'No files flagged for review.' : 'No files from the patient yet.'}</li>}
        {files.map((a) => (
          <li key={a.id} className="space-y-2 rounded border border-gray-200 bg-white p-2 text-sm">
            <div className="flex flex-wrap items-center gap-2 text-xs text-gray-600">
              <span>{isPdf(a) ? 'PDF' : isImage(a) ? 'Photo' : isAudio(a) ? 'Audio' : 'File'}</span>
              <span>{fmtTime(a.createdAt)}</span>
              {a.flaggedAt && <span className="rounded bg-amber-100 px-1.5 text-amber-900">Flagged</span>}
              {a.reviewedAt && <span className="rounded bg-emerald-100 px-1.5 text-emerald-900">Reviewed{a.reviewedBy ? ` by ${a.reviewedBy}` : ''}</span>}
            </div>
            {a.label && <p className="font-medium">{a.label}</p>}
            <AttachmentView a={a} onRetry={(id) => void api(`/api/inbox/attachments/${id}/fetch`, { method: 'POST', body: {} }).then(onChanged, (e) => setErr(e.message))} />
            {a.fetchStatus === 'STORED' && (
              <a href={fileUrl(a.id, true)} className="block text-xs text-emerald-800 underline">
                Download original
              </a>
            )}
            <div className="flex flex-wrap gap-2">
              {view.me.role === 'ADMIN' && (
                <Button variant="secondary" className="min-h-[44px]" onClick={() => void patch(a.id, { flagged: !a.flaggedAt })}>
                  {a.flaggedAt ? 'Unflag' : 'Flag for doctor review'}
                </Button>
              )}
              {isDoctor && (
                <Button variant="secondary" className="min-h-[44px]" onClick={() => void patch(a.id, { reviewed: !a.reviewedAt })}>
                  {a.reviewedAt ? 'Mark not reviewed' : 'Mark reviewed'}
                </Button>
              )}
              <Button
                variant="secondary"
                className="min-h-[44px]"
                onClick={() => {
                  setEditing(a.id)
                  setLabelText(a.label ?? '')
                }}
              >
                Label
              </Button>
            </div>
            {editing === a.id && (
              <div className="flex gap-2">
                <input dir="auto" aria-label="Internal label" className={`${inputCls} min-h-[44px]`} maxLength={120} value={labelText} onChange={(e) => setLabelText(e.target.value)} placeholder="Internal label (staff only)" />
                <Button className="min-h-[44px]" onClick={() => void patch(a.id, { label: labelText }).then(() => setEditing(null))}>
                  Save
                </Button>
              </div>
            )}
            {canLink && view.cases.length > 0 && (
              <select aria-label="Case for this file" className={`${inputCls} min-h-[44px]`} value={a.caseId ?? ''} onChange={(e) => void patch(a.id, { caseId: e.target.value || null })}>
                <option value="">Case association needed</option>
                {view.cases.map((c) => (
                  <option key={c.id} value={c.id}>
                    {(c.patientName ?? 'Patient') + ' · ' + c.status + ' · ' + fmtTime(c.createdAt)}
                  </option>
                ))}
              </select>
            )}
          </li>
        ))}
      </ul>
    </div>
  )
}

// ---------------------------------------------------------------- main
type Timeline = ({ t: 'msg' } & Msg) | ({ t: 'note' } & Note)

export function Conversation({ conversationId, onBack, compact = false, fill = false }: { conversationId: string; onBack?: () => void; compact?: boolean; fill?: boolean }) {
  const [view, setView] = useState<View | null>(null)
  const [older, setOlder] = useState<Msg[]>([])
  const [olderNotes, setOlderNotes] = useState<Note[]>([])
  const [hasOlder, setHasOlder] = useState(false)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [mode, setMode] = useState<'patient' | 'note'>('patient')
  const [draft, setDraft] = useState('')
  const [draftKey, setDraftKey] = useState(newRequestKey)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [info, setInfo] = useState<string | null>(null)
  const [showFiles, setShowFiles] = useState(false)
  const [panel, setPanel] = useState<null | 'request_doctor' | 'decline' | 'return_to_admin'>(null)
  const [panelText, setPanelText] = useState('')
  const [panelFiles, setPanelFiles] = useState<string[]>([])
  const scroller = useRef<HTMLDivElement | null>(null)
  const atBottom = useRef(true)
  const restore = useRef<number | null>(null)
  const fileInput = useRef<HTMLInputElement | null>(null)

  const load = useCallback(async () => {
    try {
      const v = await api<View>(`/api/inbox/conversations/${conversationId}`)
      setView(v)
      setLoadError(null)
      if (older.length === 0) setHasOlder(v.hasMore)
    } catch (e) {
      if (e instanceof ApiError && e.status === 404) setLoadError('Conversation not found or not available to you.')
      else throw e
    }
  }, [conversationId, older.length])
  usePoll(load, 4_000)

  // Mark read when opened and whenever new patient messages arrive while visible
  const lastIn = view?.messages.filter((m) => m.direction === 'IN').slice(-1)[0]?.id
  useEffect(() => {
    if (lastIn && !document.hidden) void api(`/api/inbox/conversations/${conversationId}/read`, { method: 'POST', body: {} }).catch(() => undefined)
  }, [conversationId, lastIn])

  const loadOlder = async () => {
    const all = [...older, ...(view?.messages ?? [])]
    const first = all[0]
    if (!first) return
    const el = scroller.current
    restore.current = el ? el.scrollHeight - el.scrollTop : null
    const v = await api<View>(`/api/inbox/conversations/${conversationId}?before=${encodeURIComponent(first.createdAt)}`)
    setOlder((o) => [...v.messages, ...o])
    setOlderNotes((n) => [...v.notes, ...n])
    setHasOlder(v.hasMore)
  }

  // Keep the reading position: stick to the bottom only if staff were already there
  useLayoutEffect(() => {
    const el = scroller.current
    if (!el) return
    if (restore.current !== null) {
      el.scrollTop = el.scrollHeight - restore.current
      restore.current = null
    } else if (atBottom.current) {
      el.scrollTop = el.scrollHeight
    }
  }, [view, older])

  const onScroll = () => {
    const el = scroller.current
    if (el) atBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80
  }

  const run = async (fn: () => Promise<unknown>, ok?: string) => {
    if (busy) return
    setBusy(true)
    setError(null)
    setInfo(null)
    try {
      await fn()
      if (ok) setInfo(ok)
      await load()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed')
      if (e instanceof ApiError && e.code === 'ownership_conflict') await load().catch(() => undefined)
    } finally {
      setBusy(false)
    }
  }

  if (loadError) return <Notice kind="error">{loadError}</Notice>
  if (!view) return <p className="p-4 text-sm text-gray-500">Loading conversation…</p>
  const c = view.conversation

  const ownership = (action: string, extra: Record<string, unknown> = {}, ok?: string) =>
    run(() => api(`/api/inbox/conversations/${conversationId}/ownership`, { body: { action, expectedVersion: c.ownerVersion, ...extra } }), ok)

  const onAction = (action: string) => {
    if (action === 'request_doctor' || action === 'decline' || action === 'return_to_admin') {
      setPanel(action)
      setPanelText('')
      setPanelFiles(view.attachments.filter((a) => a.source === 'PATIENT' && a.flaggedAt).map((a) => a.id))
      return
    }
    if (action === 'resume_bot' && view.resumeBlocker) {
      setError(view.resumeBlocker)
      return
    }
    void ownership(action, {}, action === 'take_over' ? 'You now own this conversation. The bot will not reply to the patient.' : undefined)
  }

  const submitPanel = () => {
    if (panel === 'request_doctor') void ownership('request_doctor', { summary: panelText, attachmentIds: panelFiles }, 'Doctor handover requested. You stay responsible until the doctor accepts.').then(() => setPanel(null))
    if (panel === 'decline') void ownership('decline', { reason: panelText }, 'Declined. The admin stays responsible.').then(() => setPanel(null))
    if (panel === 'return_to_admin') void ownership('return_to_admin', { instruction: panelText }, 'Returned to admin.').then(() => setPanel(null))
  }

  const send = () =>
    run(async () => {
      if (mode === 'note') {
        await api(`/api/inbox/conversations/${conversationId}/notes`, { body: { body: draft } })
      } else {
        await api(`/api/inbox/conversations/${conversationId}/messages`, { body: { body: draft, clientRequestKey: draftKey, expectedVersion: c.ownerVersion } })
      }
      // Only cleared after success: a failed send keeps the draft (and its key, so a retry is idempotent)
      setDraft('')
      setDraftKey(newRequestKey())
      atBottom.current = true
    })

  const upload = (path: string, form: FormData) =>
    fetch(path, { method: 'POST', body: form, credentials: 'same-origin' }).then(async (res) => {
      const json = await res.json().catch(() => null)
      if (!res.ok) throw new ApiError(res.status, json?.code ?? 'error', json?.error ?? `Upload failed (${res.status})`)
    })

  const sendFile = (file: File) =>
    run(async () => {
      const form = new FormData()
      form.append('file', file)
      if (draft.trim()) form.append('caption', draft.trim())
      form.append('clientRequestKey', draftKey)
      form.append('expectedVersion', String(c.ownerVersion))
      await upload(`/api/inbox/conversations/${conversationId}/files`, form)
      setDraft('')
      setDraftKey(newRequestKey())
      atBottom.current = true
    }, 'File queued for the patient.')

  const sendVoice = async (blob: Blob) => {
    const key = newRequestKey()
    const form = new FormData()
    form.append('audio', blob, `voice.${blob.type.includes('mp4') ? 'm4a' : 'webm'}`)
    form.append('clientRequestKey', key)
    form.append('expectedVersion', String(c.ownerVersion))
    // Errors propagate to the recorder, which keeps the recording for another try
    await upload(`/api/inbox/conversations/${conversationId}/audio`, form)
    atBottom.current = true
    await load()
  }

  const timeline: Timeline[] = [
    ...[...older, ...view.messages].map((m) => ({ t: 'msg' as const, ...m })),
    ...[...olderNotes, ...view.notes].filter((n, i, all) => all.findIndex((x) => x.id === n.id) === i).map((n) => ({ t: 'note' as const, ...n })),
  ]
    .filter((x, i, all) => all.findIndex((y) => y.t === x.t && y.id === x.id) === i)
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt))

  const linkCase = (messageId: string, caseId: string) => run(() => api(`/api/inbox/messages/${messageId}`, { method: 'PATCH', body: { caseId: caseId || null } }))
  const canLink = view.me.role === 'ADMIN' || view.me.isOwner
  const ownerText = c.owner === 'BOT' ? 'Bot is answering' : `${OWNER_LABEL[c.owner]}${c.ownerName ? `: ${c.ownerName}` : ' queue (unclaimed)'}`
  const sendBlock = !view.me.isOwner
    ? c.owner === 'BOT'
      ? 'The bot owns this conversation. Take over to message the patient.'
      : `Only the current owner (${ownerText}) can message the patient. You can add internal notes.`
    : !c.window.open
      ? 'WhatsApp window closed: free-form messages are only allowed within 24 hours of the patient’s last message. Wait for the patient to write. (No approved “invite reply” template exists yet.)'
      : null

  return (
    <div className={`flex min-h-0 flex-col ${compact ? 'h-[70dvh]' : fill ? 'h-full' : 'h-[calc(100dvh-7.5rem)] md:h-[calc(100dvh-8.5rem)]'}`}>
      {/* Header */}
      <div className="flex flex-wrap items-start gap-2 border-b border-gray-200 bg-white p-3">
        {onBack && (
          <button type="button" onClick={onBack} className="min-h-[44px] min-w-[44px] rounded border border-gray-300 px-3 text-sm md:hidden" aria-label="Back to conversations">
            ← Back
          </button>
        )}
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="truncate font-semibold" dir="auto">
              {c.name ?? c.profileName ?? 'WhatsApp contact'}
            </span>
            <span className="text-xs text-gray-500" dir="ltr">
              {c.phone}
            </span>
          </div>
          <div className="mt-1 flex flex-wrap items-center gap-2 text-xs">
            <span className={`rounded px-1.5 py-0.5 font-medium ${OWNER_CLS[c.owner]}`}>{ownerText}</span>
            {view.pending && <span className="rounded bg-amber-100 px-1.5 py-0.5 font-medium text-amber-900">Doctor handover pending{view.pending.toMe ? ' — for you' : ''}</span>}
            <span className={c.window.open ? 'text-emerald-800' : 'text-gray-600'}>
              {c.window.open ? `Reply window open until ${fmtTime(c.window.closesAt)}` : 'Reply window closed'}
            </span>
            {view.cases[0] && (
              <span className="inline-flex items-center gap-1">
                Case: <StatusBadge status={view.cases[0].status} />
              </span>
            )}
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          {view.actions.map((a) => (
            <Button key={a} variant={a === 'take_over' || a === 'accept' ? 'primary' : 'secondary'} className="min-h-[44px]" disabled={busy} onClick={() => onAction(a)}>
              {ACTION_LABEL[a] ?? a}
            </Button>
          ))}
          <Button variant="secondary" className="min-h-[44px]" onClick={() => setShowFiles((s) => !s)}>
            Files ({view.attachments.filter((a) => a.source === 'PATIENT').length})
          </Button>
        </div>
      </div>

      {view.pending && (
        <div className="border-b border-amber-200 bg-amber-50 p-3 text-sm">
          <p>
            <b>{view.pending.requestedBy}</b> asked the doctor to take this conversation ({fmtTime(view.pending.createdAt)}). The admin stays responsible until the doctor accepts.
          </p>
          {view.pending.summary && (
            <p className="mt-1 whitespace-pre-wrap" dir="auto">
              <span className="font-medium">Internal summary: </span>
              {view.pending.summary}
            </p>
          )}
          {view.pending.attachmentIds.length > 0 && <p className="mt-1 text-xs">{view.pending.attachmentIds.length} file(s) selected — see Files → Flagged for review.</p>}
        </div>
      )}

      {panel && (
        <div className="space-y-2 border-b border-gray-200 bg-gray-50 p-3 text-sm">
          {panel === 'request_doctor' && (
            <>
              <p>
                Doctor: <b>Dr. Jalaluddin</b> (the configured eTabeeb doctor)
              </p>
              <textarea dir="auto" className={inputCls} rows={3} maxLength={1000} placeholder="Short internal summary for the doctor (never sent to the patient)" value={panelText} onChange={(e) => setPanelText(e.target.value)} />
              {view.attachments.some((a) => a.source === 'PATIENT' && a.fetchStatus === 'STORED') && (
                <fieldset className="space-y-1">
                  <legend className="text-xs font-medium">Files to include</legend>
                  {view.attachments
                    .filter((a) => a.source === 'PATIENT' && a.fetchStatus === 'STORED')
                    .map((a) => (
                      <label key={a.id} className="flex min-h-[44px] items-center gap-2">
                        <input
                          type="checkbox"
                          className="h-5 w-5"
                          checked={panelFiles.includes(a.id)}
                          onChange={(e) => setPanelFiles((f) => (e.target.checked ? [...f, a.id] : f.filter((x) => x !== a.id)))}
                        />
                        {(isPdf(a) ? 'PDF' : isImage(a) ? 'Photo' : 'File') + ' · ' + fmtTime(a.createdAt) + (a.label ? ` · ${a.label}` : '')}
                      </label>
                    ))}
                </fieldset>
              )}
            </>
          )}
          {panel === 'decline' && <input dir="auto" className={inputCls} maxLength={500} placeholder="Internal reason (admin stays responsible)" value={panelText} onChange={(e) => setPanelText(e.target.value)} />}
          {panel === 'return_to_admin' && <input dir="auto" className={inputCls} maxLength={1000} placeholder="Optional instruction for the admin (e.g. arrange follow-up, payment)" value={panelText} onChange={(e) => setPanelText(e.target.value)} />}
          <div className="flex gap-2">
            <Button className="min-h-[44px]" disabled={busy} onClick={submitPanel}>
              {ACTION_LABEL[panel]}
            </Button>
            <Button variant="secondary" className="min-h-[44px]" onClick={() => setPanel(null)}>
              Cancel
            </Button>
          </div>
        </div>
      )}

      <div className="flex min-h-0 flex-1">
        {/* Messages */}
        <div ref={scroller} onScroll={onScroll} className="min-w-0 flex-1 space-y-2 overflow-y-auto bg-gray-50 p-3" aria-live="polite">
          {hasOlder && (
            <div className="text-center">
              <Button variant="secondary" className="min-h-[44px]" onClick={() => void loadOlder()}>
                Load earlier messages
              </Button>
            </div>
          )}
          {timeline.map((x) =>
            x.t === 'note' ? (
              <div key={`n-${x.id}`} className="mx-auto max-w-[90%] rounded border border-yellow-300 bg-yellow-50 px-3 py-2 text-sm">
                <div className="text-xs font-semibold text-yellow-900">
                  🔒 Internal note · {x.authorName} ({x.authorRole === 'DOCTOR' ? 'Doctor' : 'Admin'}) · {fmtTime(x.createdAt)}
                </div>
                <p className="whitespace-pre-wrap" dir="auto">
                  {x.body}
                </p>
              </div>
            ) : (
              <div key={`m-${x.id}`} className={`flex ${x.direction === 'IN' ? 'justify-start' : 'justify-end'}`}>
                <div
                  className={`max-w-[85%] rounded-lg px-3 py-2 text-sm shadow-sm ${
                    x.direction === 'IN' ? 'bg-white' : x.senderRole === 'BOT' || x.senderRole === 'SYSTEM' ? 'bg-gray-200' : 'bg-emerald-100'
                  }`}
                >
                  <div className="mb-0.5 text-[11px] text-gray-500">
                    {x.direction === 'IN' ? 'Patient' : x.senderRole === 'BOT' ? 'Bot' : x.senderRole === 'SYSTEM' ? 'eTabeeb (automatic)' : `${x.senderName ?? OWNER_LABEL[x.senderRole]} (${OWNER_LABEL[x.senderRole]})`} · {fmtTime(x.at)}
                  </div>
                  {x.historical && !x.body ? (
                    <p className="italic text-gray-600">
                      {x.direction === 'IN' ? `Patient message (${x.kind})` : (TEMPLATE_LABEL[x.templateKey ?? ''] ?? 'Automatic message')} — content not recorded before the inbox was enabled
                    </p>
                  ) : (
                    x.body && (
                      <p className="whitespace-pre-wrap break-words" dir="auto">
                        {x.body}
                      </p>
                    )
                  )}
                  {!x.body && !x.attachment && !x.historical && <p className="italic text-gray-600">{x.kind === 'location' ? 'Location shared (not shown in the inbox)' : x.kind === 'contacts' ? 'Contact card shared' : x.kind === 'reaction' ? 'Reaction' : `${x.kind} message`}</p>}
                  {x.attachment && (
                    <div className="mt-1">
                      <AttachmentView a={x.attachment} onRetry={(id) => void run(() => api(`/api/inbox/attachments/${id}/fetch`, { method: 'POST', body: {} }))} />
                    </div>
                  )}
                  {x.direction === 'OUT' && STATUS_TEXT[x.status] !== '' && (
                    <div className={`mt-1 text-right text-[11px] ${x.status === 'failed' || x.status === 'unknown' ? 'text-red-700' : 'text-gray-500'}`}>
                      {STATUS_TEXT[x.status] ?? x.status}
                      {x.error ? ` — ${x.error}` : ''}
                    </div>
                  )}
                  {x.direction === 'IN' && x.caseLink === 'NEEDED' && !x.historical && (
                    <div className="mt-1 text-[11px] text-amber-800">
                      Case association needed
                      {canLink && view.cases.length > 0 && (
                        <select aria-label="Associate with case" className="ml-1 min-h-[44px] rounded border border-amber-300 bg-white text-xs" defaultValue="" onChange={(e) => e.target.value && void linkCase(x.id, e.target.value)}>
                          <option value="">Choose case…</option>
                          {view.cases.map((cs) => (
                            <option key={cs.id} value={cs.id}>
                              {(cs.patientName ?? 'Patient') + ' · ' + cs.status}
                            </option>
                          ))}
                        </select>
                      )}
                    </div>
                  )}
                </div>
              </div>
            ),
          )}
          {timeline.length === 0 && <p className="text-center text-sm text-gray-500">No messages yet.</p>}
        </div>

        {/* Files: side column on desktop, full overlay on mobile */}
        {showFiles && (
          <div className="fixed inset-0 z-40 bg-white md:static md:z-auto md:w-80 md:flex-shrink-0 md:border-l md:border-gray-200">
            <FilesPanel view={view} onChanged={() => void load()} onClose={() => setShowFiles(false)} />
          </div>
        )}
      </div>

      {/* Composer */}
      <div className="border-t border-gray-200 bg-white p-2 pb-[max(0.5rem,env(safe-area-inset-bottom))]">
        <div className="mb-2 flex gap-2" role="tablist">
          <button type="button" role="tab" aria-selected={mode === 'patient'} onClick={() => setMode('patient')} className={`min-h-[44px] flex-1 rounded px-3 text-sm font-medium ${mode === 'patient' ? 'bg-emerald-700 text-white' : 'border border-gray-300 bg-white'}`}>
            Message patient
          </button>
          <button type="button" role="tab" aria-selected={mode === 'note'} onClick={() => setMode('note')} className={`min-h-[44px] flex-1 rounded px-3 text-sm font-medium ${mode === 'note' ? 'bg-yellow-400 text-yellow-950' : 'border border-gray-300 bg-white'}`}>
            🔒 Internal note
          </button>
        </div>
        {error && <div className="mb-2"><Notice kind="error">{error}</Notice></div>}
        {info && <div className="mb-2"><Notice kind="success">{info}</Notice></div>}
        {mode === 'patient' && sendBlock ? (
          <p className="rounded border border-gray-200 bg-gray-50 p-2 text-sm text-gray-700">{sendBlock}</p>
        ) : (
          <>
            <div className="flex items-end gap-2">
              <textarea
                dir="auto"
                rows={2}
                maxLength={mode === 'note' ? 2000 : 4000}
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                placeholder={mode === 'note' ? 'Internal note — staff only, never sent to the patient' : 'Message to the patient (WhatsApp, Pashto)'}
                className={`${inputCls} min-h-[44px] flex-1 ${mode === 'note' ? 'border-yellow-400 bg-yellow-50' : ''}`}
              />
              <Button className="min-h-[44px]" disabled={busy || !draft.trim()} onClick={() => void send()}>
                {busy ? '…' : mode === 'note' ? 'Add note' : 'Send'}
              </Button>
            </div>
            {mode === 'patient' && (
              <div className="mt-2 flex flex-wrap items-start gap-2">
                <input
                  ref={fileInput}
                  type="file"
                  accept="image/jpeg,image/png,application/pdf"
                  className="hidden"
                  onChange={(e) => {
                    const f = e.target.files?.[0]
                    e.target.value = ''
                    if (f) void sendFile(f)
                  }}
                />
                <Button variant="secondary" className="min-h-[44px]" disabled={busy} onClick={() => fileInput.current?.click()}>
                  📎 Photo / PDF
                </Button>
                <div className="min-w-[200px] flex-1">
                  <VoiceRecorder onSave={sendVoice} disabled={busy} recordLabel="🎙 Record voice message" saveLabel="Send voice message" savingLabel="Sending…" />
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}
