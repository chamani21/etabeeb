'use client'

import { useState, useEffect } from 'react'
import { useParams } from 'next/navigation'

export default function AdminAppointmentsPage() {
  const params = useParams()
  const locale = (params?.locale as string) || 'ps'
  const [appointments, setAppointments] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [statusFilter, setStatusFilter] = useState('all')
  const [updating, setUpdating] = useState<string | null>(null)
  const [msg, setMsg] = useState('')

  const fetchAppointments = async () => {
    setLoading(true)
    try {
      const url = statusFilter === 'all' ? '/api/appointments' : `/api/appointments?status=${statusFilter}`
      const res = await fetch(url)
      const data = await res.json()
      setAppointments(data.appointments || [])
    } catch {
      setAppointments([])
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { fetchAppointments() }, [statusFilter])

  const handleStatusChange = async (appointmentId: string, newStatus: string) => {
    setUpdating(appointmentId)
    setMsg('')
    try {
      const res = await fetch('/api/appointments', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ appointmentId, status: newStatus }),
      })
      const data = await res.json()
      if (res.ok) {
        setMsg(`✓ Status updated to ${newStatus}`)
        await fetchAppointments()
      } else {
        setMsg('Error: ' + (data.error || 'Failed to update'))
      }
    } catch {
      setMsg('Error updating status')
    } finally {
      setUpdating(null)
      setTimeout(() => setMsg(''), 3000)
    }
  }

  const formatDateTime = (d: string | undefined) =>
    d ? new Date(d).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—'

  const statusColor = (s: string) => {
    switch (s) {
      case 'confirmed': return 'bg-green-100 text-green-700'
      case 'completed': return 'bg-blue-100 text-blue-700'
      case 'cancelled': return 'bg-red-100 text-red-700'
      case 'in_progress': return 'bg-purple-100 text-purple-700'
      default: return 'bg-yellow-100 text-yellow-700'
    }
  }

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold text-[#00523a]">
          {locale === 'ps' ? 'ټول وختونه' : 'All Appointments'}
        </h2>
        <select
          value={statusFilter}
          onChange={e => setStatusFilter(e.target.value)}
          className="border border-gray-200 rounded-lg p-2 text-sm focus:outline-none focus:border-[#00523a]"
        >
          <option value="all">All Statuses</option>
          <option value="confirmed">Confirmed</option>
          <option value="in_progress">In Progress</option>
          <option value="completed">Completed</option>
          <option value="cancelled">Cancelled</option>
          <option value="pending_payment">Pending Payment</option>
        </select>
      </div>

      {msg && (
        <div className={`text-sm px-4 py-3 rounded-lg ${msg.startsWith('Error') ? 'bg-red-50 text-red-700' : 'bg-green-50 text-green-700'}`}>
          {msg}
        </div>
      )}

      {loading ? (
        <div className="text-center py-8">
          <div className="w-8 h-8 border-4 border-[#00523a] border-t-transparent rounded-full animate-spin mx-auto" />
        </div>
      ) : (
        <div className="bg-white shadow-sm rounded-lg border border-gray-100 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Time</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Type</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Complaint</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Actions</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {appointments.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-6 py-8 text-center text-gray-500 text-sm">
                      {locale === 'ps' ? 'هیڅ وخت نشته' : 'No appointments found'}
                    </td>
                  </tr>
                ) : appointments.map(appt => (
                  <tr key={appt.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3 text-xs font-mono text-gray-600 whitespace-nowrap">
                      {formatDateTime(appt.slotStart)}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-700">{appt.consultationType}</td>
                    <td className="px-4 py-3 text-sm text-gray-500 max-w-[180px] truncate">
                      {appt.chiefComplaint || '—'}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`px-2 py-1 text-xs rounded-full font-medium ${statusColor(appt.status)}`}>
                        {appt.status}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex gap-2">
                        {appt.status === 'pending_payment' && (
                          <button
                            onClick={() => handleStatusChange(appt.id, 'confirmed')}
                            disabled={updating === appt.id}
                            className="text-xs text-[#006d4e] hover:underline font-medium disabled:opacity-50"
                          >
                            Confirm
                          </button>
                        )}
                        {(appt.status === 'confirmed' || appt.status === 'in_progress') && (
                          <button
                            onClick={() => handleStatusChange(appt.id, 'completed')}
                            disabled={updating === appt.id}
                            className="text-xs text-blue-600 hover:underline font-medium disabled:opacity-50"
                          >
                            Complete
                          </button>
                        )}
                        {appt.status !== 'cancelled' && appt.status !== 'completed' && (
                          <button
                            onClick={() => handleStatusChange(appt.id, 'cancelled')}
                            disabled={updating === appt.id}
                            className="text-xs text-red-500 hover:underline font-medium disabled:opacity-50"
                          >
                            Cancel
                          </button>
                        )}
                      </div>
                    </td>
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
