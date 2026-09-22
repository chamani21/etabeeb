'use client'

import { useState, useEffect } from 'react'
import { useParams } from 'next/navigation'

interface Doctor {
  id: string
  displayName: string
  specialty?: string
  qualifications?: string
  credentialStatus?: string
  isPublished?: boolean
  consultationFee?: number
}

interface AddDoctorForm {
  displayName: string
  displayNameUrdu: string
  displayNamePashto: string
  phone: string
  email: string
  password: string
  specialty: string
  specialtyUrdu: string
  specialtyPashto: string
  qualifications: string
  licenceNumber: string
  consultationFee: string
}

export default function AdminDoctors() {
  const params = useParams()
  const locale = (params?.locale as string) || 'ps'
  const [doctors, setDoctors] = useState<Doctor[]>([])
  const [loading, setLoading] = useState(true)
  const [showModal, setShowModal] = useState(false)
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState('')
  const [form, setForm] = useState<AddDoctorForm>({
    displayName: '', displayNameUrdu: '', displayNamePashto: '',
    phone: '', email: '', password: 'changeme123',
    specialty: '', specialtyUrdu: '', specialtyPashto: '',
    qualifications: '', licenceNumber: '', consultationFee: '',
  })

  const fetchDoctors = async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/doctors?all=true')
      const data = await res.json()
      setDoctors(data.doctors || [])
    } catch {
      setDoctors([])
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { fetchDoctors() }, [])

  const handleAddDoctor = async () => {
    setSaveError('')
    if (!form.displayName || !form.phone || !form.specialty) {
      setSaveError('Name, phone, and specialty are required')
      return
    }
    setSaving(true)
    try {
      const res = await fetch('/api/doctors', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...form,
          consultationFee: form.consultationFee ? parseFloat(form.consultationFee) : undefined,
        }),
      })
      const data = await res.json()
      if (res.ok) {
        setShowModal(false)
        setForm({
          displayName: '', displayNameUrdu: '', displayNamePashto: '',
          phone: '', email: '', password: 'changeme123',
          specialty: '', specialtyUrdu: '', specialtyPashto: '',
          qualifications: '', licenceNumber: '', consultationFee: '',
        })
        await fetchDoctors()
      } else {
        setSaveError(data.error || 'Failed to add doctor')
      }
    } catch {
      setSaveError('An error occurred')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold text-[#00523a]">
          {locale === 'ps' ? 'ډاکټران' : 'Doctors'}
        </h2>
        <button
          onClick={() => { setShowModal(true); setSaveError('') }}
          className="bg-[#00523a] text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-[#006d4e] transition"
        >
          + {locale === 'ps' ? 'ډاکټر زیاتول' : 'Add Doctor'}
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
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Specialty</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Qualifications</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Published</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {doctors.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-6 py-8 text-center text-gray-500 text-sm">
                    {locale === 'ps' ? 'هیڅ ډاکټر نشته' : 'No doctors yet'}
                  </td>
                </tr>
              ) : doctors.map(doctor => (
                <tr key={doctor.id} className="hover:bg-gray-50">
                  <td className="px-6 py-4 text-sm font-medium text-gray-900">{doctor.displayName}</td>
                  <td className="px-6 py-4 text-sm text-gray-600">{doctor.specialty || '—'}</td>
                  <td className="px-6 py-4 text-sm text-gray-500">{doctor.qualifications || '—'}</td>
                  <td className="px-6 py-4">
                    <span className={`px-2 py-1 text-xs rounded-full font-medium ${
                      doctor.credentialStatus === 'verified'
                        ? 'bg-green-100 text-green-700'
                        : 'bg-yellow-100 text-yellow-700'
                    }`}>
                      {doctor.credentialStatus || 'pending'}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-sm text-gray-500">
                    {doctor.isPublished
                      ? <span className="text-green-600">✓ Published</span>
                      : <span className="text-gray-400">Draft</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Add Doctor Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl p-6 w-full max-w-2xl max-h-[90vh] overflow-y-auto">
            <h3 className="text-xl font-bold mb-4 border-b pb-2 text-[#00523a]">
              {locale === 'ps' ? 'نوی ډاکټر' : 'Add New Doctor'}
            </h3>

            {saveError && (
              <div className="bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-3 rounded-lg mb-4">
                {saveError}
              </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="md:col-span-2">
                <label className="block text-sm font-medium text-gray-700 mb-1">Name (English) *</label>
                <input
                  type="text"
                  value={form.displayName}
                  onChange={e => setForm(p => ({ ...p, displayName: e.target.value }))}
                  className="w-full border border-gray-200 rounded-lg p-2 text-sm focus:outline-none focus:border-[#00523a]"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Name (Urdu)</label>
                <input
                  type="text"
                  dir="rtl"
                  value={form.displayNameUrdu}
                  onChange={e => setForm(p => ({ ...p, displayNameUrdu: e.target.value }))}
                  className="w-full border border-gray-200 rounded-lg p-2 text-sm focus:outline-none focus:border-[#00523a]"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Name (Pashto)</label>
                <input
                  type="text"
                  dir="rtl"
                  value={form.displayNamePashto}
                  onChange={e => setForm(p => ({ ...p, displayNamePashto: e.target.value }))}
                  className="w-full border border-gray-200 rounded-lg p-2 text-sm focus:outline-none focus:border-[#00523a]"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Phone *</label>
                <input
                  type="text"
                  dir="ltr"
                  value={form.phone}
                  onChange={e => setForm(p => ({ ...p, phone: e.target.value }))}
                  className="w-full border border-gray-200 rounded-lg p-2 text-sm focus:outline-none focus:border-[#00523a]"
                  placeholder="+92 / +93 ..."
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Temp Password</label>
                <input
                  type="text"
                  value={form.password}
                  onChange={e => setForm(p => ({ ...p, password: e.target.value }))}
                  className="w-full border border-gray-200 rounded-lg p-2 text-sm focus:outline-none focus:border-[#00523a]"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Specialty (English) *</label>
                <input
                  type="text"
                  value={form.specialty}
                  onChange={e => setForm(p => ({ ...p, specialty: e.target.value }))}
                  className="w-full border border-gray-200 rounded-lg p-2 text-sm focus:outline-none focus:border-[#00523a]"
                  placeholder="e.g. General Practice"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Qualifications</label>
                <input
                  type="text"
                  value={form.qualifications}
                  onChange={e => setForm(p => ({ ...p, qualifications: e.target.value }))}
                  className="w-full border border-gray-200 rounded-lg p-2 text-sm focus:outline-none focus:border-[#00523a]"
                  placeholder="MBBS, MD..."
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Licence Number</label>
                <input
                  type="text"
                  value={form.licenceNumber}
                  onChange={e => setForm(p => ({ ...p, licenceNumber: e.target.value }))}
                  className="w-full border border-gray-200 rounded-lg p-2 text-sm focus:outline-none focus:border-[#00523a]"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Consultation Fee (PKR)</label>
                <input
                  type="number"
                  value={form.consultationFee}
                  onChange={e => setForm(p => ({ ...p, consultationFee: e.target.value }))}
                  className="w-full border border-gray-200 rounded-lg p-2 text-sm focus:outline-none focus:border-[#00523a]"
                  placeholder="e.g. 500"
                />
              </div>
            </div>

            <div className="flex justify-end gap-3 mt-6 pt-4 border-t">
              <button
                onClick={() => setShowModal(false)}
                className="px-4 py-2 text-sm border border-gray-200 rounded-lg hover:bg-gray-50"
              >
                {locale === 'ps' ? 'لغوه' : 'Cancel'}
              </button>
              <button
                onClick={handleAddDoctor}
                disabled={saving}
                className="px-6 py-2 text-sm bg-[#00523a] text-white rounded-lg hover:bg-[#006d4e] disabled:opacity-50"
              >
                {saving ? '...' : (locale === 'ps' ? 'خوندي کول' : 'Save')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
