import { getTranslations, unstable_setRequestLocale } from 'next-intl/server'
import Link from 'next/link'
import { db } from '@etabeeb/db'
import { practitioners, users } from '@etabeeb/db/schema'
import { eq, and } from 'drizzle-orm'

interface HomePageProps {
  params: { locale: string }
}

async function getPublishedDoctors() {
  try {
    const doctors = await db
      .select({
        publicId: practitioners.publicId,
        displayName: practitioners.displayName,
        displayNameUrdu: practitioners.displayNameUrdu,
        displayNamePashto: practitioners.displayNamePashto,
        specialty: practitioners.specialty,
        specialtyUrdu: practitioners.specialtyUrdu,
        specialtyPashto: practitioners.specialtyPashto,
        qualifications: practitioners.qualifications,
        bio: practitioners.bio,
        consultationFee: practitioners.consultationFeeDefaultPkr,
        telemedicineEligible: practitioners.telemedicineEligible,
        photoKey: practitioners.photoKey,
      })
      .from(practitioners)
      .where(
        and(
          eq(practitioners.isPublished, true),
          eq(practitioners.credentialStatus, 'verified'),
        )
      )
      .limit(6)
    return doctors
  } catch {
    return []
  }
}

export default async function HomePage({ params: { locale } }: HomePageProps) {
  unstable_setRequestLocale(locale)
  const t = await getTranslations('home')
  const isRtl = ['ps', 'fa', 'ur'].includes(locale)
  const doctors = await getPublishedDoctors()

  const localeName = (d: typeof doctors[number]) => {
    if (locale === 'ur' && d.displayNameUrdu) return d.displayNameUrdu
    if (locale === 'ps' && d.displayNamePashto) return d.displayNamePashto
    return d.displayName
  }

  const localeSpecialty = (d: typeof doctors[number]) => {
    if (locale === 'ur' && d.specialtyUrdu) return d.specialtyUrdu
    if (locale === 'ps' && d.specialtyPashto) return d.specialtyPashto
    return d.specialty
  }

  return (
    <main className="min-h-screen bg-[#f0faf5]" dir={isRtl ? 'rtl' : 'ltr'}>
      {/* Navigation */}
      <nav className="bg-[#00523a] text-white px-4 py-3 flex items-center justify-between sticky top-0 z-50 shadow-md">
        <div className="font-bold text-xl text-[#D4AF37]">ای طبیب | eTabeeb</div>
        <div className="flex items-center gap-3">
          <Link
            href={`/${locale}/login`}
            className="text-sm px-4 py-1.5 border border-white/40 rounded-full hover:bg-white/10 transition"
          >
            {locale === 'ps' ? 'لاګ ان' : locale === 'ur' ? 'لاگ ان' : 'Log In'}
          </Link>
          <Link
            href={`/${locale}/register`}
            className="text-sm px-4 py-1.5 bg-[#D4AF37] text-[#00523a] rounded-full font-bold hover:bg-yellow-400 transition"
          >
            {locale === 'ps' ? 'ثبت نوم' : locale === 'ur' ? 'رجسٹر' : 'Register'}
          </Link>
        </div>
      </nav>

      {/* Hero Section */}
      <section className="bg-gradient-to-b from-[#00523a] to-[#006d4e] text-white py-16 px-4 text-center">
        <h1 className="text-4xl font-bold mb-4 font-serif">
          {locale === 'ps' ? 'د آنلاین طبي مشورې خدمت' :
           locale === 'ur' ? 'آنلائن طبی مشاورت' :
           locale === 'fa' ? 'مشاوره طبی آنلاین' :
           'Online Medical Consultation'}
        </h1>
        <p className="text-lg text-white/80 mb-8 max-w-2xl mx-auto">
          {locale === 'ps'
            ? 'د کوژک کلینیک د تصدیق شویو متخصصینو سره آنلاین مشوره وکړئ'
            : locale === 'ur'
            ? 'کوژاک کلینک کے تصدیق شدہ ماہرین کے ساتھ آن لائن مشاورت کریں'
            : 'Consult with verified specialists from Kozhak Specialist Clinic online'}
        </p>

        {/* Emergency Warning */}
        <div className="inline-flex items-center gap-2 bg-[#ba1a1a]/20 border border-[#ba1a1a]/40 rounded-lg px-4 py-2 text-sm text-red-200 mb-8">
          <svg className="w-4 h-4 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
          </svg>
          <span>
            {locale === 'ps'
              ? 'که ستاسو حالت بیړی وي، سمدلاسه نږدې روغتیایي مرکز ته ولاړ شئ'
              : 'For emergencies, go to the nearest hospital immediately'}
          </span>
        </div>

        <div className="flex flex-col sm:flex-row gap-3 justify-center">
          <Link
            href={`/${locale}/register`}
            className="inline-block bg-[#D4AF37] text-[#00523a] px-8 py-3 rounded-xl font-bold text-lg hover:bg-yellow-400 transition shadow-lg"
          >
            {locale === 'ps' ? 'وخت ورکول' : locale === 'ur' ? 'وقت بک کریں' : 'Book Appointment'}
          </Link>
          <Link
            href={`/${locale}/login`}
            className="inline-block bg-white/10 text-white border border-white/30 px-8 py-3 rounded-xl font-bold text-lg hover:bg-white/20 transition"
          >
            {locale === 'ps' ? 'زما پورټل' : locale === 'ur' ? 'میرا پورٹل' : 'My Portal'}
          </Link>
        </div>
      </section>

      {/* How It Works */}
      <section className="py-12 px-4 bg-white">
        <div className="max-w-4xl mx-auto">
          <h2 className="text-2xl font-bold text-[#00523a] text-center mb-8">
            {locale === 'ps' ? 'دا سیسټم څنګه کار کوي' :
             locale === 'ur' ? 'یہ کیسے کام کرتا ہے' :
             'How It Works'}
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {[
              {
                step: '01',
                icon: '📋',
                title: locale === 'ps' ? 'ثبت نوم' : locale === 'ur' ? 'رجسٹریشن' : 'Register',
                desc: locale === 'ps' ? 'مفت اکاونټ جوړ کړئ' : locale === 'ur' ? 'مفت اکاؤنٹ بنائیں' : 'Create a free account',
              },
              {
                step: '02',
                icon: '👨‍⚕️',
                title: locale === 'ps' ? 'ډاکټر غوره کړئ' : locale === 'ur' ? 'ڈاکٹر منتخب کریں' : 'Choose Doctor',
                desc: locale === 'ps' ? 'د ځانګړتیا له مخې خپل ډاکټر وګورئ' : 'Browse by specialty',
              },
              {
                step: '03',
                icon: '💊',
                title: locale === 'ps' ? 'مشوره وکړئ' : locale === 'ur' ? 'مشاورت کریں' : 'Consult',
                desc: locale === 'ps' ? 'ویډیو یا اوډیو له لارې مشوره' : 'Video or audio consultation',
              },
            ].map(item => (
              <div key={item.step} className="text-center p-6 rounded-xl border border-[#DDE7E2] bg-[#f0faf5]">
                <div className="text-4xl mb-3">{item.icon}</div>
                <div className="text-[#D4AF37] font-bold text-sm mb-1">Step {item.step}</div>
                <h3 className="font-bold text-[#00523a] text-lg mb-2">{item.title}</h3>
                <p className="text-[#5D6F69] text-sm">{item.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Doctors Section */}
      <section className="py-12 px-4 bg-[#f0faf5]">
        <div className="max-w-5xl mx-auto">
          <div className="flex items-center justify-between mb-8">
            <h2 className="text-2xl font-bold text-[#00523a]">
              {locale === 'ps' ? 'زموږ ډاکټران' : locale === 'ur' ? 'ہمارے ڈاکٹر' : 'Our Doctors'}
            </h2>
          </div>

          {doctors.length === 0 ? (
            <div className="text-center py-12 bg-white rounded-xl border border-[#DDE7E2]">
              <p className="text-[#5D6F69]">
                {locale === 'ps' ? 'اوس مهال هیڅ ډاکټر شتون نلري' : 'No doctors available at this time'}
              </p>
              <p className="text-sm text-[#5D6F69] mt-2">
                {locale === 'ps' ? 'مهرباني وکړئ وروسته بیا راشئ' : 'Please check back soon'}
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {doctors.map(doctor => (
                <div key={doctor.publicId} className="bg-white rounded-xl border border-[#DDE7E2] p-5 hover:shadow-md transition">
                  <div className="flex items-center gap-3 mb-3">
                    {doctor.photoKey ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={doctor.photoKey}
                        alt={localeName(doctor)}
                        width={48}
                        height={48}
                        className="w-12 h-12 rounded-full object-cover bg-[#006d4e]/10 flex-shrink-0"
                        style={{ maxWidth: '48px', maxHeight: '48px' }}
                      />
                    ) : (
                      <div className="w-12 h-12 bg-[#006d4e]/10 text-[#006d4e] rounded-full flex items-center justify-center font-bold text-xl flex-shrink-0">
                        {(localeName(doctor)?.[0] || 'D')}
                      </div>
                    )}
                    <div>
                      <h3 className="font-bold text-[#05201a] text-sm">{localeName(doctor)}</h3>
                      <p className="text-xs text-[#5D6F69]">{localeSpecialty(doctor)}</p>
                    </div>
                  </div>
                  {doctor.qualifications && (
                    <p className="text-xs text-[#5D6F69] mb-3">{doctor.qualifications}</p>
                  )}
                  {doctor.consultationFee && (
                    <p className="text-sm font-semibold text-[#00523a] mb-3">
                      {locale === 'ps' ? 'فیس:' : 'Fee:'} {(doctor.consultationFee / 100).toFixed(0)} PKR
                    </p>
                  )}
                  <Link
                    href={`/${locale}/register`}
                    className="block w-full text-center bg-[#00523a] text-white py-2 rounded-lg text-sm font-medium hover:bg-[#006d4e] transition"
                  >
                    {locale === 'ps' ? 'وخت ورکول' : locale === 'ur' ? 'وقت بک کریں' : 'Book Now'}
                  </Link>
                </div>
              ))}
            </div>
          )}
        </div>
      </section>

      {/* Features */}
      <section className="py-12 px-4 bg-white">
        <div className="max-w-4xl mx-auto">
          <h2 className="text-2xl font-bold text-[#00523a] text-center mb-8">
            {locale === 'ps' ? 'ولې ای طبیب؟' : locale === 'ur' ? 'ای طبیب کیوں؟' : 'Why eTabeeb?'}
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {[
              { icon: '🔒', text: locale === 'ps' ? 'خوندي او پټه مشوره' : 'Secure & private consultation' },
              { icon: '✅', text: locale === 'ps' ? 'تصدیق شوي ډاکټران' : 'Verified doctors' },
              { icon: '📱', text: locale === 'ps' ? 'ټیلیفون یا کمپیوټر له لارې' : 'Phone or computer access' },
              { icon: '💊', text: locale === 'ps' ? 'ډیجیتل نسخه' : 'Digital prescription with QR verification' },
              { icon: '🌐', text: locale === 'ps' ? 'پښتو، اردو، دري' : 'Pashto, Urdu, Dari, English' },
              { icon: '🏥', text: locale === 'ps' ? 'د کوژک کلینیک خدمت' : 'Kozhak Specialist Clinic service' },
            ].map((f, i) => (
              <div key={i} className="flex items-center gap-3 p-4 bg-[#f0faf5] rounded-xl border border-[#DDE7E2]">
                <span className="text-2xl">{f.icon}</span>
                <span className="text-[#05201a] text-sm font-medium">{f.text}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="bg-[#00523a] text-white py-12 px-4 text-center">
        <h2 className="text-2xl font-bold mb-4">
          {locale === 'ps' ? 'نن ورځ پیل کړئ' : locale === 'ur' ? 'آج شروع کریں' : 'Get Started Today'}
        </h2>
        <p className="text-white/80 mb-6">
          {locale === 'ps' ? 'د ثبت نوم لپاره هیڅ فیس نشته' : 'Registration is free'}
        </p>
        <Link
          href={`/${locale}/register`}
          className="inline-block bg-[#D4AF37] text-[#00523a] px-10 py-3 rounded-xl font-bold text-lg hover:bg-yellow-400 transition"
        >
          {locale === 'ps' ? 'نوی اکاونټ جوړ کړئ' : locale === 'ur' ? 'رجسٹر کریں' : 'Create Account'}
        </Link>
      </section>

      {/* Footer */}
      <footer className="bg-[#05201a] text-white/60 py-6 px-4 text-center text-sm">
        <p>© 2026 eTabeeb · Kozhak Specialist Clinic · Chaman, Balochistan</p>
        <p className="mt-1">
          <Link href={`/${locale}/login`} className="hover:text-white">Login</Link>
          {' · '}
          <a href="https://kozhakclinic.com" className="hover:text-white">Kozhak Clinic</a>
        </p>
      </footer>
    </main>
  )
}
