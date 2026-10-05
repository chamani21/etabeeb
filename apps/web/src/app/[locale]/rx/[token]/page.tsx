import { headers } from 'next/headers'
import { verifyPrescriptionToken } from '@/lib/etabib/rx/service'
import { rateLimited } from '@/lib/etabib/rate-limit'

export const dynamic = 'force-dynamic'
export const metadata = { robots: { index: false, follow: false }, title: 'eTabeeb — prescription verification' }

// Public QR verification: confirms a prescription is genuine. Shows NO patient,
// diagnosis or medication data. 128-bit random token; per-IP rate limited.
export default async function RxVerifyPage({ params }: { params: { token: string } }) {
  const ip = (headers().get('x-forwarded-for') ?? '').split(',')[0]!.trim() || 'unknown'
  const limited = rateLimited(`rx-verify:${ip}`, 30, 60_000)
  const rx = limited ? null : await verifyPrescriptionToken(params.token)
  const date = rx?.issuedAt ? new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Karachi', day: '2-digit', month: 'short', year: 'numeric' }).format(rx.issuedAt) : null
  return (
    <main dir="rtl" lang="ps" className="min-h-screen bg-[#eef7f8] px-4 py-10 text-[#13233a]">
      <div className="mx-auto max-w-md rounded-2xl bg-white p-6 shadow-sm">
        <h1 className="text-center text-2xl font-bold text-[#0b2a4a]">eTabeeb</h1>
        <p className="mb-5 text-center text-sm text-gray-500">د نسخې تایید · Prescription verification</p>
        {limited ? (
          <p className="rounded-lg bg-amber-50 p-4 text-center text-amber-900">ډېرې هڅې وشوې. لږ وروسته بیا هڅه وکړئ.</p>
        ) : !rx ? (
          <p className="rounded-lg bg-red-50 p-4 text-center text-red-800">دا نسخه ونه موندل شوه. · Prescription not found.</p>
        ) : (
          <div className="space-y-3">
            <p className={`rounded-lg p-4 text-center font-semibold ${rx.status === 'FINALIZED' ? 'bg-emerald-50 text-emerald-800' : 'bg-amber-50 text-amber-900'}`}>
              {rx.status === 'FINALIZED' ? 'دا نسخه سمه او اعتبار لري. · Valid prescription' : 'دا نسخه په یوې نوې نسخې بدله شوې ده. · Replaced by a newer revision'}
            </p>
            <dl dir="ltr" className="grid grid-cols-[9rem_1fr] gap-y-2 text-sm">
              <dt className="text-gray-500">Prescription ID</dt><dd className="font-mono font-semibold">{rx.rxNumber}</dd>
              <dt className="text-gray-500">Revision</dt><dd>{rx.revision}</dd>
              <dt className="text-gray-500">Doctor</dt><dd>{rx.doctor}</dd>
              <dt className="text-gray-500">Issued</dt><dd>{date}</dd>
            </dl>
          </div>
        )}
        <p className="mt-6 text-center text-xs text-gray-500" dir="ltr">etabeeb.online · 0310 000 6526</p>
      </div>
    </main>
  )
}
