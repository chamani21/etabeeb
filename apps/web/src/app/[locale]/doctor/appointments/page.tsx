'use client';
import React from 'react';

const appointments = [
  { id: 1, time: '10:00 AM', patient: 'Patient A', complaint: 'Fever and cough', status: 'Completed', type: 'Video' },
  { id: 2, time: '10:20 AM', patient: 'Patient B', complaint: 'Routine checkup', status: 'Confirmed', type: 'Video' },
  { id: 3, time: '10:40 AM', patient: 'Patient C', complaint: 'Blood report review', status: 'Pending', type: 'Audio' },
  { id: 4, time: '11:00 AM', patient: 'Patient D', complaint: 'Headache', status: 'Cancelled', type: 'Video' },
];

export default function DoctorAppointments() {
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-[#00523a] font-serif">Appointments</h1>

      <div className="bg-white p-4 rounded-xl shadow-sm border border-gray-100 flex flex-col sm:flex-row gap-4 justify-between items-center">
        <div className="flex gap-2 items-center w-full sm:w-auto">
          <select className="border rounded-md p-2 focus:ring-[#006d4e] focus:border-[#006d4e] w-full sm:w-auto">
            <option>Today</option>
            <option>This Week</option>
            <option>Custom Date</option>
          </select>
        </div>
        <div className="flex gap-2 overflow-x-auto w-full sm:w-auto">
          {['All', 'Pending', 'Confirmed', 'Completed', 'Cancelled'].map(filter => (
            <button key={filter} className="px-3 py-1.5 text-sm rounded-full border border-gray-200 hover:bg-[#006d4e] hover:text-white transition-colors whitespace-nowrap">
              {filter}
            </button>
          ))}
        </div>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="bg-gray-50 border-b">
              <tr>
                <th className="p-4 font-semibold text-gray-700">Time</th>
                <th className="p-4 font-semibold text-gray-700">Patient</th>
                <th className="p-4 font-semibold text-gray-700">Complaint</th>
                <th className="p-4 font-semibold text-gray-700">Type</th>
                <th className="p-4 font-semibold text-gray-700">Status</th>
                <th className="p-4 font-semibold text-gray-700 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {appointments.map(app => (
                <tr key={app.id} className="border-b last:border-0 hover:bg-gray-50">
                  <td className="p-4 whitespace-nowrap">{app.time}</td>
                  <td className="p-4 font-medium">{app.patient}</td>
                  <td className="p-4 text-gray-600">{app.complaint}</td>
                  <td className="p-4">{app.type}</td>
                  <td className="p-4">
                    <span className={`px-2 py-1 rounded-full text-xs font-medium 
                      ${app.status === 'Completed' ? 'bg-green-100 text-green-700' : 
                        app.status === 'Confirmed' ? 'bg-blue-100 text-blue-700' :
                        app.status === 'Pending' ? 'bg-yellow-100 text-yellow-700' :
                        'bg-red-100 text-red-700'}`}>
                      {app.status}
                    </span>
                  </td>
                  <td className="p-4 text-right space-x-2">
                    <button className="text-sm text-[#006d4e] hover:underline">View</button>
                    {app.status !== 'Completed' && app.status !== 'Cancelled' && (
                      <>
                        <span className="text-gray-300">|</span>
                        <button className="text-sm text-[#006d4e] font-semibold hover:underline">Start</button>
                        <span className="text-gray-300">|</span>
                        <button className="text-sm text-gray-600 hover:underline">Reschedule</button>
                      </>
                    )}
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
