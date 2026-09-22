'use client';
import React from 'react';

const prescriptions = [
  { id: 'RX-8821', date: '2026-09-22', patient: 'Patient A', diagnosis: 'Viral URI', medCount: 2, status: 'Active' },
  { id: 'RX-8820', date: '2026-09-21', patient: 'Patient B', diagnosis: 'Hypertension', medCount: 1, status: 'Active' },
  { id: 'RX-8819', date: '2026-09-18', patient: 'Patient C', diagnosis: 'Allergic Rhinitis', medCount: 3, status: 'Completed' },
];

export default function DoctorPrescriptions() {
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-[#00523a] font-serif">Prescriptions</h1>

      <div className="bg-white p-4 rounded-xl shadow-sm border border-gray-100 flex flex-col sm:flex-row gap-4 justify-between items-center">
        <div className="relative w-full sm:w-64">
          <input 
            type="text" 
            placeholder="Search patient..." 
            className="w-full pl-8 pr-4 py-2 border rounded-lg focus:ring-[#006d4e] focus:border-[#006d4e]"
          />
          <span className="absolute left-2.5 top-2.5 text-gray-400">🔍</span>
        </div>
        <div className="flex gap-2 w-full sm:w-auto">
          <input type="date" className="border rounded-md p-2 focus:ring-[#006d4e]" />
        </div>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="bg-gray-50 border-b">
              <tr>
                <th className="p-4 font-semibold text-gray-700">Date</th>
                <th className="p-4 font-semibold text-gray-700">RX ID</th>
                <th className="p-4 font-semibold text-gray-700">Patient</th>
                <th className="p-4 font-semibold text-gray-700">Diagnosis</th>
                <th className="p-4 font-semibold text-gray-700">Meds</th>
                <th className="p-4 font-semibold text-gray-700 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {prescriptions.map(rx => (
                <tr key={rx.id} className="border-b last:border-0 hover:bg-gray-50">
                  <td className="p-4 whitespace-nowrap">{rx.date}</td>
                  <td className="p-4 font-medium">{rx.id}</td>
                  <td className="p-4 font-medium">{rx.patient}</td>
                  <td className="p-4 text-gray-600">{rx.diagnosis}</td>
                  <td className="p-4">
                    <span className="bg-gray-100 text-gray-700 px-2 py-1 rounded text-xs">{rx.medCount} items</span>
                  </td>
                  <td className="p-4 text-right space-x-3">
                    <button className="text-[#006d4e] hover:underline font-medium">View</button>
                    <button className="text-gray-600 hover:underline">Print</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
