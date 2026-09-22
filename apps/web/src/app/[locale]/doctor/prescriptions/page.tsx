'use client'

import { useState, useEffect } from 'react'
import { useParams } from 'next/navigation'

export default function DoctorPrescriptionsPage() {
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

  const formatDate = (d: string | null | undefined) => d ? new Date(d).toLocaleDateString() : '—'

  return (
    <div className="space-y-6 max-w-5xl">
      <h1 className="text-2xl font-bold text-[#00523a]">
        {locale === 'ps' ? 'نسخې' : locale === 'ur' ? 'نسخے' : 'Prescriptions'}
      </h1>

      {loading ? (
        <div className="text-center py-8">
          <div className="w-8 h-8 border-4 border-[#00523a] border-t-transparent rounded-full animate-spin mx-auto" />
        </div>
      ) : prescriptions.length === 0 ? (
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-12 text-center">
          <p className="text-gray-500">
            {locale === 'ps' ? 'هیڅ نسخه نشته' : 'No prescriptions issued yet'}
          </p>
        </div>
      ) : (
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Rx #</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Date</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Medications</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Token</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {prescriptions.map(rx => (
                  <tr key={rx.id} className="hover:bg-gray-50">
                    <td className="px-6 py-4 text-xs font-mono text-gray-500">
                      {rx.publicId?.toString().slice(-8) || '—'}
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-600">{formatDate(rx.createdAt)}</td>
                    <td className="px-6 py-4 text-sm text-gray-700">
                      {rx.items?.map((i: any) => i.genericName).join(', ') || '—'}
                    </td>
                    <td className="px-6 py-4">
                      <span className={`px-2 py-1 text-xs rounded-full font-medium ${
                        rx.status === 'active' ? 'bg-green-100 text-green-700' :
                        'bg-gray-100 text-gray-600'
                      }`}>
                        {rx.status}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-xs font-mono text-gray-500">{rx.verificationToken || '—'}</td>
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
