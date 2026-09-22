'use client';

import React, { useState } from 'react';
import Link from 'next/link';

export default function PatientDashboard() {
  const [patientName] = useState('John Doe');

  return (
    <>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-[#05201a]">Welcome back, {patientName}!</h1>
        <p className="text-[#5D6F69] mt-1">Here is your health summary</p>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-[#DDE7E2] p-4 mb-4">
        <h2 className="text-lg font-bold text-[#00523a] mb-3">Next Appointment</h2>
        <div className="flex gap-4 items-center">
          <div className="w-12 h-12 bg-[#006d4e] text-white rounded-full flex items-center justify-center font-bold text-xl">
            SA
          </div>
          <div className="flex-1">
            <h3 className="font-semibold text-[#05201a]">Dr. Sarah Ahmed</h3>
            <p className="text-sm text-[#5D6F69]">Cardiologist</p>
            <p className="text-sm font-medium mt-1">Tomorrow, 10:30 AM</p>
          </div>
        </div>
        <div className="mt-4 flex gap-2">
          <button className="flex-1 bg-[#00523a] hover:bg-[#006d4e] text-white py-2 rounded-lg font-medium transition">
            Join Video
          </button>
          <button className="flex-1 border border-[#DDE7E2] hover:bg-[#e6fff6] text-[#00523a] py-2 rounded-lg font-medium transition">
            Reschedule
          </button>
        </div>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-[#DDE7E2] p-4 mb-4">
        <div className="flex justify-between items-center mb-3">
          <h2 className="text-lg font-bold text-[#00523a]">Quick Actions</h2>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Link href="appointments" className="bg-[#e6fff6] p-3 rounded-lg flex flex-col items-center justify-center text-center gap-2 hover:bg-[#006d4e] hover:text-white transition text-[#00523a] border border-[#00523a]/20">
            <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>
            <span className="font-medium text-sm">Book Appt</span>
          </Link>
          <Link href="records" className="bg-[#e6fff6] p-3 rounded-lg flex flex-col items-center justify-center text-center gap-2 hover:bg-[#006d4e] hover:text-white transition text-[#00523a] border border-[#00523a]/20">
            <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" /></svg>
            <span className="font-medium text-sm">Upload Report</span>
          </Link>
          <Link href="prescriptions" className="bg-[#e6fff6] p-3 rounded-lg flex flex-col items-center justify-center text-center gap-2 hover:bg-[#006d4e] hover:text-white transition text-[#00523a] border border-[#00523a]/20">
            <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" /></svg>
            <span className="font-medium text-sm">Prescriptions</span>
          </Link>
          <Link href="profile" className="bg-[#e6fff6] p-3 rounded-lg flex flex-col items-center justify-center text-center gap-2 hover:bg-[#006d4e] hover:text-white transition text-[#00523a] border border-[#00523a]/20">
            <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" /></svg>
            <span className="font-medium text-sm">My Profile</span>
          </Link>
        </div>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-[#DDE7E2] p-4 mb-4">
        <h2 className="text-lg font-bold text-[#00523a] mb-3">Recent Prescriptions</h2>
        <div className="space-y-3">
          {[1, 2].map((i) => (
            <div key={i} className="flex items-center justify-between p-3 border border-[#DDE7E2] rounded-lg">
              <div>
                <h3 className="font-medium text-[#05201a]">Hypertension Meds</h3>
                <p className="text-xs text-[#5D6F69]">Dr. Sarah Ahmed • Oct 12, 2023</p>
              </div>
              <button className="text-[#00523a] p-2 bg-[#e6fff6] rounded-full hover:bg-[#006d4e] hover:text-white transition">
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" /></svg>
              </button>
            </div>
          ))}
        </div>
      </div>

      <div className="bg-[#ba1a1a]/10 rounded-xl shadow-sm border border-[#ba1a1a]/20 p-4 mb-4 flex items-start gap-3">
        <svg className="w-6 h-6 text-[#ba1a1a] flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
        <div>
          <h2 className="text-md font-bold text-[#ba1a1a]">Pending Follow-up</h2>
          <p className="text-sm text-[#05201a] mt-1">Dr. Ali suggests a follow-up for your recent lab results by next week.</p>
          <button className="mt-2 text-sm font-medium text-[#ba1a1a] underline hover:text-red-800">
            Book Follow-up Now
          </button>
        </div>
      </div>
    </>
  );
}
