'use client';
import React from 'react';

export default function DoctorSchedule() {
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-[#00523a] font-serif">Schedule Management</h1>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100">
          <h2 className="text-xl font-semibold mb-4 text-[#00523a]">Availability Rules</h2>
          <form className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Available Days</label>
              <div className="flex gap-4 flex-wrap">
                {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map(day => (
                  <label key={day} className="flex items-center gap-2">
                    <input type="checkbox" className="rounded text-[#006d4e] focus:ring-[#006d4e]" />
                    <span>{day}</span>
                  </label>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Start Time</label>
                <input type="time" className="w-full border rounded-md p-2 focus:ring-[#006d4e] focus:border-[#006d4e]" defaultValue="09:00" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">End Time</label>
                <input type="time" className="w-full border rounded-md p-2 focus:ring-[#006d4e] focus:border-[#006d4e]" defaultValue="17:00" />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Consultation Duration</label>
              <select className="w-full border rounded-md p-2 focus:ring-[#006d4e] focus:border-[#006d4e]">
                <option>15 minutes</option>
                <option>20 minutes</option>
                <option>30 minutes</option>
              </select>
            </div>
            
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Consultation Type</label>
              <select className="w-full border rounded-md p-2 focus:ring-[#006d4e] focus:border-[#006d4e]">
                <option>Video & Audio</option>
                <option>Video Only</option>
                <option>Audio Only</option>
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Break Time</label>
              <div className="flex items-center gap-2">
                <input type="time" className="border rounded-md p-2 focus:ring-[#006d4e]" defaultValue="13:00" />
                <span>to</span>
                <input type="time" className="border rounded-md p-2 focus:ring-[#006d4e]" defaultValue="14:00" />
              </div>
            </div>

            <button type="button" className="bg-[#006d4e] text-white px-4 py-2 rounded-md hover:bg-[#00523a]">Save Rules</button>
          </form>
        </div>

        <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100">
          <h2 className="text-xl font-semibold mb-4 text-[#00523a]">Leave / Unavailable Dates</h2>
          <div className="space-y-4">
            <p className="text-sm text-gray-600">Select dates you will be unavailable. Existing appointments may need to be rescheduled.</p>
            <div className="flex items-center gap-2">
              <input type="date" className="border rounded-md p-2 focus:ring-[#006d4e]" />
              <span>to</span>
              <input type="date" className="border rounded-md p-2 focus:ring-[#006d4e]" />
            </div>
            <button type="button" className="bg-[#006d4e] text-white px-4 py-2 rounded-md hover:bg-[#00523a]">Add Leave</button>
          </div>

          <h3 className="text-lg font-semibold mt-6 mb-2 text-gray-800">Upcoming Leaves</h3>
          <ul className="space-y-2">
            <li className="flex justify-between items-center p-3 bg-gray-50 border rounded-lg">
              <span>Oct 15, 2026 - Oct 18, 2026</span>
              <button className="text-red-600 hover:underline text-sm">Remove</button>
            </li>
          </ul>
        </div>
      </div>
    </div>
  );
}
