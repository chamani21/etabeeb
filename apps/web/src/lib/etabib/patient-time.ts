/**
 * eTabib V1 — the ONE formatter for consultation times shown to patients.
 *
 * Patients are in Pakistan and Afghanistan. The backend keeps a single
 * timestamp; it is rendered independently in Asia/Karachi and Asia/Kabul from
 * the timezone database (no hard-coded offsets), each with its own local DATE
 * (they differ near midnight). Pashto month names and time-of-day words.
 * No server imports: usable by the patient web page too.
 */

export const PATIENT_TIMEZONES = { pakistan: 'Asia/Karachi', afghanistan: 'Asia/Kabul' } as const

const MONTHS_PS = ['جنوري', 'فبروري', 'مارچ', 'اپریل', 'مې', 'جون', 'جولای', 'اګست', 'سپتمبر', 'اکتوبر', 'نومبر', 'دسمبر']

/** Time-of-day word for a local 24-hour clock hour. */
function dayPartPs(hour: number): string {
  if (hour >= 4 && hour < 12) return 'سهار' // morning
  if (hour === 12) return 'غرمه' // noon
  if (hour >= 13 && hour < 16) return 'ماسپښین' // afternoon
  if (hour >= 16 && hour < 20) return 'ماښام' // evening
  return 'شپه' // night
}

export interface LocalDateTime {
  /** e.g. "06 اکتوبر 2026" */
  date: string
  /** e.g. "5:00 ماښام" */
  time: string
}

function local(ts: Date, timeZone: string): LocalDateTime {
  const parts = new Intl.DateTimeFormat('en-GB', { timeZone, year: 'numeric', month: 'numeric', day: '2-digit', hour: 'numeric', minute: '2-digit', hourCycle: 'h23' }).formatToParts(ts)
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? ''
  const hour24 = Number(get('hour'))
  const hour12 = hour24 % 12 === 0 ? 12 : hour24 % 12
  return {
    date: `${get('day')} ${MONTHS_PS[Number(get('month')) - 1]} ${get('year')}`,
    time: `${hour12}:${get('minute')} ${dayPartPs(hour24)}`,
  }
}

/** One timestamp → Pakistan and Afghanistan local date + time. */
export function formatConsultationForPatient(ts: Date): { pakistan: LocalDateTime; afghanistan: LocalDateTime } {
  return { pakistan: local(ts, PATIENT_TIMEZONES.pakistan), afghanistan: local(ts, PATIENT_TIMEZONES.afghanistan) }
}

/** Multi-line Pashto block for free-form messages and the patient page. */
export function consultationTimeBlockPs(ts: Date): string {
  const t = formatConsultationForPatient(ts)
  return `🇵🇰 د پاکستان وخت:\n${t.pakistan.date} — ${t.pakistan.time}\n\n🇦🇫 د افغانستان وخت:\n${t.afghanistan.date} — ${t.afghanistan.time}`
}

/** Single-line form for WhatsApp template variables (Meta forbids newlines in parameters). */
export function consultationTimeLinePs(ts: Date): string {
  const t = formatConsultationForPatient(ts)
  return `پاکستان: ${t.pakistan.date}، ${t.pakistan.time} | افغانستان: ${t.afghanistan.date}، ${t.afghanistan.time}`
}
