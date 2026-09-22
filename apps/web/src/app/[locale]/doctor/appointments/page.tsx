import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { redirect } from 'next/navigation'
import { db } from '@etabeeb/db'
import { appointments, practitioners, users } from '@etabeeb/db/schema'
import { eq, and, gte, lt, desc } from 'drizzle-orm'
import Link from 'next/link'

export default async function DoctorAppointmentsPage({
  params: { locale },
}: {
  params: { locale: string }
}) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) redirect(`/${locale}/login`)
  if (session.user.role !== 'practitioner' && session.user.role !== 'administrator') {
    redirect(`/${locale}/patient/dashboard`)
  }

  const [practitioner] = await db
    .select()
    .from(practitioners)
    .where(eq(practitioners.userId, session.user.id))
    .limit(1)

  let apptList: any[] = []

  if (practitioner) {
    apptList = await db
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
      .where(eq(appointments.practitionerId, practitioner.id))
      .orderBy(desc(appointments.slotStart))
      .limit(100)
  }

  const formatDateTime = (d: Date | null | undefined) => {
    if (!d) return ''
    return new Date(d).toLocaleString([], {
      month: 'short', day: 'numeric',
      hour: '2-digit', minute: '2-digit',
    })
  }

  const statusColor = (s: string) => {
    switch (s) {
      case 'confirmed': return 'bg-green-100 text-green-700'
      case 'in_progress': return 'bg-purple-100 text-purple-700'
      case 'completed': return 'bg-blue-100 text-blue-700'
      case 'cancelled': return 'bg-red-100 text-red-700'
      case 'pending_payment': case 'pending_verification': return 'bg-yellow-100 text-yellow-700'
      default: return 'bg-gray-100 text-gray-600'
    }
  }

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-[#00523a]">
        {locale === 'ps' ? 'وختونه' : locale === 'ur' ? 'ملاقاتیں' : 'Appointments'}
      </h1>

      {apptList.length === 0 ? (
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-12 text-center">
          <p className="text-gray-500">
            {locale === 'ps' ? 'هیڅ وخت نشته' : 'No appointments yet'}
          </p>
        </div>
      ) : (
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-gray-50 border-b">
                <tr>
                  <th className="p-4 font-semibold text-gray-700">{locale === 'ps' ? 'وخت' : 'Time'}</th>
                  <th className="p-4 font-semibold text-gray-700">{locale === 'ps' ? 'ناروغ' : 'Patient'}</th>
                  <th className="p-4 font-semibold text-gray-700">{locale === 'ps' ? 'شکایت' : 'Complaint'}</th>
                  <th className="p-4 font-semibold text-gray-700">{locale === 'ps' ? 'ډول' : 'Type'}</th>
                  <th className="p-4 font-semibold text-gray-700">{locale === 'ps' ? 'حالت' : 'Status'}</th>
                  <th className="p-4 font-semibold text-gray-700 text-right">{locale === 'ps' ? 'عملیې' : 'Actions'}</th>
                </tr>
              </thead>
              <tbody>
                {apptList.map(appt => (
                  <tr key={appt.id} className="border-b last:border-0 hover:bg-gray-50">
                    <td className="p-4 whitespace-nowrap text-xs text-gray-600">{formatDateTime(appt.slotStart)}</td>
                    <td className="p-4 font-medium text-gray-900">{appt.patientDisplayName || '—'}</td>
                    <td className="p-4 text-gray-600 text-xs max-w-[200px] truncate">{appt.chiefComplaint || '—'}</td>
                    <td className="p-4 text-xs">{appt.consultationType}</td>
                    <td className="p-4">
                      <span className={`px-2 py-1 rounded-full text-xs font-medium ${statusColor(appt.status)}`}>
                        {appt.status}
                      </span>
                    </td>
                    <td className="p-4 text-right">
                      {(appt.status === 'confirmed' || appt.status === 'in_progress') && (
                        <Link
                          href={`/${locale}/doctor/consultation/${appt.publicId}`}
                          className="text-sm text-[#006d4e] hover:underline font-medium"
                        >
                          {locale === 'ps' ? 'پیل' : 'Start'}
                        </Link>
                      )}
                      {appt.status === 'completed' && (
                        <Link
                          href={`/${locale}/doctor/consultation/${appt.publicId}`}
                          className="text-sm text-gray-500 hover:underline"
                        >
                          {locale === 'ps' ? 'وګورئ' : 'View'}
                        </Link>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}
