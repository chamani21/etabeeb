import { redirect } from 'next/navigation'

// Retired placeholder (appointment-era mock with a fake video area). V1 video
// consultations are opened from the doctor case page (/doctor/cases/[id]).
export default function LegacyDoctorConsultation() {
  redirect('/doctor/cases')
}
