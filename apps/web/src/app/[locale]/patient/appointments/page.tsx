'use client'

import React, { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'
import { useParams } from 'next/navigation'

interface Appointment {
  id: string
  publicId: string
  slotStart: string
  slotEnd: string
  status: string
  consultationType: string
  chiefComplaint?: string
}

export default function PatientAppointmentsPage() {
  const params = useParams()
  const locale = (params?.locale as string) || 'ps'
  const [activeTab, setActiveTab] = useState<'upcoming' | 'past'>('upcoming')
  const [appointments, setAppointments] = useState<Appointment[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [cancellingId, setCancellingId] = useState<string | null>(null)

  const fetchAppointments = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const upcoming = activeTab === 'upcoming'
      const res = await fetch(`/api/appointments?upcoming=${upcoming}`)
      if (!res.ok) throw new Error('Failed to fetch')
      const data = await res.json()
      setAppointments(data.appointments || [])
    } catch {
      setError(locale === 'ps' ? 'وختونه لوډ نشول' : 'Failed to load appointments')
    } finally {
      setLoading(false)
    }
  }, [activeTab, locale])

  useEffect(() => {
    fetchAppointments()
  }, [fetchAppointments])

  const handleCancel = async (appointmentId: string) => {
    const reason = window.prompt(
      locale === 'ps' ? 'د لغوه کولو دلیل ولیکئ' :
      locale === 'ur' ? 'منسوخی کی وجہ لکھیں' :
      'Please provide a reason for cancellation'
    )
    if (reason === null) return // user pressed cancel

    setCancellingId(appointmentId)
    try {
      const res = await fetch('/api/appointments', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ appointmentId, status: 'cancelled', reason }),
      })
      if (res.ok) {
        await fetchAppointments()
      } else {
        const data = await res.json()
        alert(data.error || 'Failed to cancel')
      }
    } catch {
      alert(locale === 'ps' ? 'ستونزه رامنځته شوه' : 'An error occurred')
    } finally {
      setCancellingId(null)
    }
  }

  const formatDateTime = (d: string) => {
    return new Date(d).toLocaleString(locale === 'ur' ? 'ur-PK' : 'en-PK', {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    })
  }

  const statusColor = (status: string) => {
    switch (status) {
      case 'confirmed': return 'bg-green-100 text-green-800'
      case 'pending_payment': return 'bg-yellow-100 text-yellow-800'
      case 'completed': return 'bg-blue-100 text-blue-800'
      case 'cancelled': return 'bg-red-100 text-red-800'
      case 'in_progress': return 'bg-purple-100 text-purple-800'
      default: return 'bg-gray-100 text-gray-800'
    }
  }

  return (
    <>
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-2xl font-bold text-[#05201a]">
          {locale === 'ps' ? 'وختونه' : locale === 'ur' ? 'ملاقاتیں' : 'Appointments'}
        </h1>
        <Link
          href={`/${locale}/patient/appointments/book`}
          className="bg-[#00523a] text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-[#006d4e] transition"
        >
          + {locale === 'ps' ? 'نوی' : locale === 'ur' ? 'نیا' : 'Book New'}
        </Link>
      </div>

      {/* Tabs */}
      <div className="flex rounded-lg bg-[#e6fff6] p-1 mb-4">
        <button
          onClick={() => setActiveTab('upcoming')}
          className={`flex-1 py-2 text-sm font-medium rounded-md transition ${activeTab === 'upcoming' ? 'bg-[#00523a] text-white shadow' : 'text-[#05201a]'}`}
        >
          {locale === 'ps' ? 'راتلونکي' : locale === 'ur' ? 'آنے والی' : 'Upcoming'}
        </button>
        <button
          onClick={() => setActiveTab('past')}
          className={`flex-1 py-2 text-sm font-medium rounded-md transition ${activeTab === 'past' ? 'bg-[#00523a] text-white shadow' : 'text-[#05201a]'}`}
        >
          {locale === 'ps' ? 'تیرې شوې' : locale === 'ur' ? 'گزشتہ' : 'Past'}
        </button>
      </div>

      {/* Content */}
      {loading ? (
        <div className="text-center py-10">
          <div className="w-8 h-8 border-4 border-[#00523a] border-t-transparent rounded-full animate-spin mx-auto" />
        </div>
      ) : error ? (
        <div className="text-center py-10 text-red-600 text-sm">{error}</div>
      ) : appointments.length === 0 ? (
        <div className="text-center py-10 bg-white rounded-xl shadow-sm border border-[#DDE7E2]">
          <svg className="w-12 h-12 text-[#DDE7E2] mx-auto mb-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
          </svg>
          <h3 className="text-lg font-medium text-[#05201a]">
            {locale === 'ps' ? 'هیڅ وخت نشته' : locale === 'ur' ? 'کوئی ملاقات نہیں' : 'No appointments'}
          </h3>
          <p className="text-sm text-[#5D6F69] mt-1 mb-4">
            {activeTab === 'upcoming'
              ? (locale === 'ps' ? 'د ډاکټر سره وخت ورکړئ' : 'Book your first appointment')
              : (locale === 'ps' ? 'تیرې شوې ملاقاتې ندي' : 'No past appointments')}
          </p>
          {activeTab === 'upcoming' && (
            <Link
              href={`/${locale}/patient/appointments/book`}
              className="inline-block bg-[#00523a] text-white px-6 py-2 rounded-lg text-sm font-medium hover:bg-[#006d4e] transition"
            >
              {locale === 'ps' ? 'وخت ورکول' : 'Book Appointment'}
            </Link>
          )}
        </div>
      ) : (
        <div className="space-y-4">
          {appointments.map(appt => (
            <div key={appt.publicId} className="bg-white rounded-xl shadow-sm border border-[#DDE7E2] p-4">
              <div className="flex justify-between items-start mb-3">
                <div>
                  <p className="font-semibold text-[#05201a] text-sm">
                    {formatDateTime(appt.slotStart)}
                  </p>
                  <p className="text-xs text-[#5D6F69] mt-0.5">
                    {appt.consultationType === 'video' ? '📹 Video' : '📞 Audio'}
                    {appt.chiefComplaint ? ` · ${appt.chiefComplaint}` : ''}
                  </p>
                </div>
                <span className={`text-xs px-2 py-1 rounded-full font-medium ${statusColor(appt.status)}`}>
                  {appt.status}
                </span>
              </div>

              {activeTab === 'upcoming' && (appt.status === 'confirmed' || appt.status === 'in_progress') && (
                <div className="flex gap-2">
                  <Link
                    href={`/${locale}/patient/consultation/${appt.publicId}`}
                    className="flex-1 text-center bg-[#00523a] hover:bg-[#006d4e] text-white py-2 rounded-lg text-sm font-medium transition"
                  >
                    {locale === 'ps' ? 'کنسلټیشن' : locale === 'ur' ? 'کنسلٹیشن' : 'Join Consultation'}
                  </Link>
                  <button
                    onClick={() => handleCancel(appt.id)}
                    disabled={cancellingId === appt.id}
                    className="flex-1 text-center border border-[#DDE7E2] hover:bg-gray-50 text-[#05201a] py-2 rounded-lg text-sm font-medium transition disabled:opacity-50"
                  >
                    {cancellingId === appt.id ? '...' : (locale === 'ps' ? 'لغوه' : locale === 'ur' ? 'منسوخ' : 'Cancel')}
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </>
  )
}
