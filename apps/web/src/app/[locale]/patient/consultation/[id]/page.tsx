'use client'

import { useEffect } from 'react'
import { useParams, useRouter } from 'next/navigation'

// Patient sees the consultation page (video only)
// Doctors use the doctor/consultation/[id] page
export default function PatientConsultationPage() {
  const params = useParams()
  const locale = (params?.locale as string) || 'ps'
  const id = params?.id as string
  const router = useRouter()

  // Redirect to doctor consultation if this user is a practitioner
  // (patient-facing consultation is a simplified view)
  useEffect(() => {
    // No-op: patient sees this page, doctor sees /doctor/consultation/[id]
  }, [])

  return (
    <div className="max-w-2xl mx-auto">
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-xl font-bold text-[#05201a]">
          {locale === 'ps' ? 'ویډیو مشوره' : locale === 'ur' ? 'ویڈیو کنسلٹیشن' : 'Video Consultation'}
        </h1>
        <button
          onClick={() => router.back()}
          className="text-sm text-[#5D6F69] hover:text-[#05201a]"
        >
          ← {locale === 'ps' ? 'بیرته' : 'Back'}
        </button>
      </div>

      {/* Video area */}
      <div className="bg-gray-900 rounded-xl overflow-hidden" style={{ minHeight: '400px' }}>
        <div className="flex flex-col items-center justify-center h-64 text-white">
          <div className="w-16 h-16 bg-[#006d4e] rounded-full flex items-center justify-center mb-4">
            <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
            </svg>
          </div>
          <p className="text-white font-medium mb-1">
            {locale === 'ps' ? 'د ډاکټر انتظار' : locale === 'ur' ? 'ڈاکٹر کا انتظار' : 'Waiting for Doctor'}
          </p>
          <p className="text-gray-400 text-sm">
            {locale === 'ps' ? 'ډاکټر به ژر ووصله' : 'Your doctor will join shortly'}
          </p>
        </div>

        {/* Video controls */}
        <div className="flex items-center justify-center gap-4 p-4 bg-gray-800">
          <button className="w-12 h-12 bg-gray-700 text-white rounded-full flex items-center justify-center hover:bg-gray-600 transition">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
            </svg>
          </button>
          <button
            onClick={() => router.back()}
            className="w-14 h-14 bg-red-600 hover:bg-red-700 text-white rounded-full flex items-center justify-center transition"
          >
            <svg className="w-7 h-7 transform rotate-[135deg]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
            </svg>
          </button>
          <button className="w-12 h-12 bg-gray-700 text-white rounded-full flex items-center justify-center hover:bg-gray-600 transition">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
            </svg>
          </button>
        </div>
      </div>

      {/* Appointment info */}
      <div className="mt-4 bg-white rounded-xl shadow-sm border border-[#DDE7E2] p-4">
        <h2 className="text-sm font-semibold text-[#00523a] mb-2">
          {locale === 'ps' ? 'د مشورې معلومات' : 'Consultation Information'}
        </h2>
        <p className="text-sm text-[#5D6F69]">
          {locale === 'ps'
            ? 'که د ویډیو سره ستونزه وي، د ډاکټر له طرفه تلیفون انتظار وکړئ.'
            : locale === 'ur'
            ? 'اگر ویڈیو میں مسئلہ ہو تو ڈاکٹر آپ کو فون کریں گے۔'
            : 'If video is unavailable, your doctor will call you by phone.'}
        </p>
      </div>
    </div>
  )
}
