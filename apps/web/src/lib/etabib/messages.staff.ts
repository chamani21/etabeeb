/**
 * eTabib V1 staff-facing WhatsApp messages (admin + Dr. Jalaluddin).
 *
 * Staff messages are internal and not subject to the Pashto-only patient rule.
 * Kept short and limited to what staff need to act; the full case is read in
 * the authenticated app, never copied into WhatsApp.
 */
import { CLINIC_TIMEZONE } from './config'

function clinicTime(iso: string | null | undefined): string {
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

export const STAFF_MESSAGES = {
  adminNewCase: (d: { consultationId: string; patientName: string | null; patientPhone: string | null }) =>
    `eTabib: new consultation request\nPatient: ${val(d.patientName)}\nPhone: ${val(d.patientPhone)}\nCase: ${d.consultationId}\nPlease complete the intake form.`,
  doctorApprovalRequest: (d: {
    consultationId: string
    patientName: string | null
    age: number | null
    sex: string | null
    location: string | null
    shortComplaint: string | null
    proposedConsultationTime: string | null
  }) =>
    `eTabib: consultation time approval needed\nPatient: ${val(d.patientName)}, ${val(d.age)}, ${val(d.sex)}\nLocation: ${val(d.location)}\nComplaint: ${val(d.shortComplaint)}\nProposed time: ${clinicTime(d.proposedConsultationTime)}\nCase: ${d.consultationId}\nPlease approve or propose another time in the doctor dashboard.`,
  doctorConfirmed: (d: {
    consultationId: string
    patientName: string | null
    approvedTime: string | null
    consultationLink: string | null
  }) =>
    `eTabib: consultation confirmed\nPatient: ${val(d.patientName)}\nTime: ${clinicTime(d.approvedTime)}\nLink: ${d.consultationLink ?? 'to follow'}\nCase: ${d.consultationId}`,
} as const
