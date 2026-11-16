/**
 * eTabib V1 — structured medicine entry: options, labels and the ONE canonical
 * formatter used by the doctor UI, the on-screen preview, the PNG image and the
 * PDF (so they can never disagree). No imports: safe for client components.
 *
 * Stored per item: codes (formCode, doseQuantity+doseUnit, frequencyCode,
 * timingCode) plus the text columns for "Other" values. Older items have no
 * codes and are printed from their text exactly as before.
 */

export const FORM_OPTIONS = [
  { code: 'TABLET', label: 'Tablet', print: 'Tab.' },
  { code: 'SYRUP', label: 'Syrup', print: 'Syp.' },
  { code: 'CREAM', label: 'Cream', print: 'Cream' },
  { code: 'INJECTION', label: 'Inj', print: 'Inj.' },
  { code: 'OTHER', label: 'Other', print: '' },
] as const
export type FormCode = (typeof FORM_OPTIONS)[number]['code']

export const DOSE_UNITS = {
  TABLET: { one: 'tablet', many: 'tablets' },
  TEASPOON: { one: 'teaspoon', many: 'teaspoons' },
  AMPULE: { one: 'ampule', many: 'ampules' },
} as const
export type DoseUnit = keyof typeof DOSE_UNITS
export const DOSE_QUANTITIES = ['0.5', '1', '2'] as const
export type DoseQuantity = (typeof DOSE_QUANTITIES)[number]

/** Dose dropdown: `UNIT:quantity` codes, plus OTHER (custom text). */
export const DOSE_OPTIONS: ReadonlyArray<{ code: string; label: string }> = [
  ...(['TABLET', 'TEASPOON', 'AMPULE'] as const).flatMap((u) => DOSE_QUANTITIES.map((q) => ({ code: `${u}:${q}`, label: doseLabel(q, u) }))),
  { code: 'OTHER', label: 'Other' },
]

export const FREQUENCY_OPTIONS = [
  { code: 'OD', label: 'OD', patient: '1-0-0' },
  { code: 'BD', label: 'BD', patient: '1-0-1' },
  { code: 'TDS', label: 'TDS', patient: '1-1-1' },
  { code: 'HS', label: 'HS', patient: '0-0-1' },
  { code: 'WEEKLY', label: 'Weekly', patient: 'Once weekly' },
  { code: 'OTHER', label: 'Other', patient: '' },
] as const
export type FrequencyCode = (typeof FREQUENCY_OPTIONS)[number]['code']

export const TIMING_OPTIONS = [
  { code: 'BEFORE_MEAL', label: 'Before meal' },
  { code: 'BEFORE_BREAKFAST', label: 'Before breakfast' },
  { code: 'AFTER_MEAL', label: 'After meal' },
  { code: 'OTHER', label: 'Other' },
] as const
export type TimingCode = (typeof TIMING_OPTIONS)[number]['code']

export const FORM_CODES = FORM_OPTIONS.map((o) => o.code) as unknown as readonly [FormCode, ...FormCode[]]
export const FREQUENCY_CODES = FREQUENCY_OPTIONS.map((o) => o.code) as unknown as readonly [FrequencyCode, ...FrequencyCode[]]
export const TIMING_CODES = TIMING_OPTIONS.map((o) => o.code) as unknown as readonly [TimingCode, ...TimingCode[]]
export const DOSE_CODE_RE = /^(TABLET|TEASPOON|AMPULE):(0\.5|1|2)$|^OTHER$/

export function doseLabel(quantity: string, unit: DoseUnit): string {
  const u = DOSE_UNITS[unit]
  const q = quantity === '0.5' ? '½' : quantity
  return `${q} ${quantity === '0.5' || quantity === '1' ? u.one : u.many}`
}

/** "UNIT:q" → { unit, quantity } (null for OTHER / empty / invalid). */
export function parseDoseCode(code: string | null | undefined): { unit: DoseUnit; quantity: DoseQuantity } | null {
  const m = /^(TABLET|TEASPOON|AMPULE):(0\.5|1|2)$/.exec(code ?? '')
  return m ? { unit: m[1] as DoseUnit, quantity: m[2] as DoseQuantity } : null
}

/** Patient-facing frequency: the dosing pattern (BD → 1-0-1), or the doctor's custom text. */
export function frequencyForPatient(code: string | null | undefined, custom: string | null | undefined): string | null {
  const o = FREQUENCY_OPTIONS.find((f) => f.code === code)
  if (o && o.code !== 'OTHER') return o.patient
  return custom?.trim() || null
}

/** Stored/structured medicine as read from the database or the draft. */
export interface MedicineLike {
  name: string
  strength?: string | null | undefined
  formCode?: string | null | undefined
  /** custom form (OTHER) or legacy free-text form */
  formulation?: string | null | undefined
  doseQuantity?: string | null | undefined
  doseUnit?: string | null | undefined
  /** custom dose (OTHER) or legacy free-text dose */
  dose?: string | null | undefined
  frequencyCode?: string | null | undefined
  /** custom frequency (OTHER) or legacy free text */
  frequency?: string | null | undefined
  route?: string | null | undefined
  timingCode?: string | null | undefined
  /** custom timing (OTHER) or legacy free text */
  timing?: string | null | undefined
  duration?: string | null | undefined
  instructions?: string | null | undefined
}

const t = (v: string | null | undefined) => (v ?? '').trim() || null

/**
 * The single canonical rendering of a medicine:
 *   title   "Tab. Augmentin 625 mg"
 *   details ["1 tablet", "1-0-1", "After meal", "5 days"]  (printed joined by " | ")
 */
export function formatMedicine(m: MedicineLike): { title: string; details: string[]; instructions: string | null } {
  const structuredForm = FORM_OPTIONS.find((f) => f.code === m.formCode)
  const title = structuredForm
    ? [structuredForm.code === 'OTHER' ? t(m.formulation) : structuredForm.print, t(m.name), t(m.strength)]
    : [t(m.name), t(m.strength), t(m.formulation)] // older items: as originally printed
  const unit = m.doseUnit && m.doseUnit in DOSE_UNITS ? (m.doseUnit as DoseUnit) : null
  const dose = unit && m.doseQuantity ? doseLabel(m.doseQuantity, unit) : t(m.dose)
  const frequency = m.frequencyCode ? frequencyForPatient(m.frequencyCode, m.frequency) : t(m.frequency)
  const timingOpt = TIMING_OPTIONS.find((o) => o.code === m.timingCode && o.code !== 'OTHER')
  const timing = timingOpt ? timingOpt.label : t(m.timing)
  return {
    title: title.filter(Boolean).join(' '),
    details: [dose, frequency, t(m.route), timing, t(m.duration)].filter((v): v is string => Boolean(v)),
    instructions: t(m.instructions),
  }
}
