import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { redirect } from 'next/navigation'
import { db } from '@etabeeb/db'
import { appointments, practitioners, patients, users, inAppNotifications } from '@etabeeb/db/schema'
import { eq, and, gte, lt, desc, count } from 'drizzle-orm'
import Link from 'next/link'

export default async function DoctorDashboard({
  params,
}: {
  params: Promise<{ locale: string }>
}) {
  const { locale } = await params
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) redirect(`/${locale}/login`)
  if (session.user.role !== 'practitioner' && session.user.role !== 'administrator') {
    redirect(`/${locale}/patient/dashboard`)
  }

  // Get practitioner record
  const [practitioner] = await db
    .select()
    .from(practitioners)
    .where(eq(practitioners.userId, session.user.id))
    .limit(1)

  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const tomorrow = new Date(today)
  tomorrow.setDate(tomorrow.getDate() + 1)

  let todayAppointments: any[] = []
  let stats = { total: 0, waiting: 0, completed: 0, cancelled: 0 }
  let notifications: any[] = []

  if (practitioner) {
    // Today's appointments
    todayAppointments = await db
      .select({
        id: appointments.id,
        publicId: appointments.publicId,
        slotStart: appointments.slotStart,
        slotEnd: appointments.slotEnd,
        status: appointments.status,
        consultationType: appointments.consultationType,
        chiefComplaint: appointments.chiefComplaint,
        patientDisplayName: users.displayName,
        patientPhone: users.phoneE164,
      })
      .from(appointments)
      .leftJoin(users, eq(appointments.patientUserId, users.id))
      .where(
        and(
          eq(appointments.practitionerId, practitioner.id),
          gte(appointments.slotStart, today),
          lt(appointments.slotStart, tomorrow),
        )
      )
      .orderBy(appointments.slotStart)

    const allToday = todayAppointments
    stats = {
      total: allToday.length,
      waiting: allToday.filter(a => ['confirmed', 'checked_in'].includes(a.status)).length,
      completed: allToday.filter(a => a.status === 'completed').length,
      cancelled: allToday.filter(a => a.status === 'cancelled').length,
    }

    // Unread notifications
    notifications = await db
      .select()
      .from(inAppNotifications)
      .where(
        and(
          eq(inAppNotifications.userId, session.user.id),
          eq(inAppNotifications.isRead, false),
        )
      )
      .orderBy(desc(inAppNotifications.createdAt))
      .limit(5)
  }

  const formatTime = (d: Date | null | undefined) => {
    if (!d) return ''
    return new Date(d).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  }

  const statusColor = (s: string) => {
    switch (s) {
      case 'confirmed': return 'bg-green-100 text-green-700'
      case 'in_progress': return 'bg-purple-100 text-purple-700'
      case 'completed': return 'bg-blue-100 text-blue-700'
      case 'cancelled': return 'bg-red-100 text-red-700'
      default: return 'bg-yellow-100 text-yellow-700'
    }
  }

  if (!practitioner) {
    return (
      <div className="max-w-lg mx-auto mt-12 text-center">
        <div className="bg-yellow-50 border border-yellow-200 rounded-xl p-6">
          <h2 className="text-lg font-bold text-yellow-800 mb-2">
            {locale === 'ps' ? 'د ډاکټر معلومات نشته' : 'Doctor Profile Not Found'}
          </h2>
          <p className="text-yellow-700 text-sm">
            {locale === 'ps'
              ? 'ستاسو حساب د ډاکټر سره تړاو نلري. مهرباني وکړئ د اډمین سره اړیکه ونیسئ.'
              : 'Your account is not linked to a doctor profile. Please contact an administrator.'}
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-[#00523a]">
          {locale === 'ps' ? 'د نن ورځ لنډیز' : locale === 'ur' ? 'آج کا خلاصہ' : "Today's Overview"}
        </h1>
        <p className="text-sm text-gray-500">{new Date().toLocaleDateString([], { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}</p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: locale === 'ps' ? 'ټول وختونه' : 'Total Appts', value: stats.total },
          { label: locale === 'ps' ? 'انتظار کوي' : 'Waiting', value: stats.waiting },
          { label: locale === 'ps' ? 'بشپړ شوي' : 'Completed', value: stats.completed },
          { label: locale === 'ps' ? 'لغوه شوي' : 'Cancelled', value: stats.cancelled },
        ].map((s, i) => (
          <div key={i} className="bg-white p-4 rounded-xl shadow-sm border border-gray-100">
            <div className="text-gray-500 text-xs font-medium">{s.label}</div>
            <div className="text-3xl font-bold text-[#006d4e] mt-1">{s.value}</div>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Patient Queue */}
        <div className="lg:col-span-2 bg-white rounded-xl shadow-sm border border-gray-100 p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xl font-semibold text-[#00523a]">
              {locale === 'ps' ? 'د ناروغانو لیست' : locale === 'ur' ? 'مریضوں کی قطار' : "Patient Queue"}
            </h2>
            <Link href={`/${locale}/doctor/appointments`} className="text-xs text-[#006d4e] hover:underline">
              {locale === 'ps' ? 'ټول وګورئ' : 'View all'}
            </Link>
          </div>

          {todayAppointments.length === 0 ? (
            <div className="text-center py-8 text-gray-500">
              <svg className="w-12 h-12 mx-auto mb-3 text-gray-300" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
              <p className="text-sm">
                {locale === 'ps' ? 'نن ورځ هیڅ وخت نشته' : 'No appointments today'}
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {todayAppointments.map(appt => (
                <div key={appt.id} className="flex flex-col sm:flex-row items-start sm:items-center justify-between p-4 border rounded-lg bg-[#e6fff6]/30">
                  <div>
                    <div className="flex items-center gap-2">
                      <div className="font-semibold text-sm">{appt.patientDisplayName || 'Patient'}</div>
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${statusColor(appt.status)}`}>
                        {appt.status}
                      </span>
                    </div>
                    <div className="text-xs text-gray-600 mt-0.5">
                      {formatTime(appt.slotStart)} · {appt.consultationType}
                      {appt.chiefComplaint ? ` · ${appt.chiefComplaint}` : ''}
                    </div>
                  </div>
                  <div className="flex gap-2 mt-2 sm:mt-0">
                    <Link
                      href={`/${locale}/doctor/consultation/${appt.publicId}`}
                      className="px-3 py-1.5 text-xs bg-[#006d4e] text-white rounded-md hover:bg-[#00523a] transition"
                    >
                      {locale === 'ps' ? 'کنسلټیشن پیل' : 'Start Consultation'}
                    </Link>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Notifications */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
          <h2 className="text-xl font-semibold mb-4 text-[#00523a]">
            {locale === 'ps' ? 'خبرتیاوې' : locale === 'ur' ? 'اطلاعات' : 'Notifications'}
          </h2>
          {notifications.length === 0 ? (
            <p className="text-sm text-gray-500 text-center py-4">
              {locale === 'ps' ? 'هیڅ نوې خبرتیا نشته' : 'No new notifications'}
            </p>
          ) : (
            <ul className="space-y-3">
              {notifications.map(n => (
                <li key={n.id} className="text-sm p-3 bg-gray-50 rounded-lg border-l-4 border-[#006d4e]">
                  {n.body || n.title}
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  )
}
