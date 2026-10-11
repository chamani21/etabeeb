/**
 * Patient-facing handover notices (Pashto). Truthful about the current state,
 * no response-time promise, no staff phone numbers, at most one per transition.
 * A pending doctor request sends NO notice (the doctor has not joined yet).
 */
export const HANDOVER_NOTICES_PS = {
  /** BOT → ADMIN */
  staffJoined: '👤 د eTabeeb همکار اوس په دې چټ کې دی.\n\nخپلې پوښتنې همدلته ولیکئ؛ ځواب به همدلته درکړل شي.',
  /** ADMIN → DOCTOR (after the doctor accepted) */
  doctorJoined: '👨‍⚕️ ډاکټر صاحب اوس ستاسو خبرې اترې ګوري.\n\nخپلې پوښتنې همدلته ولیکئ.',
  /** DOCTOR → ADMIN */
  backToStaff: '👤 ستاسو خبرې اترې بېرته د eTabeeb همکار ته وسپارل شوې.\n\nهمدلته به درسره اړیکه ونیول شي.',
} as const
