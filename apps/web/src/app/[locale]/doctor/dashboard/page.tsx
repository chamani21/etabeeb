'use client';
import React from 'react';
import Link from 'next/link';

const stats = [
  { label: 'Total Appointments', value: 8 },
  { label: 'Waiting', value: 3 },
  { label: 'Completed', value: 4 },
  { label: 'Follow-ups', value: 2 },
];

const queue = [
  { id: 1, time: '10:00', name: 'Patient A', status: 'Waiting', complaint: 'Fever and cough' },
  { id: 2, time: '10:20', name: 'Patient B', status: 'Confirmed', complaint: 'Routine checkup' },
  { id: 3, time: '10:40', name: 'Patient C', status: 'Follow-up', complaint: 'Blood report review' },
];

export default function DoctorDashboard() {
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-[#00523a] font-serif">Today's Overview</h1>
      
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {stats.map((s, idx) => (
          <div key={idx} className="bg-white p-4 rounded-xl shadow-sm border border-gray-100">
            <div className="text-gray-500 text-sm">{s.label}</div>
            <div className="text-3xl font-bold text-[#006d4e] mt-1">{s.value}</div>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 bg-white rounded-xl shadow-sm border border-gray-100 p-6">
          <h2 className="text-xl font-semibold mb-4 text-[#00523a]">Patient Queue</h2>
          <div className="space-y-4">
            {queue.map((q) => (
              <div key={q.id} className="flex flex-col md:flex-row items-center justify-between p-4 border rounded-lg bg-[#e6fff6]/30">
                <div>
                  <div className="font-semibold text-lg">{q.name}</div>
                  <div className="text-sm text-gray-600">{q.time} • {q.status}</div>
                  <div className="text-sm text-gray-500 mt-1">CC: {q.complaint}</div>
                </div>
                <div className="flex flex-wrap gap-2 mt-4 md:mt-0">
                  <button className="px-3 py-1.5 text-sm border border-[#006d4e] text-[#006d4e] rounded-md hover:bg-[#006d4e] hover:text-white transition-colors">Open Patient</button>
                  <Link href={`consultation/${q.id}`} className="px-3 py-1.5 text-sm bg-[#006d4e] text-white rounded-md hover:bg-[#00523a] transition-colors">Start Consultation</Link>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
          <h2 className="text-xl font-semibold mb-4 text-[#00523a]">Notifications</h2>
          <ul className="space-y-3">
            <li className="text-sm p-3 bg-gray-50 rounded-lg border-l-4 border-[#006d4e]">New appointment booked by Patient D for tomorrow.</li>
            <li className="text-sm p-3 bg-gray-50 rounded-lg border-l-4 border-blue-500">Lab results for Patient E are ready.</li>
            <li className="text-sm p-3 bg-gray-50 rounded-lg border-l-4 border-yellow-500">Reminder: Update schedule for next week.</li>
          </ul>
        </div>
      </div>
    </div>
  );
}
