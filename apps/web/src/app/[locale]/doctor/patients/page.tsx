import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { redirect } from 'next/navigation'
import { db } from '@etabeeb/db'
import { practitioners, patients, users, appointments } from '@etabeeb/db/schema'
import { eq, inArray, desc } from 'drizzle-orm'

export default async function DoctorPatientsPage({
  params: { locale },
}: {
  params: { locale: string }
}) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) redirect(`/${locale}/login`)
  if (session.user.role !== 'practitioner' && session.user.role !== 'administrator') {
    redirect(`/${locale}/patient/dashboard`)
  }

  // Get practitioner
  const [practitioner] = await db
    .select()
    .from(practitioners)
    .where(eq(practitioners.userId, session.user.id))
    .limit(1)

  let patientList: any[] = []

  if (practitioner) {
    // Get unique patients from appointments
    const appts = await db
      .select({
        patientUserId: appointments.patientUserId,
        lastSlotStart: appointments.slotStart,
        status: appointments.status,
      })
      .from(appointments)
      .where(eq(appointments.practitionerId, practitioner.id))
      .orderBy(desc(appointments.slotStart))

    // Get unique patient user IDs
    const uniquePatientIds = [...new Set(
      appts
        .map(a => a.patientUserId)
        .filter((id): id is string => id !== null)
    )]

    if (uniquePatientIds.length > 0) {
      const patientUsers = await db
        .select({
          userId: users.id,
          displayName: users.displayName,
          phone: users.phoneE164,
          givenName: patients.givenName,
          familyName: patients.familyName,
          dateOfBirth: patients.dateOfBirth,
          biologicalSex: patients.biologicalSex,
        })
        .from(users)
        .leftJoin(patients, eq(patients.userId, users.id))
        .where(inArray(users.id, uniquePatientIds))

      // Attach last appointment info
      patientList = patientUsers.map(p => ({
        ...p,
        lastVisit: appts.find(a => a.patientUserId === p.userId)?.lastSlotStart,
        visitCount: appts.filter(a => a.patientUserId === p.userId).length,
      }))
    }
  }

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-[#00523a]">
        {locale === 'ps' ? 'زما ناروغان' : locale === 'ur' ? 'میرے مریض' : 'My Patients'}
      </h1>
      <p className="text-sm text-gray-500">
        {locale === 'ps'
          ? `${patientList.length} ناروغان`
          : `${patientList.length} patient${patientList.length !== 1 ? 's' : ''} seen`}
      </p>

      {patientList.length === 0 ? (
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-12 text-center">
          <p className="text-gray-500">
            {locale === 'ps' ? 'هیڅ ناروغ نشته' : 'No patients yet'}
          </p>
        </div>
      ) : (
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Patient</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Phone</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">DOB</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Last Visit</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Visits</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {patientList.map(p => (
                  <tr key={p.userId} className="hover:bg-gray-50">
                    <td className="px-6 py-4">
                      <div className="font-medium text-sm text-gray-900">
                        {p.displayName || `${p.givenName || ''} ${p.familyName || ''}`.trim() || '—'}
                      </div>
                      {p.biologicalSex && (
                        <div className="text-xs text-gray-500">{p.biologicalSex}</div>
                      )}
                    </td>
                    <td className="px-6 py-4 text-sm font-mono text-gray-600">{p.phone || '—'}</td>
                    <td className="px-6 py-4 text-sm text-gray-500">{p.dateOfBirth || '—'}</td>
                    <td className="px-6 py-4 text-sm text-gray-500">
                      {p.lastVisit ? new Date(p.lastVisit).toLocaleDateString() : '—'}
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-500">{p.visitCount}</td>
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
