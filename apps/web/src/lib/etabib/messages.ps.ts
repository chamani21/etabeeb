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
  acknowledged:
    'مننه! ستاسو معلومات ترلاسه شول.\nزموږ همکار به ډېر ژر له تاسو سره اړیکه ونیسي او پاتې معلومات به درڅخه واخلي.',
  /** Patient writes again while the team handles the case. */
  caseInProgress: 'ستاسو غوښتنه زموږ له ټیم سره ده. مهرباني وکړئ لږ صبر وکړئ، موږ به ژر له تاسو سره اړیکه ونیسو.',
  /** Consultation confirmed by Dr. Jalaluddin. */
  consultationConfirmed: (time: string, link: string | null) =>
    `ستاسو مشوره له ډاکټر جلال الدین سره تایید شوه.\nوخت: ${time}` +
    (link ? `\nد مشورې لینک: ${link}` : '\nد مشورې لینک به وروسته درته ولیږل شي.'),
  /** Prescription delivery (the document itself is attached by the sender). */
  prescriptionReady: 'ستاسو نسخه چمتو ده او له دې پیغام سره درلېږل کېږي. د ښه روغتیا هیله لرو.',
} as const

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
