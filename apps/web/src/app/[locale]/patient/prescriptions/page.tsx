'use client';

import React, { useState } from 'react';

export default function PrescriptionsPage() {
  const [expandedId, setExpandedId] = useState<number | null>(1);

  const prescriptions = [
    {
      id: 1,
      doctor: 'Dr. Sarah Ahmed',
      date: 'Oct 12, 2023',
      diagnosis: 'Hypertension',
      status: 'Active',
      medications: [
        { name: 'Amlodipine', dose: '5mg', frequency: '1x daily', duration: '30 days' },
        { name: 'Lisinopril', dose: '10mg', frequency: '1x daily', duration: '30 days' }
      ]
    },
    {
      id: 2,
      doctor: 'Dr. Usman Ali',
      date: 'Sep 10, 2023',
      diagnosis: 'Viral Infection',
      status: 'Expired',
      medications: [
        { name: 'Paracetamol', dose: '500mg', frequency: '3x daily as needed', duration: '5 days' },
        { name: 'Vitamin C', dose: '1000mg', frequency: '1x daily', duration: '10 days' }
      ]
    }
  ];

  return (
    <>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-[#05201a]">Prescriptions</h1>
        <p className="text-[#5D6F69] text-sm mt-1">View and download your digital prescriptions</p>
      </div>

      <div className="space-y-4">
        {prescriptions.map((px) => (
          <div key={px.id} className="bg-white rounded-xl shadow-sm border border-[#DDE7E2] overflow-hidden">
            <div 
              className="p-4 cursor-pointer hover:bg-gray-50 transition flex justify-between items-start"
              onClick={() => setExpandedId(expandedId === px.id ? null : px.id)}
            >
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <h3 className="font-bold text-[#05201a]">{px.diagnosis}</h3>
                  <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold uppercase ${px.status === 'Active' ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-500'}`}>
                    {px.status}
                  </span>
                </div>
                <p className="text-sm text-[#05201a]">Prescribed by {px.doctor}</p>
                <p className="text-xs text-[#5D6F69] mt-1">{px.date}</p>
              </div>
              <svg className={`w-5 h-5 text-[#5D6F69] transform transition-transform ${expandedId === px.id ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            </div>

            {expandedId === px.id && (
              <div className="px-4 pb-4 pt-2 border-t border-[#DDE7E2] bg-gray-50">
                <h4 className="text-xs font-bold text-[#5D6F69] uppercase tracking-wider mb-2">Medications</h4>
                <div className="space-y-3 mb-4">
                  {px.medications.map((med, idx) => (
                    <div key={idx} className="bg-white p-3 rounded border border-[#DDE7E2]">
                      <div className="font-medium text-[#05201a]">{med.name} <span className="text-sm font-normal text-[#5D6F69]">({med.dose})</span></div>
                      <div className="text-sm text-[#05201a] mt-1">{med.frequency}</div>
                      <div className="text-xs text-[#5D6F69] mt-1">Duration: {med.duration}</div>
                    </div>
                  ))}
                </div>
                
                <div className="flex gap-2">
                  <button className="flex-1 bg-white border border-[#DDE7E2] hover:bg-gray-50 text-[#00523a] py-2 rounded-lg text-sm font-medium transition flex items-center justify-center gap-2 shadow-sm">
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" /></svg>
                    Download PDF
                  </button>
                  <button className="flex-1 bg-[#00523a] hover:bg-[#006d4e] text-white py-2 rounded-lg text-sm font-medium transition flex items-center justify-center gap-2 shadow-sm">
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v1m6 11h2m-6 0h-2v4m0-11v3m0 0h.01M12 12h4.01M16 20h4M4 12h4m12 0h.01M5 8h2a1 1 0 001-1V5a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1zm14 0h2a1 1 0 001-1V5a1 1 0 00-1-1h-2a1 1 0 00-1 1v2a1 1 0 001 1zM5 20h2a1 1 0 001-1v-2a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1z" /></svg>
                    Pharmacy QR
                  </button>
                </div>
              </div>
            )}
          </div>
        ))}
      </div>
    </>
  );
}
