/**
 * eTabib V1 patient-facing messages — PASHTO ONLY.
 *
 * Every automated patient message is defined here. Route handlers and
 * services must not contain inline patient-facing text.
 */
import { CLINIC_TIMEZONE } from './config'

export const PATIENT_MESSAGES_PS = {
  /** MESSAGE 1 — first contact: welcome + ask for the patient's name only. */
  askName: 'السلام علیکم، eTabeeb ته ښه راغلاست.\n\nد آنلاین مشورې لپاره مهرباني وکړئ د ناروغ نوم ولیکئ.',
  /** Name was not usable (empty, digits only, media, …). */
  invalidName: 'بښنه غواړو، نوم مو سم ترلاسه نه شو. مهرباني وکړئ یوازې د ناروغ نوم ولیکئ.',
  /** MESSAGE 2 — ask for the contact phone only. */
  askPhone: (name: string) =>
    `مننه ${name}.\n\nاوس مهرباني وکړئ د اړیکې لپاره د ناروغ د موبایل شمېره ولیکئ.\nلکه: 0300XXXXXXX`,
  /** Phone was not a valid number. */
  invalidPhone: 'بښنه غواړو، دا شمېره سمه نه ده. مهرباني وکړئ د موبایل سمه شمېره ولیکئ، لکه: 0300XXXXXXX',
  /** MESSAGE 3 — name + phone received: registered, a representative takes over. Automated questions stop. */
  acknowledged: (name: string | null, helpUrl: string | null) =>
    `مننه${name ? ` ${name}` : ''}.\n\nستاسو د آنلاین مشورې غوښتنه ثبت شوه.\n\nزموږ استازی به ډېر ژر له تاسو سره اړیکه ونیسي.` +
    helpBlock('که کومه پوښتنه لرئ:', helpUrl),
  /** Patient writes again at a later stage (sent at most once per stage). */
  caseInProgress: (helpUrl: string | null) =>
    'ستاسو غوښتنه زموږ له ټیم سره ده. زموږ استازی به ډېر ژر له تاسو سره اړیکه ونیسي.' + helpBlock('که کومه پوښتنه لرئ:', helpUrl),
  /** MESSAGE 4 — confirmed by Dr. Jalaluddin: time, secure eTabeeb link (never a raw video token), help. */
  consultationConfirmed: (time: string, link: string | null, helpUrl: string | null = null) =>
    `ستاسو مشوره له ډاکټر جلال الدین سره تایید شوه.\n\nوخت:\n${time}\n\n` +
    (link ? `د مشورې لینک:\n${link}` : 'د مشورې لینک به وروسته درته ولیږل شي.') +
    helpBlock('مرستې لپاره:', helpUrl),
  /** Consultation cancelled (reason is a fixed Pashto label — never staff notes). */
  consultationCancelled: (d: { name: string | null; sex: 'MALE' | 'FEMALE' | null; reason: string; helpUrl: string | null }) =>
    `${d.sex === 'MALE' ? 'محترم' : d.sex === 'FEMALE' ? 'محترمه' : 'محترم/محترمه'}${d.name ? ` ${d.name}` : ''}،` +
    '\n\nستاسو د eTabeeb آنلاین مشوره لغوه شوه.\n\n' +
    `د لغوه کېدو لامل: ${d.reason}` +
    helpBlock('که غواړئ بله مشوره وټاکئ یا کومه پوښتنه لرئ:', d.helpUrl),
  /** Caption of the prescription image (first page): ready + optional voice note + help. */
  prescriptionImageCaption: (d: { withVoice: boolean; pages: number; helpUrl: string | null }) =>
    'ستاسو د نن ورځې د طبي مشورې نسخه چمتو شوه.' +
    (d.pages > 1 ? ` (۱/${toPashtoDigits(d.pages)})` : '') +
    (d.withVoice ? '\n\nد ډاکټر د لارښوونو غږیز پیغام هم درته استول کېږي.' : '') +
    helpBlock('که د نسخې یا درملو په اړه کومه پوښتنه لرئ:', d.helpUrl),
  /** MESSAGE 5 — prescription delivery (the document itself is attached by the sender). */
  prescriptionReady: 'ستاسو نسخه چمتو ده او له دې پیغام سره درلېږل کېږي. د ښه روغتیا هیله لرو.',
} as const

const toPashtoDigits = (n: number) => String(n).replace(/[0-9]/g, (d) => '۰۱۲۳۴۵۶۷۸۹'[Number(d)]!)

/** Short help line + clean help link on its own line; omitted when no representative is configured. */
function helpBlock(label: string, helpUrl: string | null): string {
  return helpUrl ? `\n\n${label}\n${helpUrl}` : ''
}

/** Patient-safe Pashto label for each cancellation reason code. */
export const CANCELLATION_REASON_PS: Readonly<Record<string, string>> = {
  PATIENT_REQUESTED: 'ستاسو د غوښتنې له مخې',
  DOCTOR_UNAVAILABLE: 'ډاکټر په دې وخت کې شتون نه لري',
  PATIENT_UNREACHABLE: 'له تاسو سره اړیکه ونه شوه',
  PAYMENT_ISSUE: 'د فیس د ورکړې ستونزه',
  SCHEDULING_PROBLEM: 'د وخت ټاکلو ستونزه',
  DUPLICATE_REQUEST: 'دا غوښتنه دوه ځله ثبت شوې وه',
  TEST_CASE: 'دا د ازموینې غوښتنه وه',
  OTHER: 'اداري لامل',
}

/** Format a consultation time for patients, e.g. "2026-10-05 14:30 (د پاکستان وخت)". */
export function formatConsultationTimePs(date: Date): string {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: CLINIC_TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(date)
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? ''
  return `${get('year')}-${get('month')}-${get('day')} ${get('hour')}:${get('minute')} (د پاکستان وخت)`
}

/** Pashto section labels for the plain-text prescription (doctor content is inserted as written). */
export const PRESCRIPTION_LABELS_PS = {
  number: 'د نسخې شمېره',
  diagnosis: 'تشخیص',
  medicines: 'درمل',
  days: 'ورځې',
  investigations: 'معاینات',
  advice: 'مشورې',
  followUp: 'بیا کتنه',
  notes: 'یادښت',
} as const

export interface PrescriptionTextInput {
  number: string
  diagnosis?: string | null
  investigations?: string | null
  advice?: string | null
  followUp?: string | null
  notes?: string | null
  items: Array<{
    genericName: string
    strength?: string | null
    formulation?: string | null
    dose: string
    frequency: string
    timing?: string | null
    durationDays?: number | null
    patientInstructions?: string | null
  }>
}

/** Full plain-text prescription message (Pashto frame + doctor-entered content). */
export function formatPrescriptionTextPs(rx: PrescriptionTextInput): string {
  const L = PRESCRIPTION_LABELS_PS
  const lines: string[] = [PATIENT_MESSAGES_PS.prescriptionReady, '', `${L.number}: ${rx.number}`]
  if (rx.diagnosis) lines.push(`${L.diagnosis}: ${rx.diagnosis}`)
  lines.push(`${L.medicines}:`)
  rx.items.forEach((i, n) => {
    const name = [i.genericName, i.strength, i.formulation].filter(Boolean).join(' ')
    const how = [i.dose, i.frequency, i.timing].filter(Boolean).join(' | ')
    lines.push(`${n + 1}. ${name} - ${how}${i.durationDays ? ` | ${i.durationDays} ${L.days}` : ''}`)
    if (i.patientInstructions) lines.push(`   ${i.patientInstructions}`)
  })
  if (rx.investigations) lines.push(`${L.investigations}: ${rx.investigations}`)
  if (rx.advice) lines.push(`${L.advice}: ${rx.advice}`)
  if (rx.followUp) lines.push(`${L.followUp}: ${rx.followUp}`)
  if (rx.notes) lines.push(`${L.notes}: ${rx.notes}`)
  return lines.join('\n').slice(0, 4000)
}
