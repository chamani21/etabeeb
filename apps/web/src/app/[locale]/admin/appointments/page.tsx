'use client';
import { useState } from 'react';

export default function AdminAppointments() {
  const [bypassModal, setBypassModal] = useState(false);

  const mockAppts = [
    { id: 'A-2001', patient: 'Bilal Ahmed', doctor: 'Dr. Ayesha Khan', datetime: '2026-09-23 10:00 AM', status: 'Pending', payment: 'Unpaid' },
    { id: 'A-2002', patient: 'Zainab Bibi', doctor: 'Dr. Ali Raza', datetime: '2026-09-23 11:30 AM', status: 'Confirmed', payment: 'Paid' },
  ];

  const getStatusColor = (s: string) => {
    switch (s) {
      case 'Confirmed': return 'bg-green-100 text-green-800';
      case 'Pending': return 'bg-amber-100 text-amber-800';
      case 'Cancelled': return 'bg-red-100 text-red-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      <h2 className="text-2xl font-bold text-[#00523a]">Appointments</h2>

      <div className="flex flex-wrap gap-4 mb-4">
        <input type="date" className="border p-2 rounded shadow-sm" />
        <select className="border p-2 rounded shadow-sm"><option>All Doctors</option></select>
        <select className="border p-2 rounded shadow-sm"><option>All Statuses</option></select>
        <select className="border p-2 rounded shadow-sm"><option>All Specialties</option></select>
      </div>

      <div className="bg-white shadow-sm rounded-lg border border-gray-100 overflow-hidden">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50 text-right">
            <tr>
              <th className="px-6 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">ID</th>
              <th className="px-6 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">Patient</th>
              <th className="px-6 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">Doctor</th>
              <th className="px-6 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">Date/Time</th>
              <th className="px-6 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
              <th className="px-6 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">Payment</th>
              <th className="px-6 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {mockAppts.map((appt) => (
              <tr key={appt.id} className="hover:bg-gray-50">
                <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">{appt.id}</td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{appt.patient}</td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{appt.doctor}</td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{appt.datetime}</td>
                <td className="px-6 py-4 whitespace-nowrap">
                  <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${getStatusColor(appt.status)}`}>{appt.status}</span>
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{appt.payment}</td>
                <td className="px-6 py-4 whitespace-nowrap text-sm font-medium space-x-2 space-x-reverse flex">
                  <button className="text-green-600 hover:text-green-900">Confirm</button>
                  <button className="text-red-600 hover:text-red-900">Cancel</button>
                  {appt.payment === 'Unpaid' && (
                    <button onClick={() => setBypassModal(true)} className="text-[#D4AF37] hover:text-amber-600">Bypass</button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {bypassModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 w-full max-w-md">
            <h3 className="text-xl font-bold mb-4 border-b pb-2">Bypass Payment</h3>
            <textarea placeholder="Reason for bypass (Required)" className="w-full border p-2 rounded mb-4" rows={3}></textarea>
            <div className="flex justify-end space-x-3 space-x-reverse">
              <button onClick={() => setBypassModal(false)} className="px-4 py-2 border rounded">Cancel</button>
              <button onClick={() => setBypassModal(false)} className="px-4 py-2 bg-amber-600 text-white rounded">Confirm</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
