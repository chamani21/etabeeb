import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { redirect } from 'next/navigation'
import { db } from '@etabeeb/db'
import { appointments, practitioners, prescriptions, users } from '@etabeeb/db/schema'
import { eq, and, gte, desc, lt } from 'drizzle-orm'
import Link from 'next/link'

export default async function PatientDashboard({
  params,
}: {
  params: Promise<{ locale: string }>
}) {
  const { locale } = await params
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) {
    redirect(`/${locale}/login`)
  }

  const userId = session.user.id
  const displayName = session.user.displayName || session.user.phone || 'Patient'
  const now = new Date()

  // Fetch next upcoming appointment
  const [nextAppt] = await db
    .select({
      id: appointments.id,
      publicId: appointments.publicId,
      slotStart: appointments.slotStart,
      slotEnd: appointments.slotEnd,
      status: appointments.status,
      consultationType: appointments.consultationType,
      practitionerDisplayName: practitioners.displayName,
      practitionerSpecialty: practitioners.specialty,
    })
    .from(appointments)
    .leftJoin(practitioners, eq(appointments.practitionerId, practitioners.id))
    .where(
      and(
        eq(appointments.patientUserId, userId),
        gte(appointments.slotStart, now),
        eq(appointments.status, 'confirmed'),
      )
    )
    .orderBy(appointments.slotStart)
    .limit(1)

  // Fetch recent prescriptions
  const recentPrescriptions = await db
    .select({
      id: prescriptions.publicId,
      status: prescriptions.status,
      createdAt: prescriptions.createdAt,
      signedAt: prescriptions.signedAt,
      prescriberName: users.displayName,
    })
    .from(prescriptions)
    .leftJoin(users, eq(prescriptions.prescribedBy, users.id))
    .where(eq(prescriptions.prescribedForUserId, userId))
    .orderBy(desc(prescriptions.createdAt))
    .limit(3)

  const formatDateTime = (d: Date | null | undefined) => {
    if (!d) return ''
    return new Date(d).toLocaleString(locale === 'ps' ? 'ps-AF' : locale === 'ur' ? 'ur-PK' : 'en-PK', {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    })
  }

  return (
    <>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-[#05201a]">
          {locale === 'ps'
            ? `ښه راغلاست، ${displayName}!`
            : locale === 'ur'
            ? `خوش آمدید، ${displayName}!`
            : `Welcome back, ${displayName}!`}
        </h1>
        <p className="text-[#5D6F69] mt-1">
          {locale === 'ps' ? 'ستاسو روغتیایي لنډیز' : locale === 'ur' ? 'آپ کا صحت خلاصہ' : 'Your health summary'}
        </p>
      </div>

      {/* Next Appointment */}
      <div className="bg-white rounded-xl shadow-sm border border-[#DDE7E2] p-4 mb-4">
        <h2 className="text-lg font-bold text-[#00523a] mb-3">
          {locale === 'ps' ? 'راتلونکی وخت' : locale === 'ur' ? 'اگلی ملاقات' : 'Next Appointment'}
        </h2>
        {nextAppt ? (
          <>
            <div className="flex gap-4 items-center">
              <div className="w-12 h-12 bg-[#006d4e] text-white rounded-full flex items-center justify-center font-bold text-xl flex-shrink-0">
                {(nextAppt.practitionerDisplayName?.[0] || 'D')}
              </div>
              <div className="flex-1 min-w-0">
                <h3 className="font-semibold text-[#05201a] truncate">
                  {nextAppt.practitionerDisplayName || 'Doctor'}
                </h3>
                <p className="text-sm text-[#5D6F69]">{nextAppt.practitionerSpecialty}</p>
                <p className="text-sm font-medium mt-1 text-[#006d4e]">
                  {formatDateTime(nextAppt.slotStart)}
                </p>
              </div>
            </div>
            <div className="mt-4 flex gap-2">
              <Link
                href={`/${locale}/patient/consultation/${nextAppt.publicId}`}
                className="flex-1 text-center bg-[#00523a] hover:bg-[#006d4e] text-white py-2 rounded-lg font-medium transition text-sm"
              >
                {locale === 'ps' ? 'ویډیو کنسلټیشن' : locale === 'ur' ? 'ویڈیو کنسلٹیشن' : 'Join Video'}
              </Link>
              <button
                onClick={async () => {}}
                className="flex-1 border border-[#DDE7E2] hover:bg-[#e6fff6] text-[#00523a] py-2 rounded-lg font-medium transition text-sm"
              >
                {locale === 'ps' ? 'لغوه کول' : locale === 'ur' ? 'منسوخ کریں' : 'Cancel'}
              </button>
            </div>
          </>
        ) : (
          <div className="text-center py-6">
            <p className="text-[#5D6F69] text-sm mb-3">
              {locale === 'ps' ? 'هیڅ راتلونکی وخت نشته' : locale === 'ur' ? 'کوئی ملاقات نہیں ہے' : 'No upcoming appointments'}
            </p>
            <Link
              href={`/${locale}/patient/appointments`}
              className="inline-block bg-[#00523a] text-white px-6 py-2 rounded-lg text-sm font-medium hover:bg-[#006d4e] transition"
            >
              {locale === 'ps' ? 'وخت ورکول' : locale === 'ur' ? 'وقت بک کریں' : 'Book Appointment'}
            </Link>
          </div>
        )}
      </div>

      {/* Quick Actions */}
      <div className="bg-white rounded-xl shadow-sm border border-[#DDE7E2] p-4 mb-4">
        <h2 className="text-lg font-bold text-[#00523a] mb-3">
          {locale === 'ps' ? 'ژر لاسرسی' : locale === 'ur' ? 'فوری کارروائی' : 'Quick Actions'}
        </h2>
        <div className="grid grid-cols-2 gap-3">
          <Link
            href={`/${locale}/patient/appointments`}
            className="bg-[#e6fff6] p-3 rounded-lg flex flex-col items-center justify-center text-center gap-2 hover:bg-[#006d4e] hover:text-white transition text-[#00523a] border border-[#00523a]/20"
          >
            <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
            </svg>
            <span className="font-medium text-sm">
              {locale === 'ps' ? 'وختونه' : locale === 'ur' ? 'ملاقاتیں' : 'Appointments'}
            </span>
          </Link>
          <Link
            href={`/${locale}/patient/records`}
            className="bg-[#e6fff6] p-3 rounded-lg flex flex-col items-center justify-center text-center gap-2 hover:bg-[#006d4e] hover:text-white transition text-[#00523a] border border-[#00523a]/20"
          >
            <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
            </svg>
            <span className="font-medium text-sm">
              {locale === 'ps' ? 'رپوټ اپلوډ' : locale === 'ur' ? 'رپورٹ اپلوڈ' : 'Upload Report'}
            </span>
          </Link>
          <Link
            href={`/${locale}/patient/prescriptions`}
            className="bg-[#e6fff6] p-3 rounded-lg flex flex-col items-center justify-center text-center gap-2 hover:bg-[#006d4e] hover:text-white transition text-[#00523a] border border-[#00523a]/20"
          >
            <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
            </svg>
            <span className="font-medium text-sm">
              {locale === 'ps' ? 'نسخې' : locale === 'ur' ? 'نسخے' : 'Prescriptions'}
            </span>
          </Link>
          <Link
            href={`/${locale}/patient/profile`}
            className="bg-[#e6fff6] p-3 rounded-lg flex flex-col items-center justify-center text-center gap-2 hover:bg-[#006d4e] hover:text-white transition text-[#00523a] border border-[#00523a]/20"
          >
            <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
            </svg>
            <span className="font-medium text-sm">
              {locale === 'ps' ? 'زما پروفایل' : locale === 'ur' ? 'میری پروفائل' : 'My Profile'}
            </span>
          </Link>
        </div>
      </div>

      {/* Recent Prescriptions */}
      <div className="bg-white rounded-xl shadow-sm border border-[#DDE7E2] p-4 mb-4">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-lg font-bold text-[#00523a]">
            {locale === 'ps' ? 'وروستي نسخې' : locale === 'ur' ? 'حالیہ نسخے' : 'Recent Prescriptions'}
          </h2>
          <Link href={`/${locale}/patient/prescriptions`} className="text-xs text-[#00523a] hover:underline">
            {locale === 'ps' ? 'ټولې وګورئ' : 'View all'}
          </Link>
        </div>
        <div className="space-y-3">
          {recentPrescriptions.length === 0 ? (
            <p className="text-[#5D6F69] text-sm text-center py-4">
              {locale === 'ps' ? 'هیڅ نسخه نشته' : locale === 'ur' ? 'کوئی نسخہ نہیں' : 'No prescriptions yet'}
            </p>
          ) : recentPrescriptions.map(rx => (
            <div key={rx.id} className="flex items-center justify-between p-3 border border-[#DDE7E2] rounded-lg">
              <div>
                <h3 className="font-medium text-[#05201a] text-sm">
                  {locale === 'ps' ? 'نسخه' : 'Prescription'} #{rx.id?.toString().slice(-6)}
                </h3>
                <p className="text-xs text-[#5D6F69]">
                  {rx.prescriberName || 'Doctor'} · {rx.createdAt ? new Date(rx.createdAt).toLocaleDateString() : ''}
                </p>
              </div>
              <span className={`text-xs px-2 py-1 rounded-full font-medium ${
                rx.status === 'active' ? 'bg-green-100 text-green-700' :
                rx.status === 'expired' ? 'bg-gray-100 text-gray-600' :
                'bg-yellow-100 text-yellow-700'
              }`}>
                {rx.status}
              </span>
            </div>
          ))}
        </div>
      </div>
    </>
  )
}
