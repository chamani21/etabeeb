import { redirect } from 'next/navigation'

// The V1 admin home is the consultation queue.
export default function AdminDashboard() {
  redirect('/admin/cases')
}
