'use client'

import { useState, useEffect } from 'react'
import { useParams } from 'next/navigation'

interface Patient {
  userId: string
  displayName?: string
  phone?: string
  givenName?: string
  familyName?: string
  dateOfBirth?: string
  biologicalSex?: string
  createdAt: string
}

export default function AdminPatients() {
  const params = useParams()
  const locale = (params?.locale as string) || 'ps'
  const [patients, setPatients] = useState<Patient[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [inputSearch, setInputSearch] = useState('')

  const fetchPatients = async (q?: string) => {
    setLoading(true)
    try {
      const url = q ? `/api/admin/patients?search=${encodeURIComponent(q)}` : '/api/admin/patients'
      const res = await fetch(url)
      const data = await res.json()
      setPatients(data.patients || [])
    } catch {
      setPatients([])
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { fetchPatients() }, [])

  const handleSearch = () => {
    setSearch(inputSearch)
    fetchPatients(inputSearch)
  }

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      <h2 className="text-2xl font-bold text-[#00523a]">
        {locale === 'ps' ? 'ناروغان' : 'Patients'}
      </h2>

      {/* Search */}
      <div className="flex gap-3">
        <input
          type="text"
          value={inputSearch}
          onChange={e => setInputSearch(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && handleSearch()}
          placeholder={locale === 'ps' ? 'د ناروغ لټون...' : 'Search patients...'}
          className="flex-1 border border-gray-200 rounded-lg p-2 text-sm focus:outline-none focus:border-[#00523a]"
        />
        <button
          onClick={handleSearch}
          className="bg-[#00523a] text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-[#006d4e] transition"
        >
          {locale === 'ps' ? 'لټول' : 'Search'}
        </button>
      </div>

      {loading ? (
        <div className="text-center py-8">
          <div className="w-8 h-8 border-4 border-[#00523a] border-t-transparent rounded-full animate-spin mx-auto" />
        </div>
      ) : (
        <div className="bg-white shadow-sm rounded-lg border border-gray-100 overflow-hidden">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Name</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Phone</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">DOB</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Sex</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Registered</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {patients.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-6 py-8 text-center text-gray-500 text-sm">
                    {locale === 'ps' ? 'هیڅ ناروغ نشته' : 'No patients found'}
                  </td>
                </tr>
              ) : patients.map((patient, i) => (
                <tr key={i} className="hover:bg-gray-50">
                  <td className="px-6 py-4 text-sm font-medium text-gray-900">
                    {patient.displayName || `${patient.givenName || ''} ${patient.familyName || ''}`.trim() || '—'}
                  </td>
                  <td className="px-6 py-4 text-sm text-gray-600 font-mono">{patient.phone || '—'}</td>
                  <td className="px-6 py-4 text-sm text-gray-500">{patient.dateOfBirth || '—'}</td>
                  <td className="px-6 py-4 text-sm text-gray-500">{patient.biologicalSex || '—'}</td>
                  <td className="px-6 py-4 text-sm text-gray-500">
                    {patient.createdAt ? new Date(patient.createdAt).toLocaleDateString() : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
