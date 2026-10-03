'use client'

import React from 'react'

const STATUS_COLORS: Record<string, string> = {
  NEW: 'bg-gray-100 text-gray-800',
  ADMIN_INTAKE: 'bg-amber-100 text-amber-900',
  INTAKE_COMPLETE: 'bg-amber-50 text-amber-800',
  AWAITING_PAYMENT: 'bg-orange-100 text-orange-900',
  PAYMENT_RECEIVED: 'bg-sky-100 text-sky-900',
  AWAITING_DOCTOR_APPROVAL: 'bg-violet-100 text-violet-900',
  CONFIRMED: 'bg-emerald-100 text-emerald-900',
  IN_CONSULTATION: 'bg-teal-100 text-teal-900',
  PRESCRIPTION_SENT: 'bg-lime-100 text-lime-900',
  COMPLETED: 'bg-green-200 text-green-900',
}

export function StatusBadge({ status }: { status: string }) {
  return (
    <span className={`inline-block rounded px-2 py-0.5 text-xs font-semibold ${STATUS_COLORS[status] ?? 'bg-gray-100 text-gray-800'}`}>
      {status.replace(/_/g, ' ')}
    </span>
  )
}

export function Card({ title, children, actions }: { title?: string; children: React.ReactNode; actions?: React.ReactNode }) {
  return (
    <section className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
      {(title || actions) && (
        <div className="mb-3 flex items-center justify-between gap-2 border-b border-gray-100 pb-2">
          {title && <h3 className="font-semibold text-gray-900">{title}</h3>}
          {actions}
        </div>
      )}
      {children}
    </section>
  )
}

export function Field({ label, children, hint }: { label: string; children: React.ReactNode; hint?: string | undefined }) {
  return (
    <label className="block text-sm">
      <span className="mb-1 block font-medium text-gray-700">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-xs text-gray-500">{hint}</span>}
    </label>
  )
}

export const inputCls =
  'w-full rounded border border-gray-300 px-2 py-1.5 text-sm text-gray-900 focus:border-emerald-600 focus:outline-none focus:ring-1 focus:ring-emerald-600 disabled:bg-gray-100'

export function Button({
  children,
  variant = 'primary',
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'primary' | 'secondary' | 'danger' }) {
  const cls =
    variant === 'primary'
      ? 'bg-emerald-700 text-white hover:bg-emerald-800'
      : variant === 'danger'
        ? 'bg-red-600 text-white hover:bg-red-700'
        : 'border border-gray-300 bg-white text-gray-800 hover:bg-gray-50'
  return (
    <button {...props} className={`rounded px-3 py-1.5 text-sm font-medium disabled:cursor-not-allowed disabled:opacity-50 ${cls} ${props.className ?? ''}`}>
      {children}
    </button>
  )
}

export function Notice({ kind, children }: { kind: 'error' | 'success' | 'info' | 'warning'; children: React.ReactNode }) {
  const cls = {
    error: 'border-red-200 bg-red-50 text-red-800',
    success: 'border-emerald-200 bg-emerald-50 text-emerald-800',
    info: 'border-sky-200 bg-sky-50 text-sky-800',
    warning: 'border-amber-200 bg-amber-50 text-amber-900',
  }[kind]
  return <div className={`rounded border px-3 py-2 text-sm ${cls}`} role={kind === 'error' ? 'alert' : 'status'}>{children}</div>
}

export function Dl({ rows }: { rows: Array<[string, React.ReactNode]> }) {
  return (
    <dl className="grid grid-cols-1 gap-x-4 gap-y-1 text-sm sm:grid-cols-[12rem_1fr]">
      {rows.map(([k, v]) => (
        <React.Fragment key={k}>
          <dt className="font-medium text-gray-500">{k}</dt>
          <dd className="break-words text-gray-900">{v === null || v === undefined || v === '' ? '—' : v}</dd>
        </React.Fragment>
      ))}
    </dl>
  )
}

/** Run an async action with busy/error/success state. */
export function useAction() {
  const [busy, setBusy] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)
  const [message, setMessage] = React.useState<string | null>(null)
  const run = React.useCallback(async (fn: () => Promise<string | void>) => {
    setBusy(true)
    setError(null)
    setMessage(null)
    try {
      const msg = await fn()
      if (msg) setMessage(msg)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong')
    } finally {
      setBusy(false)
    }
  }, [])
  return { busy, error, message, run }
}
