import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { redirect } from 'next/navigation'
import { db } from '@etabeeb/db'
import { appointments, users, practitioners, patients } from '@etabeeb/db/schema'
import { eq, and, gte, lt, count, sql } from 'drizzle-orm'
import Link from 'next/link'

export default async function AdminDashboard({
  params: { locale },
}: {
  params: { locale: string }
}) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) redirect(`/${locale}/login`)
  if (session.user.role !== 'administrator') redirect(`/${locale}/patient/dashboard`)

  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const tomorrow = new Date(today)
  tomorrow.setDate(tomorrow.getDate() + 1)

  // Aggregate stats
  const [
    todayApptsResult,
    totalDoctorsResult,
    totalPatientsResult,
    totalUsersResult,
  ] = await Promise.all([
    db.select().from(appointments)
      .where(and(gte(appointments.slotStart, today), lt(appointments.slotStart, tomorrow))),
    db.select({ count: sql<number>`count(*)` }).from(practitioners),
    db.select({ count: sql<number>`count(*)` }).from(patients),
    db.select({ count: sql<number>`count(*)` }).from(users),
  ])

  const todayAppts = todayApptsResult
  const stats = [
    { label: locale === 'ps' ? 'د نن وختونه' : "Today's Appointments", value: todayAppts.length },
    { label: locale === 'ps' ? 'فعال ډاکټران' : 'Doctors', value: totalDoctorsResult[0]?.count || 0 },
    { label: locale === 'ps' ? 'ټول ناروغان' : 'Patients', value: totalPatientsResult[0]?.count || 0 },
    { label: locale === 'ps' ? 'بشپړ' : 'Completed Today', value: todayAppts.filter(a => a.status === 'completed').length },
    { label: locale === 'ps' ? 'تصدیق شوي' : 'Confirmed Today', value: todayAppts.filter(a => a.status === 'confirmed').length },
    { label: locale === 'ps' ? 'روان' : 'In Progress', value: todayAppts.filter(a => a.status === 'in_progress').length },
    { label: locale === 'ps' ? 'لغوه' : 'Cancelled Today', value: todayAppts.filter(a => a.status === 'cancelled').length },
    { label: locale === 'ps' ? 'ټول کاروونکي' : 'Total Users', value: totalUsersResult[0]?.count || 0 },
  ]

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      <div>
        <h2 className="text-2xl font-bold text-[#00523a]">
          {locale === 'ps' ? 'ډشبورډ' : 'Dashboard'}
        </h2>
        <p className="text-sm text-gray-500 mt-1">
          {new Date().toLocaleDateString([], { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
        </p>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {stats.map((stat, i) => (
          <div key={i} className="bg-white p-6 rounded-lg shadow-sm border border-gray-100 flex flex-col">
            <span className="text-gray-500 text-sm font-medium">{stat.label}</span>
            <span className="text-3xl font-bold text-[#00523a] mt-2">{stat.value}</span>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mt-6">
        {/* Today's Appointments */}
        <div className="lg:col-span-2 bg-white rounded-lg shadow-sm border border-gray-100 p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold text-gray-800">
              {locale === 'ps' ? 'د نن وختونه' : "Today's Appointments"}
            </h3>
            <Link href={`/${locale}/admin/appointments`} className="text-xs text-[#00523a] hover:underline">
              {locale === 'ps' ? 'ټول وګورئ' : 'View all'}
            </Link>
          </div>
          {todayAppts.length === 0 ? (
            <p className="text-sm text-gray-500 text-center py-6">
              {locale === 'ps' ? 'نن ورځ هیڅ وخت نشته' : 'No appointments today'}
            </p>
          ) : (
            <ul className="space-y-3 divide-y divide-gray-50">
              {todayAppts.slice(0, 5).map(appt => (
                <li key={appt.id} className="flex items-center justify-between pt-3 first:pt-0">
                  <div>
                    <p className="text-sm text-gray-800">
                      {new Date(appt.slotStart!).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </p>
                    <p className="text-xs text-gray-500">{appt.consultationType} · {appt.chiefComplaint || '—'}</p>
                  </div>
                  <span className={`text-xs px-2 py-1 rounded-full font-medium ${
                    appt.status === 'confirmed' ? 'bg-green-100 text-green-700' :
                    appt.status === 'completed' ? 'bg-blue-100 text-blue-700' :
                    appt.status === 'cancelled' ? 'bg-red-100 text-red-700' :
                    'bg-yellow-100 text-yellow-700'
                  }`}>
                    {appt.status}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Quick Actions */}
        <div className="bg-white rounded-lg shadow-sm border border-gray-100 p-6">
          <h3 className="text-lg font-semibold text-gray-800 border-b pb-3 mb-4">
            {locale === 'ps' ? 'ژر عملیاتونه' : 'Quick Actions'}
          </h3>
          <div className="space-y-3">
            <Link
              href={`/${locale}/admin/doctors`}
              className="block w-full bg-[#00523a] hover:bg-[#006d4e] text-white py-2 px-4 rounded text-sm text-center transition"
            >
              {locale === 'ps' ? 'ډاکټر زیاتول' : 'Add Doctor'}
            </Link>
            <Link
              href={`/${locale}/admin/appointments`}
              className="block w-full border border-[#00523a] text-[#00523a] hover:bg-[#e6fff6] py-2 px-4 rounded text-sm text-center transition"
            >
              {locale === 'ps' ? 'لاسي بکینګ' : 'Manual Booking'}
            </Link>
            <Link
              href={`/${locale}/admin/audit`}
              className="block w-full border border-gray-200 text-gray-600 hover:bg-gray-50 py-2 px-4 rounded text-sm text-center transition"
            >
              {locale === 'ps' ? 'د آډیټ لاګ' : 'View Audit Log'}
            </Link>
          </div>
        </div>
      </div>
    </div>
  )
}
