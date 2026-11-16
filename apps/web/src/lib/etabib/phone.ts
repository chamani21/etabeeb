/**
 * Phone number normalization for Pakistan / Afghanistan patients.
 * Returns E.164 (+923001234567) or null when the input is not a plausible number.
 */

// Pashto/Dari (Extended Arabic-Indic) and Arabic-Indic digits → ASCII
const DIGIT_MAP: Record<string, string> = {}
'۰۱۲۳۴۵۶۷۸۹'.split('').forEach((d, i) => (DIGIT_MAP[d] = String(i)))
'٠١٢٣٤٥٦٧٨٩'.split('').forEach((d, i) => (DIGIT_MAP[d] = String(i)))

export function toAsciiDigits(input: string): string {
  return input.replace(/[۰-۹٠-٩]/g, (d) => DIGIT_MAP[d] ?? d)
}

export function normalizePhone(raw: string): string | null {
  const ascii = toAsciiDigits(raw).trim()
  // Allow only digits and common separators
  if (!/^[+\d\s\-().]+$/.test(ascii)) return null
  let digits = ascii.replace(/[\s\-().]/g, '')
  const hasPlus = digits.startsWith('+')
  digits = digits.replace(/^\+/, '')
  if (!/^\d+$/.test(digits)) return null

  if (!hasPlus && digits.startsWith('00')) digits = digits.slice(2)
  else if (!hasPlus && /^03\d{9}$/.test(digits)) digits = `92${digits.slice(1)}` // PK mobile 03XXXXXXXXX
  else if (!hasPlus && /^07\d{8}$/.test(digits)) digits = `93${digits.slice(1)}` // AF mobile 07XXXXXXXX

  if (digits.startsWith('92')) return /^923\d{9}$/.test(digits) ? `+${digits}` : null
  if (digits.startsWith('93')) return /^937\d{8}$/.test(digits) ? `+${digits}` : null
  // Other international numbers: generic E.164 length bounds
  if (/^[1-9]\d{9,14}$/.test(digits) && (hasPlus || ascii.startsWith('00'))) return `+${digits}`
  return null
}

/** Normalize a WhatsApp wa_id (digits, no plus) to E.164. */
export function waIdToE164(waId: string): string | null {
  const digits = waId.replace(/\D/g, '')
  return /^[1-9]\d{7,14}$/.test(digits) ? `+${digits}` : null
}
