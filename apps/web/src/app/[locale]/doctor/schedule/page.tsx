'use client'

import { useState, useEffect } from 'react'
import { useParams } from 'next/navigation'

const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']

interface ScheduleRule {
  id?: string
  dayOfWeek: number
  slotStartTime: string
  slotEndTime: string
  slotDurationMinutes: number
  bufferMinutes: number
  consultationType: string
  timezone: string
}

export default function DoctorSchedulePage() {
  const params = useParams()
  const locale = (params?.locale as string) || 'ps'

  const [rules, setRules] = useState<ScheduleRule[]>([])
  const [loading, setLoading] = useState(true)
  const [saveStatus, setSaveStatus] = useState('')

  const [newRule, setNewRule] = useState<ScheduleRule>({
    dayOfWeek: 1,
    slotStartTime: '09:00',
    slotEndTime: '17:00',
    slotDurationMinutes: 20,
    bufferMinutes: 5,
    consultationType: 'video',
    timezone: 'Asia/Karachi',
  })

  const [leaveDate, setLeaveDate] = useState('')
  const [leaveReason, setLeaveReason] = useState('')
  const [savingLeave, setSavingLeave] = useState(false)

  useEffect(() => {
    fetch('/api/schedule')
      .then(r => r.json())
      .then(data => setRules(data.rules || []))
      .catch(() => setRules([]))
      .finally(() => setLoading(false))
  }, [])

  const handleAddRule = async () => {
    setSaveStatus('')
    try {
      const res = await fetch('/api/schedule', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...newRule, type: 'rule' }),
      })
      const data = await res.json()
      if (res.ok) {
        setRules(prev => [...prev, data.rule])
        setSaveStatus('✓ Availability rule saved')
      } else {
        setSaveStatus('Error: ' + (data.error || 'Failed to save rule'))
      }
    } catch {
      setSaveStatus('Error: Connection failed')
    }
    setTimeout(() => setSaveStatus(''), 4000)
  }

  const handleAddLeave = async () => {
    if (!leaveDate) {
      setSaveStatus('Please select a leave date')
      return
    }
    setSavingLeave(true)
    try {
      const res = await fetch('/api/schedule', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'leave',
          exceptionDate: new Date(leaveDate).toISOString(),
          reason: leaveReason || undefined,
          isAvailable: false,
        }),
      })
      const data = await res.json()
      if (res.ok) {
        setSaveStatus('✓ Leave date saved')
        setLeaveDate('')
        setLeaveReason('')
      } else {
        setSaveStatus('Error: ' + (data.error || 'Failed to save leave'))
      }
    } catch {
      setSaveStatus('Error: Connection failed')
    } finally {
      setSavingLeave(false)
      setTimeout(() => setSaveStatus(''), 4000)
    }
  }

  return (
    <div className="space-y-6 max-w-3xl">
      <h1 className="text-2xl font-bold text-[#00523a]">
        {locale === 'ps' ? 'شیډول تنظیم' : locale === 'ur' ? 'شیڈول' : 'Availability Schedule'}
      </h1>

      {/* Existing Rules */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
        <h2 className="text-lg font-semibold mb-4 text-gray-800">
          {locale === 'ps' ? 'د کاري ورځو مهال' : 'Working Hours Rules'}
        </h2>
        {loading ? (
          <div className="text-center py-4">
            <div className="w-6 h-6 border-4 border-[#00523a] border-t-transparent rounded-full animate-spin mx-auto" />
          </div>
        ) : rules.length === 0 ? (
          <p className="text-sm text-gray-500">
            {locale === 'ps' ? 'هیڅ قانون نشته. لاندې یو اضافه کړئ.' : 'No rules yet. Add one below.'}
          </p>
        ) : (
          <div className="space-y-2">
            {rules.map((rule, i) => (
              <div key={i} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg text-sm">
                <span className="font-medium">{DAYS[rule.dayOfWeek]}</span>
                <span>{rule.slotStartTime} – {rule.slotEndTime}</span>
                <span>{rule.slotDurationMinutes}min slots</span>
                <span className="text-gray-500">{rule.consultationType}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Add New Rule */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
        <h2 className="text-lg font-semibold mb-4 text-gray-800">
          {locale === 'ps' ? 'نوی د شته وخت قانون' : 'Add Availability Rule'}
        </h2>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Day of Week</label>
            <select
              value={newRule.dayOfWeek}
              onChange={e => setNewRule(p => ({ ...p, dayOfWeek: parseInt(e.target.value) }))}
              className="w-full border border-gray-200 rounded p-2 text-sm focus:outline-none focus:border-[#00523a]"
            >
              {DAYS.map((d, i) => <option key={i} value={i}>{d}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Consultation Type</label>
            <select
              value={newRule.consultationType}
              onChange={e => setNewRule(p => ({ ...p, consultationType: e.target.value }))}
              className="w-full border border-gray-200 rounded p-2 text-sm focus:outline-none focus:border-[#00523a]"
            >
              <option value="video">Video</option>
              <option value="audio">Audio</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Start Time</label>
            <input
              type="time"
              value={newRule.slotStartTime}
              onChange={e => setNewRule(p => ({ ...p, slotStartTime: e.target.value }))}
              className="w-full border border-gray-200 rounded p-2 text-sm focus:outline-none focus:border-[#00523a]"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">End Time</label>
            <input
              type="time"
              value={newRule.slotEndTime}
              onChange={e => setNewRule(p => ({ ...p, slotEndTime: e.target.value }))}
              className="w-full border border-gray-200 rounded p-2 text-sm focus:outline-none focus:border-[#00523a]"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Slot Duration (minutes)</label>
            <input
              type="number"
              min={5} max={120}
              value={newRule.slotDurationMinutes}
              onChange={e => setNewRule(p => ({ ...p, slotDurationMinutes: parseInt(e.target.value) }))}
              className="w-full border border-gray-200 rounded p-2 text-sm focus:outline-none focus:border-[#00523a]"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Buffer (minutes)</label>
            <input
              type="number"
              min={0} max={30}
              value={newRule.bufferMinutes}
              onChange={e => setNewRule(p => ({ ...p, bufferMinutes: parseInt(e.target.value) }))}
              className="w-full border border-gray-200 rounded p-2 text-sm focus:outline-none focus:border-[#00523a]"
            />
          </div>
        </div>
        <button
          onClick={handleAddRule}
          className="mt-4 bg-[#00523a] text-white py-2 px-6 rounded-lg text-sm font-semibold hover:bg-[#006d4e] transition"
        >
          {locale === 'ps' ? 'قانون خوندي کول' : 'Save Rule'}
        </button>
      </div>

      {/* Leave Management */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
        <h2 className="text-lg font-semibold mb-4 text-gray-800">
          {locale === 'ps' ? 'رخصتي' : 'Leave / Unavailability'}
        </h2>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Date</label>
            <input
              type="date"
              value={leaveDate}
              onChange={e => setLeaveDate(e.target.value)}
              min={new Date().toISOString().split('T')[0]}
              className="w-full border border-gray-200 rounded p-2 text-sm focus:outline-none focus:border-[#00523a]"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Reason (optional)</label>
            <input
              type="text"
              value={leaveReason}
              onChange={e => setLeaveReason(e.target.value)}
              placeholder="Personal, holiday, etc."
              className="w-full border border-gray-200 rounded p-2 text-sm focus:outline-none focus:border-[#00523a]"
            />
          </div>
        </div>
        <button
          onClick={handleAddLeave}
          disabled={savingLeave}
          className="mt-4 border border-[#00523a] text-[#00523a] py-2 px-6 rounded-lg text-sm font-semibold hover:bg-[#e6fff6] transition disabled:opacity-50"
        >
          {savingLeave ? '...' : (locale === 'ps' ? 'رخصتي خوندي کول' : 'Mark as Unavailable')}
        </button>
      </div>

      {saveStatus && (
        <div className={`text-sm px-4 py-3 rounded-lg ${saveStatus.startsWith('Error') ? 'bg-red-50 text-red-700' : 'bg-green-50 text-green-700'}`}>
          {saveStatus}
        </div>
      )}
    </div>
  )
}
