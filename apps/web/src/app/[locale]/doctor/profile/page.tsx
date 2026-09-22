'use client'

import { useState, useEffect } from 'react'
import { useParams } from 'next/navigation'

export default function DoctorProfilePage() {
  const params = useParams()
  const locale = (params?.locale as string) || 'ps'
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [saveMsg, setSaveMsg] = useState('')
  const [form, setForm] = useState({
    displayName: '',
    email: '',
    specialty: '',
    qualifications: '',
    bio: '',
    currentPassword: '',
    newPassword: '',
  })

  useEffect(() => {
    fetch('/api/profile')
      .then(r => r.json())
      .then(data => {
        setForm(prev => ({
          ...prev,
          displayName: data.user?.displayName || '',
          email: data.user?.email || '',
        }))
        // Also try to get practitioner info from doctors endpoint
        return fetch('/api/doctors/me')
      })
      .then(r => r?.ok ? r.json() : null)
      .then(data => {
        if (data?.doctor) {
          setForm(prev => ({
            ...prev,
            specialty: data.doctor.specialty || '',
            qualifications: data.doctor.qualifications || '',
            bio: data.doctor.bio || '',
          }))
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault()
    setSaving(true)
    setSaveMsg('')
    try {
      const body: any = {
        displayName: form.displayName,
        email: form.email,
      }
      if (form.newPassword) {
        body.currentPassword = form.currentPassword
        body.newPassword = form.newPassword
      }
      const res = await fetch('/api/profile', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const data = await res.json()
      if (res.ok) {
        setSaveMsg('✓ Profile saved')
        setForm(prev => ({ ...prev, currentPassword: '', newPassword: '' }))
      } else {
        setSaveMsg('Error: ' + (data.error || 'Failed to save'))
      }
    } catch {
      setSaveMsg('Error saving profile')
    } finally {
      setSaving(false)
      setTimeout(() => setSaveMsg(''), 4000)
    }
  }

  if (loading) {
    return <div className="text-center py-12"><div className="w-8 h-8 border-4 border-[#00523a] border-t-transparent rounded-full animate-spin mx-auto" /></div>
  }

  return (
    <div className="space-y-6 max-w-2xl">
      <h1 className="text-2xl font-bold text-[#00523a]">
        {locale === 'ps' ? 'زما پروفایل' : 'My Profile'}
      </h1>

      <form onSubmit={handleSave} className="space-y-6">
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6 space-y-4">
          <h2 className="text-lg font-semibold text-gray-800">
            {locale === 'ps' ? 'اساسي معلومات' : 'Basic Information'}
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Name</label>
              <input
                type="text"
                value={form.displayName}
                onChange={e => setForm(p => ({ ...p, displayName: e.target.value }))}
                className="w-full border border-gray-200 rounded-lg p-2.5 text-sm focus:outline-none focus:border-[#00523a]"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
              <input
                type="email"
                value={form.email}
                onChange={e => setForm(p => ({ ...p, email: e.target.value }))}
                className="w-full border border-gray-200 rounded-lg p-2.5 text-sm focus:outline-none focus:border-[#00523a]"
                dir="ltr"
              />
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Specialty</label>
            <input
              type="text"
              value={form.specialty}
              readOnly
              className="w-full border border-gray-100 rounded-lg p-2.5 text-sm bg-gray-50 text-gray-500"
              placeholder="Set by administrator"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Qualifications</label>
            <input
              type="text"
              value={form.qualifications}
              readOnly
              className="w-full border border-gray-100 rounded-lg p-2.5 text-sm bg-gray-50 text-gray-500"
              placeholder="Set by administrator"
            />
          </div>
        </div>

        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6 space-y-4">
          <h2 className="text-lg font-semibold text-gray-800">Change Password</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Current Password</label>
              <input
                type="password"
                value={form.currentPassword}
                onChange={e => setForm(p => ({ ...p, currentPassword: e.target.value }))}
                className="w-full border border-gray-200 rounded-lg p-2.5 text-sm focus:outline-none focus:border-[#00523a]"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">New Password</label>
              <input
                type="password"
                value={form.newPassword}
                onChange={e => setForm(p => ({ ...p, newPassword: e.target.value }))}
                className="w-full border border-gray-200 rounded-lg p-2.5 text-sm focus:outline-none focus:border-[#00523a]"
                minLength={6}
              />
            </div>
          </div>
        </div>

        {saveMsg && (
          <div className={`text-sm px-4 py-3 rounded-lg ${saveMsg.startsWith('Error') ? 'bg-red-50 text-red-700' : 'bg-green-50 text-green-700'}`}>
            {saveMsg}
          </div>
        )}

        <button
          type="submit"
          disabled={saving}
          className="bg-[#00523a] text-white py-2.5 px-8 rounded-lg font-semibold hover:bg-[#006d4e] transition disabled:opacity-50"
        >
          {saving ? 'Saving...' : 'Save Profile'}
        </button>
      </form>
    </div>
  )
}
