/**
 * eTabib V1 patient-facing messages — PASHTO ONLY.
 *
 * Every automated patient message is defined here. Route handlers and
 * services must not contain inline patient-facing text.
 */
import { CLINIC_TIMEZONE } from './config'

export const PATIENT_MESSAGES_PS = {
  /** First contact: welcome + ask for the patient's name. */
  askName:
    'السلام علیکم! ای طبیب ته ښه راغلاست.\n' +
    'د ډاکټر جلال الدین سره د آنلاین مشورې لپاره، مهرباني وکړئ د ناروغ بشپړ نوم ولیکئ.',
  /** Name was not usable (empty, digits only, media, …). */
  invalidName: 'بښنه غواړو، نوم مو سم ترلاسه نه شو. مهرباني وکړئ یوازې د ناروغ نوم په لیکلو سره راولیږئ.',
  /** After the name: ask for a contact phone number. */
  askPhone: (name: string) =>
    `مننه ${name}.\nاوس مهرباني وکړئ د اړیکې د تلیفون شمېره ولیکئ (لکه 03001234567 یا 0701234567).`,
  /** Phone was not a valid number. */
  invalidPhone:
    'بښنه غواړو، دا شمېره سمه نه ده. مهرباني وکړئ سمه د تلیفون شمېره ولیکئ، لکه 03001234567 یا 0701234567.',
  /** Name + phone received: automated questions stop here. */
  acknowledged: (helpUrl: string | null) =>
    'مننه! ستاسو د آنلاین مشورې غوښتنه ثبت شوه.\n\n' +
    'زموږ استازی به ستاسو معلومات وګوري او د راتلونکو مرحلو په اړه به له تاسو سره اړیکه ونیسي.' +
    helpLine(helpUrl, 'کولی شئ'),
  /** Patient writes again while the team handles the case. */
  caseInProgress: (helpUrl: string | null) =>
    'ستاسو غوښتنه زموږ له ټیم سره ده. مهرباني وکړئ لږ صبر وکړئ، موږ به ژر له تاسو سره اړیکه ونیسو.' +
    helpLine(helpUrl, 'کولی شئ'),
  /** Consultation confirmed by Dr. Jalaluddin (secure eTabeeb link; never a raw video token). */
  consultationConfirmed: (time: string, link: string | null, helpUrl: string | null = null) =>
    `ستاسو مشوره له ډاکټر جلال الدین سره تایید شوه.\n\nوخت: ${time}\n\n` +
    (link
      ? `د آنلاین مشورې لپاره لاندې خوندي لینک خلاص کړئ:\n${link}`
      : 'د مشورې لینک به وروسته درته ولیږل شي.') +
    helpLine(helpUrl, 'وکړئ'),
  /** Consultation cancelled (reason is a fixed Pashto label — never staff notes). */
  consultationCancelled: (d: { name: string | null; sex: 'MALE' | 'FEMALE' | null; reason: string; helpUrl: string | null }) =>
    `${d.sex === 'MALE' ? 'محترم' : d.sex === 'FEMALE' ? 'محترمه' : 'محترم/محترمه'} ${d.name ?? ''}،`.replace(' ،', '،') +
    '\n\nستاسو د eTabeeb آنلاین مشوره لغوه شوه.\n\n' +
    `د لغوه کېدو لامل: ${d.reason}` +
    (d.helpUrl
      ? `\n\nکه غواړئ بله مشوره وټاکئ یا کومه پوښتنه لرئ، زموږ له استازي سره دلته خبرې وکړئ:\n${d.helpUrl}`
      : ''),
  /** Prescription delivery (the document itself is attached by the sender). */
  prescriptionReady: 'ستاسو نسخه چمتو ده او له دې پیغام سره درلېږل کېږي. د ښه روغتیا هیله لرو.',
} as const

/** "Talk to our representative" footer; omitted when no representative number is configured. */
function helpLine(helpUrl: string | null, verb: 'کولی شئ' | 'وکړئ'): string {
  if (!helpUrl) return ''
  return `\n\nکه کومه پوښتنه لرئ یا مرستې ته اړتیا لرئ، زموږ له استازي سره دلته خبرې ${verb}:\n${helpUrl}`
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
