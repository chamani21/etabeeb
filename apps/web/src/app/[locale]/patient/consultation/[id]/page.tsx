import { redirect } from 'next/navigation'

// Retired placeholder (appointment-era mock with a fake video area). V1 patients
// join through the secure link sent on WhatsApp (/consult/<token>).
export default function LegacyPatientConsultation() {
  redirect('/')
}
