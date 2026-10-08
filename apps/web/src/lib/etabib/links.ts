/**
 * eTabib V1 — every link placed in WhatsApp messages is built here.
 *
 * All app links derive from the canonical base URL (NEXT_PUBLIC_APP_URL), so
 * staging and production differ only by configuration. Links carry no tokens
 * except the patient's own consultation link, and no clinical data; staff case
 * pages require login and return to the same page afterwards.
 */
import { getAppUrl, getRepresentativeWhatsapp } from './config'

/** Prefilled text a patient sends when the /help redirect opens WhatsApp (Pashto). */
export const REPRESENTATIVE_PREFILL_PS = 'سلام، زه د eTabeeb د آنلاین مشورې په اړه مرسته غواړم.'

/** https://wa.me/<digits>[?text=…] for an E.164 or local-format number; null if unusable. */
export function waMeLink(phone: string | null | undefined, prefill?: string): string | null {
  const digits = (phone ?? '').replace(/\D/g, '')
  if (digits.length < 8 || digits.length > 15) return null
  return `https://wa.me/${digits}${prefill ? `?text=${encodeURIComponent(prefill)}` : ''}`
}

/**
 * Redirect target of /help: the representative's WhatsApp chat (configured
 * number only — never a request-supplied target), with a short Pashto greeting.
 */
export function representativeChatTarget(): string | null {
  return waMeLink(getRepresentativeWhatsapp(), REPRESENTATIVE_PREFILL_PS)
}

function appPath(path: string): string {
  const base = getAppUrl()
  return base ? `${base}${path}` : path
}

/**
 * Clean help link shown to patients (`<app>/help`, redirects server-side to the
 * representative chat). Falls back to the direct wa.me link only when no app
 * URL is configured; null when no representative number exists.
 */
export function representativeHelpUrl(): string | null {
  const target = representativeChatTarget()
  if (!target) return null
  return getAppUrl() ? appPath('/help') : target
}

/** Admin → patient chat: the patient's own WhatsApp chat, no visible prefill. */
export function patientWhatsAppUrl(c: { whatsappPhone: string | null; patientPhone: string | null }): string | null {
  return waMeLink(c.whatsappPhone ?? c.patientPhone)
}

export const adminCaseUrl = (caseId: string) => appPath(`/admin/cases/${caseId}`)
export const doctorCaseUrl = (caseId: string) => appPath(`/doctor/cases/${caseId}`)
/** Shared inbox conversation (authenticated; login returns there). */
export const adminInboxUrl = (conversationId: string) => appPath(`/admin/inbox?c=${conversationId}`)
export const doctorInboxUrl = (conversationId: string) => appPath(`/doctor/inbox?c=${conversationId}`)
/** The patient's secure consultation page (raw token only ever appears here). */
export const consultationUrl = (token: string) => appPath(`/consult/${token}`)
