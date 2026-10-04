/**
 * eTabib V1 — action links placed in WhatsApp messages.
 *
 * wa.me chat links (patient ↔ representative, admin → patient) and deep links
 * into the authenticated staff app. Links carry no tokens and no clinical data;
 * staff case pages require login and return to the same page afterwards.
 */
import { getAppUrl, getRepresentativeWhatsapp } from './config'

/** Prefilled text a patient sends when tapping the representative link (Pashto). */
export const REPRESENTATIVE_PREFILL_PS = 'سلام، زه د eTabeeb د آنلاین مشورې په اړه مرسته غواړم.'

/** Prefilled text the admin sends when opening a chat with the patient. */
export const ADMIN_TO_PATIENT_PREFILL = 'Hello, this is eTabeeb regarding your online consultation request.'

/** https://wa.me/<digits>[?text=…] for an E.164 or local-format number; null if unusable. */
export function waMeLink(phone: string | null | undefined, prefill?: string): string | null {
  const digits = (phone ?? '').replace(/\D/g, '')
  if (digits.length < 8 || digits.length > 15) return null
  return `https://wa.me/${digits}${prefill ? `?text=${encodeURIComponent(prefill)}` : ''}`
}

/** Chat with eTabeeb's human representative (null when no number is configured). */
export function representativeLink(): string | null {
  return waMeLink(getRepresentativeWhatsapp(), REPRESENTATIVE_PREFILL_PS)
}

function appPath(path: string): string {
  const base = getAppUrl()
  return base ? `${base}${path}` : path
}

export const adminCaseUrl = (caseId: string) => appPath(`/admin/cases/${caseId}`)
export const doctorCaseUrl = (caseId: string) => appPath(`/doctor/cases/${caseId}`)
