/**
 * eTabib V1 patient-facing messages — PASHTO ONLY.
 *
 * Every automated patient message is defined here. Route handlers and
 * services must not contain inline patient-facing text.
 */

/** Number examples for both countries (spaces are only for reading; any format is accepted). */
const PHONE_EXAMPLES_PS =
  '\n\nد پاکستان بېلګه:\n0300 0000000\nیا\n+92 300 0000000\n\nد افغانستان بېلګه:\n070 000 0000\nیا\n+93 70 000 0000'

/**
 * WhatsApp formatting standard (patient messages): short paragraphs, *single
 * asterisks* for bold, 1–4 meaningful emojis, 🇵🇰/🇦🇫 for the two local times,
 * "eTabeeb" as the brand. With the shared inbox the patient's help channel is THIS
 * chat (the one eTabeeb number), so messages say "write here" instead of linking
 * to another number. No message promises an immediate reply or a fixed time.
 */
const REPLY_HERE = 'که پوښتنه لرئ، همدې چټ ته پیغام ولیکئ.'

export const PATIENT_MESSAGES_PS = {
  /** MESSAGE 1 — first contact: welcome + ask for the patient's name only. */
  askName: 'السلام علیکم 👋\n\n*eTabeeb* ته ښه راغلاست.\n\nد آنلاین طبي مشورې د پیل لپاره، مهرباني وکړئ د ناروغ نوم ولیکئ.',
  /** Name was not usable (empty, digits only, media, …). */
  invalidName: 'بښنه غواړو 🙏 نوم مو سم ترلاسه نه شو.\n\nمهرباني وکړئ یوازې د ناروغ نوم ولیکئ، لکه: احمد خان',
  /** Legacy (the WhatsApp number is now the patient phone; not asked any more). */
  askPhone: (name: string) =>
    `مننه ${name}.\n\nاوس مهرباني وکړئ د اړیکې لپاره د ناروغ د موبایل شمېره ولیکئ.` + PHONE_EXAMPLES_PS,
  /** Legacy (see askPhone). */
  invalidPhone: 'بښنه غواړو، دا شمېره سمه نه ده. مهرباني وکړئ د پاکستان یا افغانستان د موبایل سمه شمېره ولیکئ.' + PHONE_EXAMPLES_PS,
  /** MESSAGE 2 — name received: request registered (the ONE acknowledgement); staff continue in this chat. */
  acknowledged: (name: string | null) =>
    `مننه${name ? `، ${name}` : ''} ✅\n\nستاسو د آنلاین مشورې غوښتنه ثبت شوه.\n\n` +
    'د eTabeeb همکار به د همدې WhatsApp چټ له لارې له تاسو سره اړیکه ونیسي او د مشورې راتلونکی ګام به درته وښيي.',
  /** Patient writes again at a later stage (sent at most once per stage). */
  caseInProgress: '✅ ستاسو غوښتنه ثبت او زموږ همکار ته ولېږل شوه.\n\nراتلونکی پیغام به همدلته ترلاسه کړئ.',
  /** MESSAGE 3 — confirmed by Dr. Jalaluddin: both local times, secure eTabeeb link (never a raw video token). */
  consultationConfirmed: (timeBlock: string, link: string | null) =>
    '✅ *ستاسو آنلاین طبي مشوره تایید شوه*\n\n👨‍⚕️ ډاکټر: ډاکټر جلال الدین\n\n' +
    `${timeBlock}\n\n` +
    (link ? `کله چې د مشورې وخت راورسیږي، لاندې لینک کېکاږئ:\n\n🎥 *مشوره پیل کړئ*\n${link}` : '🎥 د مشورې لینک به وروسته همدلته درته ولېږل شي.') +
    `\n\n${REPLY_HERE}`,
  /** Consultation cancelled (reason is a fixed Pashto label — never staff notes). */
  consultationCancelled: (d: { reason: string }) =>
    `❌ *ستاسو آنلاین مشوره لغوه شوه.*\n\nلامل: ${d.reason}\n\n` +
    'که غواړئ بله مشوره واخلئ یا له همکار سره خبرې وکړئ، همدې چټ ته پیغام ولیکئ.',
  /** Caption of the prescription image (first page): ready + optional voice note + how to ask (no completion claim). */
  prescriptionImageCaption: (d: { withVoice: boolean; pages: number }) =>
    '💊 *ستاسو نسخه چمتو شوه.*' +
    (d.pages > 1 ? ` (۱/${toPashtoDigits(d.pages)})` : '') +
    '\n\nمهرباني وکړئ درمل د نسخې له لارښوونو سره سم وکاروئ.' +
    (d.withVoice ? '\n\n🔊 د ډاکټر غږیزه لارښوونه هم درته استول کېږي.' : '') +
    '\n\nکه د نسخې په اړه پوښتنه لرئ، همدې چټ ته پیغام ولیکئ.\n\nروغ او جوړ اوسئ 🌿',
  /** Legacy text prescription header (the document itself is attached by the sender). */
  prescriptionReady: '💊 *ستاسو نسخه چمتو شوه.*\n\nمهرباني وکړئ درمل د نسخې له لارښوونو سره سم وکاروئ.\n\nروغ او جوړ اوسئ 🌿',
} as const

const toPashtoDigits = (n: number) => String(n).replace(/[0-9]/g, (d) => '۰۱۲۳۴۵۶۷۸۹'[Number(d)]!)

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
