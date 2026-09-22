'use client';
import React, { useState } from 'react';

export default function ConsultationWorkspace({ params }: { params: { id: string } }) {
  const [activeTab, setActiveTab] = useState('complaint');

  const tabs = [
    { id: 'complaint', label: 'Chief Complaint' },
    { id: 'hpi', label: 'HPI' },
    { id: 'exam', label: 'Examination' },
    { id: 'diagnosis', label: 'Diagnosis' },
    { id: 'plan', label: 'Plan' },
    { id: 'prescription', label: 'Prescription' },
    { id: 'notes', label: 'Private Notes' }
  ];

  return (
    <div className="flex flex-col lg:flex-row h-full gap-4 -m-2">
      {/* LEFT: Patient Summary */}
      <div className="w-full lg:w-1/4 bg-white rounded-xl shadow-sm border border-gray-100 p-4 flex flex-col h-[calc(100vh-8rem)] overflow-y-auto">
        <h2 className="font-bold text-[#00523a] mb-4 pb-2 border-b">Patient Summary</h2>
        <div className="space-y-4 text-sm">
          <div>
            <div className="text-gray-500">Name</div>
            <div className="font-semibold text-base">Patient A (32, M)</div>
          </div>
          <div>
            <div className="text-gray-500">Allergies</div>
            <div className="text-red-600 font-medium">Penicillin</div>
          </div>
          <div>
            <div className="text-gray-500">Current Medications</div>
            <div>Lisinopril 10mg</div>
          </div>
          <div>
            <div className="text-gray-500">Previous Visits</div>
            <ul className="mt-1 space-y-1">
              <li className="text-[#006d4e] hover:underline cursor-pointer">2026-08-15 - Hypertension</li>
              <li className="text-[#006d4e] hover:underline cursor-pointer">2026-05-10 - General Checkup</li>
            </ul>
          </div>
          <div>
            <div className="text-gray-500">Uploaded Reports</div>
            <ul className="mt-1 space-y-1">
              <li className="flex items-center gap-2">📄 <span className="text-[#006d4e] hover:underline cursor-pointer">CBC_Report.pdf</span></li>
            </ul>
          </div>
        </div>
      </div>

      {/* CENTER: Video Consultation */}
      <div className="w-full lg:w-2/4 bg-gray-900 rounded-xl shadow-sm flex flex-col overflow-hidden h-[60vh] lg:h-[calc(100vh-8rem)] relative">
        <div className="flex-1 flex items-center justify-center text-white relative">
          <div className="absolute top-4 left-4 bg-black/50 px-2 py-1 rounded text-sm flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-red-500 animate-pulse"></div>
            05:23
          </div>
          {/* Placeholder for LiveKit Video Track */}
          <div className="text-gray-500">LiveKit Video Stream Placeholder</div>
          {/* Self View PIP */}
          <div className="absolute bottom-20 right-4 w-32 h-24 bg-gray-800 rounded-lg border-2 border-gray-600 flex items-center justify-center text-xs text-gray-400">
            Self View
          </div>
        </div>
        
        {/* Controls */}
        <div className="bg-gray-900 border-t border-gray-800 p-4 flex justify-center gap-4">
          <button className="w-12 h-12 rounded-full bg-gray-700 hover:bg-gray-600 flex items-center justify-center text-white">🎤</button>
          <button className="w-12 h-12 rounded-full bg-gray-700 hover:bg-gray-600 flex items-center justify-center text-white">📷</button>
          <button className="w-12 h-12 rounded-full bg-gray-700 hover:bg-gray-600 flex items-center justify-center text-white">💻</button>
          <button className="w-12 h-12 rounded-full bg-red-600 hover:bg-red-700 flex items-center justify-center text-white font-bold">End</button>
        </div>
      </div>

      {/* RIGHT: Clinical Documentation */}
      <div className="w-full lg:w-1/4 bg-white rounded-xl shadow-sm border border-gray-100 flex flex-col h-[calc(100vh-8rem)]">
        <div className="p-4 border-b flex justify-between items-center bg-gray-50 rounded-t-xl">
          <h2 className="font-bold text-[#00523a]">Documentation</h2>
          <span className="text-xs text-gray-400">Auto-saving...</span>
        </div>
        
        <div className="flex overflow-x-auto border-b">
          {tabs.map(tab => (
            <button 
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`px-4 py-2 text-sm whitespace-nowrap border-b-2 ${activeTab === tab.id ? 'border-[#006d4e] text-[#006d4e] font-semibold' : 'border-transparent text-gray-500 hover:bg-gray-50'}`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        <div className="flex-1 p-4 overflow-y-auto">
          {activeTab === 'complaint' && (
            <textarea className="w-full h-full border-0 resize-none focus:ring-0 p-0 text-sm" placeholder="Enter Chief Complaint..." defaultValue="Fever and cough for 3 days." />
          )}
          {activeTab === 'prescription' && (
            <div className="space-y-4">
              <div className="flex gap-2">
                <input type="text" placeholder="Medicine name" className="flex-1 border rounded p-2 text-sm" />
                <button className="bg-[#006d4e] text-white px-3 rounded">+</button>
              </div>
              <ul className="space-y-2">
                <li className="text-sm p-2 bg-gray-50 rounded border flex justify-between items-center">
                  <div>
                    <div className="font-medium">Paracetamol 500mg</div>
                    <div className="text-gray-500 text-xs">1 tablet, 3 times a day, for 5 days</div>
                  </div>
                  <button className="text-red-500">×</button>
                </li>
              </ul>
            </div>
          )}
          {activeTab !== 'complaint' && activeTab !== 'prescription' && (
            <textarea className="w-full h-full border-0 resize-none focus:ring-0 p-0 text-sm" placeholder={`Enter ${tabs.find(t => t.id === activeTab)?.label}...`} />
          )}
        </div>

        <div className="p-4 border-t bg-gray-50 rounded-b-xl">
          <button className="w-full bg-[#006d4e] text-white py-2 rounded-lg font-medium hover:bg-[#00523a]">
            Finalize & Sign
          </button>
        </div>
      </div>
    </div>
  );
}
