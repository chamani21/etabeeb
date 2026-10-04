/**
 * eTabib V1 staff-facing WhatsApp messages (admin + Dr. Jalaluddin).
 *
 * Staff messages are internal and not subject to the Pashto-only patient rule.
 * Kept short and limited to what staff need to act; the full case is read in
 * the authenticated app, never copied into WhatsApp.
 */
import { CLINIC_TIMEZONE } from './config'

export function clinicTime(iso: string | null | undefined): string {
  if (!iso) return 'not set'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return 'not set'
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: CLINIC_TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(d)
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? ''
  return `${get('year')}-${get('month')}-${get('day')} ${get('hour')}:${get('minute')} (Pakistan time)`
}

const val = (v: unknown): string => (v === null || v === undefined || v === '' ? '-' : String(v))

export { CANCELLATION_REASON_LABELS } from './cancellation'

const ref = (id: string) => `Ref: ${id.slice(0, 8)}`

/**
 * Lock-screen safe: names, demographics and times only. Complaint, history,
 * documents, notes and prescriptions stay in the authenticated app.
 */
export const STAFF_MESSAGES = {
  adminNewCase: (d: { consultationId: string; patientName: string | null; patientPhone: string | null; chatUrl: string | null; caseUrl: string }) =>
    `eTabeeb — New consultation request\n\nPatient: ${val(d.patientName)}\nPhone: ${val(d.patientPhone)}\n` +
    (d.chatUrl ? `\n💬 Chat with patient\n${d.chatUrl}\n` : '') +
    `\n📋 Open intake form\n${d.caseUrl}\n\n${ref(d.consultationId)}`,
  doctorApprovalRequest: (d: {
    consultationId: string
    patientName: string | null
    age: number | null
    sex: string | null
    location: string | null
    proposedConsultationTime: string | null
    caseUrl: string
  }) =>
    `eTabeeb — Consultation approval required\n\nPatient: ${val(d.patientName)}\nAge/Sex: ${val(d.age)} / ${val(d.sex)}\n` +
    `Location: ${val(d.location)}\nProposed time: ${clinicTime(d.proposedConsultationTime)}\n\n🩺 Review & approve\n${d.caseUrl}\n\n` +
    `Clinical details are available securely in the doctor dashboard.\n${ref(d.consultationId)}`,
  doctorConfirmed: (d: { consultationId: string; patientName: string | null; approvedTime: string | null; caseUrl: string }) =>
    `eTabeeb — Consultation confirmed\n\nPatient: ${val(d.patientName)}\nTime: ${clinicTime(d.approvedTime)}\n\n` +
    `🎥 Open case & join video\n${d.caseUrl}\n\n${ref(d.consultationId)}`,
  adminCancelledByDoctor: (d: { consultationId: string; patientName: string | null; scheduledTime: string | null; reason: string; caseUrl: string }) =>
    `eTabeeb — Consultation cancelled by doctor\n\nPatient: ${val(d.patientName)}\nScheduled time: ${clinicTime(d.scheduledTime)}\n` +
    `Reason: ${d.reason}\n\n📋 Open case\n${d.caseUrl}\n\n${ref(d.consultationId)}`,
  doctorCancelled: (d: { consultationId: string; patientName: string | null; scheduledTime: string | null; caseUrl: string }) =>
    `eTabeeb — Consultation cancelled\n\nPatient: ${val(d.patientName)}\nScheduled time: ${clinicTime(d.scheduledTime)}\n\n` +
    `View case\n${d.caseUrl}\n\n${ref(d.consultationId)}`,
} as const
