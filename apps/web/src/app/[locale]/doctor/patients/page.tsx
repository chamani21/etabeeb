'use client';
import React from 'react';

const patients = [
  { id: 'PT-1001', name: 'Ahmad Khan', phone: '+93 70 123 4567', lastVisit: '2026-09-15', totalVisits: 3 },
  { id: 'PT-1002', name: 'Zahra Ali', phone: '+93 79 987 6543', lastVisit: '2026-09-20', totalVisits: 1 },
  { id: 'PT-1003', name: 'Mohammad Omar', phone: '+93 78 555 1234', lastVisit: '2026-08-10', totalVisits: 5 },
];

export default function DoctorPatients() {
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-[#00523a] font-serif">Patients Directory</h1>

      <div className="bg-white p-4 rounded-xl shadow-sm border border-gray-100">
        <div className="relative">
          <input 
            type="text" 
            placeholder="Search by name, phone, or patient ID..." 
            className="w-full pl-10 pr-4 py-2 border rounded-lg focus:ring-[#006d4e] focus:border-[#006d4e]"
          />
          <span className="absolute left-3 top-2.5 text-gray-400">🔍</span>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {patients.map(p => (
          <div key={p.id} className="bg-white p-5 rounded-xl shadow-sm border border-gray-100 hover:shadow-md transition-shadow cursor-pointer">
            <div className="flex justify-between items-start mb-4">
              <div>
                <h3 className="font-semibold text-lg text-gray-900">{p.name}</h3>
                <p className="text-sm text-gray-500">{p.id}</p>
              </div>
              <div className="bg-[#e6fff6] text-[#00523a] px-2 py-1 rounded text-xs font-medium">
                {p.totalVisits} Visits
              </div>
            </div>
            
            <div className="space-y-2 text-sm text-gray-600">
              <div className="flex justify-between">
                <span>Phone:</span>
                <span className="font-medium text-gray-800">{p.phone}</span>
              </div>
              <div className="flex justify-between">
                <span>Last Visit:</span>
                <span className="font-medium text-gray-800">{p.lastVisit}</span>
              </div>
            </div>
            
            <div className="mt-4 pt-4 border-t flex justify-end">
              <button className="text-[#006d4e] hover:underline text-sm font-medium">View Full Profile →</button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
