/**
 * Patient-facing handover notices (Pashto). Truthful about the current state,
 * no response-time promise, no staff phone numbers, at most one per transition.
 * A pending doctor request sends NO notice (the doctor has not joined yet).
 */
export const HANDOVER_NOTICES_PS = {
  /** BOT → ADMIN */
  staffJoined: 'ستاسو پیغام د eTabeeb همکار ته ورسېد. ستاسو پوښتنو ته به همدلته ځواب درکړل شي.',
  /** ADMIN → DOCTOR (after the doctor accepted) */
  doctorJoined: 'اوس ډاکټر صاحب ستاسو خبرې اترې ګوري. خپلې پوښتنې همدلته ولیکئ.',
  /** DOCTOR → ADMIN */
  backToStaff: 'ستاسو خبرې اترې بېرته د eTabeeb همکار ته وسپارل شوې. همدلته به درسره اړیکه ونیول شي.',
} as const
