'use client'

import { forwardRef } from 'react'
import { Button } from '@/components/staff/ui'
import { DOSE_OPTIONS, FORM_OPTIONS, FREQUENCY_OPTIONS, TIMING_OPTIONS, formatMedicine, parseDoseCode } from '@/lib/etabib/rx/medicine'

/** Doctor-side medicine row: codes from dropdowns + custom text for "Other". */
export type Med = {
  formCode: string; formOther: string; name: string; strength: string
  doseCode: string; doseOther: string; frequencyCode: string; frequencyOther: string
  timingCode: string; timingOther: string; duration: string; instructions: string
  /** legacy field kept so older drafts round-trip unchanged */
  route: string
}
export const emptyMed: Med = { formCode: '', formOther: '', name: '', strength: '', doseCode: '', doseOther: '', frequencyCode: '', frequencyOther: '', timingCode: '', timingOther: '', duration: '', instructions: '', route: '' }

type Stored = Record<string, string | null | undefined>
/** Stored/draft medicine → editor row. Older rows (text, no codes) open as "Other" with their text. */
export function medFromStored(m: Stored): Med {
  const s = (v: string | null | undefined) => v ?? ''
  const coded = (code: string | null | undefined, text: string | null | undefined) =>
    code ? { code, other: code === 'OTHER' ? s(text) : '' } : text?.trim() ? { code: 'OTHER', other: s(text) } : { code: '', other: '' }
  const form = coded(m.formCode, m.formulation)
  const dose = coded(m.doseCode, m.dose)
  const freq = coded(m.frequencyCode, m.frequency)
  const timing = coded(m.timingCode, m.timing)
  return { formCode: form.code, formOther: form.other, name: s(m.name), strength: s(m.strength), doseCode: dose.code, doseOther: dose.other, frequencyCode: freq.code, frequencyOther: freq.other, timingCode: timing.code, timingOther: timing.other, duration: s(m.duration), instructions: s(m.instructions), route: s(m.route) }
}

/** Editor row → API draft medicine. */
export function medToApi(m: Med) {
  const other = (code: string, text: string) => (code === 'OTHER' ? text.trim() || null : null)
  return {
    name: m.name.trim(),
    formCode: m.formCode || null,
    formulation: other(m.formCode, m.formOther),
    strength: m.strength.trim() || null,
    doseCode: m.doseCode || null,
    dose: other(m.doseCode, m.doseOther),
    frequencyCode: m.frequencyCode || null,
    frequency: other(m.frequencyCode, m.frequencyOther),
    timingCode: m.timingCode || null,
    timing: other(m.timingCode, m.timingOther),
    route: m.route.trim() || null,
    duration: m.duration.trim() || null,
    instructions: m.instructions.trim() || null,
  }
}

const isBlank = (m: Med) => !m.name.trim() && !m.formCode && !m.strength.trim() && !m.doseCode && !m.frequencyCode && !m.timingCode && !m.duration.trim() && !m.instructions.trim()

/** Inline validation: name required for a used row; "Other" needs its custom text. */
export function medErrors(m: Med): Partial<Record<'name' | 'formOther' | 'doseOther' | 'frequencyOther' | 'timingOther', string>> {
  if (isBlank(m)) return {}
  const e: Partial<Record<'name' | 'formOther' | 'doseOther' | 'frequencyOther' | 'timingOther', string>> = {}
  if (!m.name.trim()) e.name = 'Medicine name is required'
  if (m.formCode === 'OTHER' && !m.formOther.trim()) e.formOther = 'Specify the form'
  if (m.doseCode === 'OTHER' && !m.doseOther.trim()) e.doseOther = 'Enter the dose'
  if (m.frequencyCode === 'OTHER' && !m.frequencyOther.trim()) e.frequencyOther = 'Enter the frequency'
  if (m.timingCode === 'OTHER' && !m.timingOther.trim()) e.timingOther = 'Enter the timing'
  return e
}

const sel = 'w-full rounded-lg border border-gray-300 bg-white px-2 text-sm text-gray-900 min-h-[44px] focus:border-emerald-600 focus:outline-none focus:ring-1 focus:ring-emerald-600'
const txt = 'w-full rounded-lg border border-gray-300 px-2 text-sm text-gray-900 min-h-[44px] focus:border-emerald-600 focus:outline-none focus:ring-1 focus:ring-emerald-600'
const lbl = 'mb-0.5 block text-[11px] font-semibold uppercase tracking-wide text-gray-500'
const bad = (e?: string) => (e ? ' border-red-500 ring-1 ring-red-500' : '')
const Err = ({ e }: { e?: string | undefined }) => (e ? <span className="mt-0.5 block text-xs text-red-700">{e}</span> : null)

interface Props {
  index: number
  med: Med
  count: number
  showErrors: boolean
  onChange: (patch: Partial<Med>) => void
  onDuplicate: () => void
  onRemove: () => void
  onMove: (d: -1 | 1) => void
}

/** One medicine = one card. Order: Form · Name · Strength / Dose · Frequency · Timing · Duration / Instructions. */
export const MedicineCard = forwardRef<HTMLInputElement, Props>(function MedicineCard({ index, med, count, showErrors, onChange, onDuplicate, onRemove, onMove }, nameRef) {
  const errs = showErrors ? medErrors(med) : {}
  const preview = med.name.trim()
    ? formatMedicine({ name: med.name, strength: med.strength, formCode: med.formCode || null, formulation: med.formOther, ...(parseDoseCode(med.doseCode) ? { doseQuantity: parseDoseCode(med.doseCode)!.quantity, doseUnit: parseDoseCode(med.doseCode)!.unit } : { dose: med.doseCode === 'OTHER' ? med.doseOther : null }), frequencyCode: med.frequencyCode || null, frequency: med.frequencyOther, timingCode: med.timingCode || null, timing: med.timingOther, duration: med.duration, route: med.route })
    : null
  const focusName = () => setTimeout(() => (nameRef as React.RefObject<HTMLInputElement>)?.current?.focus(), 0)
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-3 shadow-sm" data-testid="rx-med">
      <div className="mb-2 flex items-center gap-2">
        <span className="flex h-6 w-6 items-center justify-center rounded-full bg-emerald-800 text-xs font-bold text-white">{index + 1}</span>
        <span className="text-sm font-semibold text-gray-700">Medicine {index + 1}</span>
        <span className="ml-auto flex gap-1">
          <button type="button" className="h-8 w-8 rounded text-gray-400 hover:bg-gray-100 disabled:opacity-30" onClick={() => onMove(-1)} disabled={index === 0} aria-label="Move up">↑</button>
          <button type="button" className="h-8 w-8 rounded text-gray-400 hover:bg-gray-100 disabled:opacity-30" onClick={() => onMove(1)} disabled={index === count - 1} aria-label="Move down">↓</button>
        </span>
      </div>

      {/* Row 1: Form | Medicine name | Strength */}
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-[8.5rem_minmax(0,1fr)_9rem]">
        <div>
          <label className={lbl}>Form</label>
          <select className={sel} value={med.formCode} data-testid="med-form" onChange={(e) => { onChange({ formCode: e.target.value }); if (e.target.value && e.target.value !== 'OTHER') focusName() }}>
            <option value="">—</option>
            {FORM_OPTIONS.map((o) => <option key={o.code} value={o.code}>{o.label}</option>)}
          </select>
          {med.formCode === 'OTHER' && (
            <input className={`${txt} mt-1${bad(errs.formOther)}`} placeholder="Specify form (drops, capsule…)" value={med.formOther} onChange={(e) => onChange({ formOther: e.target.value })} data-testid="med-form-other" autoFocus />
          )}
          <Err e={errs.formOther} />
        </div>
        <div>
          <label className={lbl}>Medicine name *</label>
          <input ref={nameRef} className={`${txt} font-semibold${bad(errs.name)}`} placeholder="e.g. Amoxicillin" value={med.name} onChange={(e) => onChange({ name: e.target.value })} data-testid="med-name" autoComplete="off" />
          <Err e={errs.name} />
        </div>
        <div>
          <label className={lbl}>Strength</label>
          <input className={txt} placeholder="500 mg" value={med.strength} onChange={(e) => onChange({ strength: e.target.value })} data-testid="med-strength" />
        </div>
      </div>

      {/* Row 2: Dose | Frequency | Timing | Duration (2 + 2 on phones) */}
      <div className="mt-2 grid grid-cols-2 gap-2 lg:grid-cols-4">
        <div>
          <label className={lbl}>Dose</label>
          <select className={sel} value={med.doseCode} onChange={(e) => onChange({ doseCode: e.target.value })} data-testid="med-dose">
            <option value="">—</option>
            {DOSE_OPTIONS.map((o) => <option key={o.code} value={o.code}>{o.label}</option>)}
          </select>
          {med.doseCode === 'OTHER' && <input className={`${txt} mt-1${bad(errs.doseOther)}`} placeholder="Custom dose (5 mL, 2 puffs…)" value={med.doseOther} onChange={(e) => onChange({ doseOther: e.target.value })} data-testid="med-dose-other" autoFocus />}
          <Err e={errs.doseOther} />
        </div>
        <div>
          <label className={lbl}>Frequency</label>
          <select className={sel} value={med.frequencyCode} onChange={(e) => onChange({ frequencyCode: e.target.value })} data-testid="med-frequency">
            <option value="">—</option>
            {FREQUENCY_OPTIONS.map((o) => <option key={o.code} value={o.code}>{o.code === 'OTHER' || o.code === 'WEEKLY' ? o.label : `${o.label} (${o.patient})`}</option>)}
          </select>
          {med.frequencyCode === 'OTHER' && <input className={`${txt} mt-1${bad(errs.frequencyOther)}`} placeholder="Custom frequency (every 6 hours…)" value={med.frequencyOther} onChange={(e) => onChange({ frequencyOther: e.target.value })} data-testid="med-frequency-other" autoFocus />}
          <Err e={errs.frequencyOther} />
        </div>
        <div>
          <label className={lbl}>Timing</label>
          <select className={sel} value={med.timingCode} onChange={(e) => onChange({ timingCode: e.target.value })} data-testid="med-timing">
            <option value="">—</option>
            {TIMING_OPTIONS.map((o) => <option key={o.code} value={o.code}>{o.label}</option>)}
          </select>
          {med.timingCode === 'OTHER' && <input className={`${txt} mt-1${bad(errs.timingOther)}`} placeholder="Custom timing (at bedtime…)" value={med.timingOther} onChange={(e) => onChange({ timingOther: e.target.value })} data-testid="med-timing-other" autoFocus />}
          <Err e={errs.timingOther} />
        </div>
        <div>
          <label className={lbl}>Duration</label>
          <input className={txt} placeholder="5 days" value={med.duration} onChange={(e) => onChange({ duration: e.target.value })} data-testid="med-duration" list="rx-durations" />
        </div>
      </div>

      {/* Row 3: Instructions */}
      <div className="mt-2">
        <label className={lbl}>Instructions</label>
        <input className={txt} dir="auto" placeholder="Optional — e.g. take with water" value={med.instructions} onChange={(e) => onChange({ instructions: e.target.value })} data-testid="med-instructions" />
      </div>

      <div className="mt-2 flex flex-wrap items-center gap-2">
        {preview && <span className="mr-auto min-w-0 text-xs text-gray-600" data-testid="med-preview"><b>{preview.title}</b>{preview.details.length ? ` — ${preview.details.join(' | ')}` : ''}</span>}
        <Button variant="secondary" onClick={onDuplicate}>Duplicate</Button>
        <Button variant="secondary" onClick={onRemove}>Remove</Button>
      </div>
    </div>
  )
})
