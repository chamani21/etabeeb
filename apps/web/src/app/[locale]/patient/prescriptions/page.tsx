'use client'

import { useState, useEffect } from 'react'
import { useParams } from 'next/navigation'

export default function PatientPrescriptionsPage() {
  const params = useParams()
  const locale = (params?.locale as string) || 'ps'
  const [prescriptions, setPrescriptions] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch('/api/prescriptions')
      .then(r => r.json())
      .then(data => setPrescriptions(data.prescriptions || []))
      .catch(() => setPrescriptions([]))
      .finally(() => setLoading(false))
  }, [])

  const formatDate = (d: string) => d ? new Date(d).toLocaleDateString() : ''

  return (
    <>
      <h1 className="text-2xl font-bold text-[#05201a] mb-4">
        {locale === 'ps' ? 'نسخې' : locale === 'ur' ? 'نسخے' : 'Prescriptions'}
      </h1>

      {loading ? (
        <div className="text-center py-10">
          <div className="w-8 h-8 border-4 border-[#00523a] border-t-transparent rounded-full animate-spin mx-auto" />
        </div>
      ) : prescriptions.length === 0 ? (
        <div className="text-center py-12 bg-white rounded-xl shadow-sm border border-[#DDE7E2]">
          <svg className="w-12 h-12 text-[#DDE7E2] mx-auto mb-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
          </svg>
          <p className="text-[#5D6F69]">
            {locale === 'ps' ? 'هیڅ نسخه نشته' : locale === 'ur' ? 'کوئی نسخہ نہیں' : 'No prescriptions yet'}
          </p>
          <p className="text-sm text-[#5D6F69] mt-1">
            {locale === 'ps' ? 'د مشوري وروسته نسخه ستاسو دلته ښکاره کیږي' : 'Prescriptions from your consultations will appear here'}
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {prescriptions.map(rx => (
            <div key={rx.publicId || rx.id} className="bg-white rounded-xl shadow-sm border border-[#DDE7E2] p-4">
              <div className="flex items-start justify-between mb-3">
                <div>
                  <p className="font-semibold text-[#05201a]">
                    {locale === 'ps' ? 'نسخه' : 'Prescription'} #{rx.publicId?.toString().slice(-8)}
                  </p>
                  <p className="text-xs text-[#5D6F69]">
                    {formatDate(rx.createdAt)}
                    {rx.signedAt ? ` · Signed: ${formatDate(rx.signedAt)}` : ''}
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

              {rx.items && rx.items.length > 0 && (
                <div className="space-y-2 mb-3">
                  {rx.items.map((item: any, i: number) => (
                    <div key={i} className="text-sm bg-[#f0faf5] rounded-lg p-2">
                      <span className="font-medium text-[#00523a]">{item.genericName}</span>
                      {item.strength && <span className="text-[#5D6F69]"> {item.strength}</span>}
                      <span className="text-[#5D6F69]"> · {item.dose} {item.frequency}</span>
                      {item.timing && <span className="text-[#5D6F69]"> {item.timing}</span>}
                    </div>
                  ))}
                </div>
              )}

              {rx.verificationToken && (
                <div className="flex items-center gap-2 text-xs text-[#5D6F69] border-t border-[#DDE7E2] pt-2 mt-2">
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                  </svg>
                  <span>QR verification available at pharmacy</span>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </>
  )
}
