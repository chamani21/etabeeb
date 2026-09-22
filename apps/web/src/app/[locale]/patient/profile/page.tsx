'use client'

import { useState, useEffect } from 'react'
import { useParams } from 'next/navigation'

export default function PatientProfilePage() {
  const params = useParams()
  const locale = (params?.locale as string) || 'ps'
  const [profile, setProfile] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [saveMsg, setSaveMsg] = useState('')
  const [form, setForm] = useState({
    displayName: '',
    email: '',
    givenName: '',
    familyName: '',
    dateOfBirth: '',
    biologicalSex: '',
    allergiesSummary: '',
    currentPassword: '',
    newPassword: '',
    preferredLocale: locale,
  })

  useEffect(() => {
    fetch('/api/profile')
      .then(r => r.json())
      .then(data => {
        setProfile(data)
        setForm(prev => ({
          ...prev,
          displayName: data.user?.displayName || '',
          email: data.user?.email || '',
          givenName: data.patient?.givenName || '',
          familyName: data.patient?.familyName || '',
          dateOfBirth: data.patient?.dateOfBirth || '',
          biologicalSex: data.patient?.biologicalSex || '',
          allergiesSummary: data.patient?.allergiesSummary || '',
          preferredLocale: data.user?.preferredLocale || locale,
        }))
      })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [locale])

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault()
    setSaving(true)
    setSaveMsg('')
    try {
      const body: any = {
        displayName: form.displayName,
        email: form.email,
        givenName: form.givenName,
        familyName: form.familyName,
        dateOfBirth: form.dateOfBirth || undefined,
        biologicalSex: form.biologicalSex || undefined,
        allergiesSummary: form.allergiesSummary,
        preferredLocale: form.preferredLocale as any,
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
        setSaveMsg(locale === 'ps' ? '✓ پروفایل خوندي شو' : locale === 'ur' ? '✓ پروفائل محفوظ ہو گئی' : '✓ Profile saved')
        setForm(prev => ({ ...prev, currentPassword: '', newPassword: '' }))
      } else {
        setSaveMsg('Error: ' + (data.error || 'Failed to save'))
      }
    } catch {
      setSaveMsg('Error: An error occurred')
    } finally {
      setSaving(false)
      setTimeout(() => setSaveMsg(''), 4000)
    }
  }

  if (loading) {
    return (
      <div className="text-center py-12">
        <div className="w-8 h-8 border-4 border-[#00523a] border-t-transparent rounded-full animate-spin mx-auto" />
      </div>
    )
  }

  return (
    <>
      <h1 className="text-2xl font-bold text-[#05201a] mb-4">
        {locale === 'ps' ? 'زما پروفایل' : locale === 'ur' ? 'میری پروفائل' : 'My Profile'}
      </h1>

      <form onSubmit={handleSave} className="space-y-4">
        {/* Basic Info */}
        <div className="bg-white rounded-xl shadow-sm border border-[#DDE7E2] p-4">
          <h2 className="text-lg font-bold text-[#00523a] mb-3">
            {locale === 'ps' ? 'اساسي معلومات' : locale === 'ur' ? 'بنیادی معلومات' : 'Basic Information'}
          </h2>
          <div className="space-y-3">
            <div>
              <label className="block text-sm font-medium text-[#05201a] mb-1">
                {locale === 'ps' ? 'ډکه نوم' : 'Display Name'}
              </label>
              <input
                type="text"
                value={form.displayName}
                onChange={e => setForm(p => ({ ...p, displayName: e.target.value }))}
                className="w-full border border-[#DDE7E2] rounded-lg p-2.5 text-sm focus:outline-none focus:border-[#00523a]"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-sm font-medium text-[#05201a] mb-1">
                  {locale === 'ps' ? 'نوم' : 'Given Name'}
                </label>
                <input
                  type="text"
                  value={form.givenName}
                  onChange={e => setForm(p => ({ ...p, givenName: e.target.value }))}
                  className="w-full border border-[#DDE7E2] rounded-lg p-2.5 text-sm focus:outline-none focus:border-[#00523a]"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-[#05201a] mb-1">
                  {locale === 'ps' ? 'تخلص' : 'Family Name'}
                </label>
                <input
                  type="text"
                  value={form.familyName}
                  onChange={e => setForm(p => ({ ...p, familyName: e.target.value }))}
                  className="w-full border border-[#DDE7E2] rounded-lg p-2.5 text-sm focus:outline-none focus:border-[#00523a]"
                />
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-[#05201a] mb-1">Email</label>
              <input
                type="email"
                value={form.email}
                onChange={e => setForm(p => ({ ...p, email: e.target.value }))}
                className="w-full border border-[#DDE7E2] rounded-lg p-2.5 text-sm focus:outline-none focus:border-[#00523a]"
                placeholder="optional"
                dir="ltr"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-sm font-medium text-[#05201a] mb-1">
                  {locale === 'ps' ? 'د زیږیدنې نیټه' : 'Date of Birth'}
                </label>
                <input
                  type="date"
                  value={form.dateOfBirth}
                  onChange={e => setForm(p => ({ ...p, dateOfBirth: e.target.value }))}
                  className="w-full border border-[#DDE7E2] rounded-lg p-2.5 text-sm focus:outline-none focus:border-[#00523a]"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-[#05201a] mb-1">
                  {locale === 'ps' ? 'جنس' : 'Biological Sex'}
                </label>
                <select
                  value={form.biologicalSex}
                  onChange={e => setForm(p => ({ ...p, biologicalSex: e.target.value }))}
                  className="w-full border border-[#DDE7E2] rounded-lg p-2.5 text-sm focus:outline-none focus:border-[#00523a]"
                >
                  <option value="">{locale === 'ps' ? 'غوره کړئ' : 'Select...'}</option>
                  <option value="male">{locale === 'ps' ? 'نارینه' : 'Male'}</option>
                  <option value="female">{locale === 'ps' ? 'ښځینه' : 'Female'}</option>
                  <option value="not_stated">{locale === 'ps' ? 'نه ویل کیږي' : 'Prefer not to state'}</option>
                </select>
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-[#05201a] mb-1">
                {locale === 'ps' ? 'الرژیونه' : 'Known Allergies'}
              </label>
              <textarea
                value={form.allergiesSummary}
                onChange={e => setForm(p => ({ ...p, allergiesSummary: e.target.value }))}
                className="w-full border border-[#DDE7E2] rounded-lg p-2.5 text-sm focus:outline-none focus:border-[#00523a] resize-none"
                rows={2}
                placeholder={locale === 'ps' ? 'د الرژیونو لیست' : 'List known allergies...'}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-[#05201a] mb-1">Language</label>
              <select
                value={form.preferredLocale}
                onChange={e => setForm(p => ({ ...p, preferredLocale: e.target.value }))}
                className="w-full border border-[#DDE7E2] rounded-lg p-2.5 text-sm focus:outline-none focus:border-[#00523a]"
              >
                <option value="ps">پښتو</option>
                <option value="fa">دری</option>
                <option value="ur">اردو</option>
                <option value="en">English</option>
              </select>
            </div>
          </div>
        </div>

        {/* Change Password */}
        <div className="bg-white rounded-xl shadow-sm border border-[#DDE7E2] p-4">
          <h2 className="text-lg font-bold text-[#00523a] mb-3">
            {locale === 'ps' ? 'پټنوم بدلول' : locale === 'ur' ? 'پاس ورڈ تبدیل کریں' : 'Change Password'}
          </h2>
          <div className="space-y-3">
            <div>
              <label className="block text-sm font-medium text-[#05201a] mb-1">
                {locale === 'ps' ? 'اوسنی پټنوم' : 'Current Password'}
              </label>
              <input
                type="password"
                value={form.currentPassword}
                onChange={e => setForm(p => ({ ...p, currentPassword: e.target.value }))}
                className="w-full border border-[#DDE7E2] rounded-lg p-2.5 text-sm focus:outline-none focus:border-[#00523a]"
                autoComplete="current-password"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-[#05201a] mb-1">
                {locale === 'ps' ? 'نوی پټنوم' : 'New Password (min 6 characters)'}
              </label>
              <input
                type="password"
                value={form.newPassword}
                onChange={e => setForm(p => ({ ...p, newPassword: e.target.value }))}
                className="w-full border border-[#DDE7E2] rounded-lg p-2.5 text-sm focus:outline-none focus:border-[#00523a]"
                autoComplete="new-password"
                minLength={6}
              />
            </div>
          </div>
        </div>

        {saveMsg && (
          <div className={`text-sm px-4 py-3 rounded-lg ${saveMsg.startsWith('Error') ? 'bg-red-50 text-red-700 border border-red-200' : 'bg-green-50 text-green-700 border border-green-200'}`}>
            {saveMsg}
          </div>
        )}

        <button
          type="submit"
          disabled={saving}
          className="w-full bg-[#00523a] text-white py-3 rounded-xl font-semibold hover:bg-[#006d4e] transition disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {saving ? (locale === 'ps' ? 'روان دی...' : 'Saving...') : (locale === 'ps' ? 'پروفایل خوندي کول' : locale === 'ur' ? 'محفوظ کریں' : 'Save Profile')}
        </button>
      </form>
    </>
  )
}
