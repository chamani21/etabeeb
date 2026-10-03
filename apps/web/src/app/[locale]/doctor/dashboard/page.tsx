import { redirect } from 'next/navigation'

// The V1 doctor home is the consultation list.
export default function DoctorDashboard() {
  redirect('/doctor/cases')
}
