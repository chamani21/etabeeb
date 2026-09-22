'use client';
import React from 'react';

export default function DoctorProfile() {
  return (
    <div className="space-y-6 max-w-4xl mx-auto">
      <h1 className="text-2xl font-bold text-[#00523a] font-serif">Doctor Profile</h1>

      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="p-6 border-b bg-gray-50">
          <div className="flex items-center gap-6">
            <div className="w-24 h-24 bg-gray-200 rounded-full flex items-center justify-center text-gray-400 overflow-hidden relative">
              <span className="text-3xl">👤</span>
              <div className="absolute inset-0 bg-black/40 flex items-center justify-center opacity-0 hover:opacity-100 transition-opacity cursor-pointer text-white text-xs font-semibold">
                Upload
              </div>
            </div>
            <div>
              <h2 className="text-xl font-bold text-gray-900">Dr. Ahmad</h2>
              <p className="text-[#006d4e] font-medium">Cardiologist</p>
            </div>
          </div>
        </div>

        <form className="p-6 space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Name (English)</label>
              <input type="text" className="w-full border rounded-md p-2 focus:ring-[#006d4e] focus:border-[#006d4e]" defaultValue="Dr. Ahmad" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Name (Urdu)</label>
              <input type="text" className="w-full border rounded-md p-2 focus:ring-[#006d4e] focus:border-[#006d4e]" defaultValue="ڈاکٹر احمد" dir="rtl" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Name (Pashto)</label>
              <input type="text" className="w-full border rounded-md p-2 focus:ring-[#006d4e] focus:border-[#006d4e]" defaultValue="ډاکټر احمد" dir="rtl" />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Specialty</label>
              <select className="w-full border rounded-md p-2 focus:ring-[#006d4e] focus:border-[#006d4e]">
                <option>Cardiology</option>
                <option>General Practice</option>
                <option>Pediatrics</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Licence Number</label>
              <input type="text" className="w-full border rounded-md p-2 focus:ring-[#006d4e] focus:border-[#006d4e]" defaultValue="AMC-12345" />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Qualifications</label>
            <input type="text" className="w-full border rounded-md p-2 focus:ring-[#006d4e] focus:border-[#006d4e]" defaultValue="MBBS, MD (Cardiology)" />
          </div>
          
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Consultation Fee (in AFN)</label>
            <input type="number" className="w-full border rounded-md p-2 focus:ring-[#006d4e] focus:border-[#006d4e]" defaultValue="1000" />
            <p className="text-xs text-gray-500 mt-1">Represented in integer minor units in DB, but displayed in AFN.</p>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Professional Bio</label>
            <textarea rows={4} className="w-full border rounded-md p-2 focus:ring-[#006d4e] focus:border-[#006d4e]" defaultValue="Experienced cardiologist with over 10 years of practice..." />
          </div>

          <div className="flex justify-end pt-4 border-t">
            <button type="button" className="bg-[#006d4e] text-white px-6 py-2 rounded-lg font-medium hover:bg-[#00523a]">
              Save Changes
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
