'use client';

import React, { useState } from 'react';
import Link from 'next/link';

export default function AppointmentsPage() {
  const [activeTab, setActiveTab] = useState<'upcoming' | 'past'>('upcoming');

  const upcomingAppts = [
    {
      id: 1,
      doctor: 'Dr. Sarah Ahmed',
      specialty: 'Cardiologist',
      date: 'Oct 25, 2023',
      time: '10:30 AM',
      status: 'Confirmed'
    }
  ];

  const pastAppts = [
    {
      id: 2,
      doctor: 'Dr. Usman Ali',
      specialty: 'General Physician',
      date: 'Sep 10, 2023',
      time: '02:00 PM',
      status: 'Completed'
    }
  ];

  const displayedAppts = activeTab === 'upcoming' ? upcomingAppts : pastAppts;

  return (
    <>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-[#05201a]">Appointments</h1>
        <button className="bg-[#00523a] text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-[#006d4e] transition">
          + Book New
        </button>
      </div>

      <div className="flex rounded-lg bg-[#e6fff6] p-1 mb-6">
        <button 
          onClick={() => setActiveTab('upcoming')}
          className={`flex-1 py-2 text-sm font-medium rounded-md transition ${activeTab === 'upcoming' ? 'bg-[#00523a] text-white shadow' : 'text-[#05201a]'}`}
        >
          Upcoming
        </button>
        <button 
          onClick={() => setActiveTab('past')}
          className={`flex-1 py-2 text-sm font-medium rounded-md transition ${activeTab === 'past' ? 'bg-[#00523a] text-white shadow' : 'text-[#05201a]'}`}
        >
          Past
        </button>
      </div>

      <div className="space-y-4">
        {displayedAppts.length > 0 ? (
          displayedAppts.map((appt) => (
            <div key={appt.id} className="bg-white rounded-xl shadow-sm border border-[#DDE7E2] p-4">
              <div className="flex justify-between items-start mb-3">
                <div className="flex gap-3 items-center">
                  <div className="w-12 h-12 bg-[#006d4e]/10 text-[#006d4e] rounded-full flex items-center justify-center font-bold text-xl">
                    {appt.doctor.split(' ')[1]?.[0] || 'D'}
                  </div>
                  <div>
                    <h3 className="font-semibold text-[#05201a]">{appt.doctor}</h3>
                    <p className="text-xs text-[#5D6F69]">{appt.specialty}</p>
                  </div>
                </div>
                <span className={`text-xs px-2 py-1 rounded-full font-medium ${appt.status === 'Confirmed' ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-800'}`}>
                  {appt.status}
                </span>
              </div>
              
              <div className="flex items-center gap-4 text-sm text-[#05201a] mb-4 bg-gray-50 p-2 rounded-lg">
                <div className="flex items-center gap-1">
                  <svg className="w-4 h-4 text-[#5D6F69]" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>
                  {appt.date}
                </div>
                <div className="flex items-center gap-1">
                  <svg className="w-4 h-4 text-[#5D6F69]" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                  {appt.time}
                </div>
              </div>

              {activeTab === 'upcoming' && (
                <div className="flex gap-2">
                  <Link href={`consultation/${appt.id}`} className="flex-1 text-center bg-[#00523a] hover:bg-[#006d4e] text-white py-2 rounded-lg text-sm font-medium transition">
                    Join Call
                  </Link>
                  <button className="flex-1 text-center border border-[#DDE7E2] hover:bg-gray-50 text-[#05201a] py-2 rounded-lg text-sm font-medium transition">
                    Cancel
                  </button>
                </div>
              )}
            </div>
          ))
        ) : (
          <div className="text-center py-10 bg-white rounded-xl shadow-sm border border-[#DDE7E2]">
            <svg className="w-12 h-12 text-[#DDE7E2] mx-auto mb-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>
            <h3 className="text-lg font-medium text-[#05201a]">No appointments yet</h3>
            <p className="text-sm text-[#5D6F69] mt-1 mb-4">Book your first appointment with a doctor.</p>
            <button className="bg-[#00523a] text-white px-6 py-2 rounded-lg text-sm font-medium hover:bg-[#006d4e] transition">
              Book Appointment
            </button>
          </div>
        )}
      </div>
    </>
  );
}
