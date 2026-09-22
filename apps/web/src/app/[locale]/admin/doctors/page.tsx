'use client';
import { useState } from 'react';

export default function AdminDoctors() {
  const [showModal, setShowModal] = useState(false);

  const mockDoctors = [
    { id: 1, name: 'Dr. Ayesha Khan', specialty: 'Cardiology', status: 'Active', published: true, fee: '1500' },
    { id: 2, name: 'Dr. Ali Raza', specialty: 'Dermatology', status: 'Inactive', published: false, fee: '1000' },
  ];

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      <div className="flex justify-between items-center">
        <h2 className="text-2xl font-bold text-[#00523a]">Doctors Management</h2>
        <button onClick={() => setShowModal(true)} className="bg-[#00523a] hover:bg-[#006d4e] text-white px-4 py-2 rounded">
          Add Doctor
        </button>
      </div>

      <div className="bg-white shadow-sm rounded-lg border border-gray-100 overflow-hidden">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50 text-right">
            <tr>
              <th className="px-6 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">Name</th>
              <th className="px-6 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">Specialty</th>
              <th className="px-6 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
              <th className="px-6 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">Published</th>
              <th className="px-6 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">Fee (PKR)</th>
              <th className="px-6 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {mockDoctors.map((doc) => (
              <tr key={doc.id} className="hover:bg-gray-50">
                <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">{doc.name}</td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{doc.specialty}</td>
                <td className="px-6 py-4 whitespace-nowrap">
                  <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${doc.status === 'Active' ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}>
                    {doc.status}
                  </span>
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{doc.published ? 'Yes' : 'No'}</td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{doc.fee}</td>
                <td className="px-6 py-4 whitespace-nowrap text-sm font-medium space-x-2 space-x-reverse">
                  <button className="text-blue-600 hover:text-blue-900">Edit</button>
                  <button className="text-indigo-600 hover:text-indigo-900">Schedule</button>
                  <button className="text-amber-600 hover:text-amber-900">{doc.status === 'Active' ? 'Deactivate' : 'Activate'}</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {showModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 w-full max-w-2xl">
            <h3 className="text-xl font-bold mb-4 border-b pb-2">Add New Doctor</h3>
            <div className="grid grid-cols-2 gap-4">
              <input type="text" placeholder="Name" className="border p-2 rounded" />
              <input type="text" placeholder="Phone" className="border p-2 rounded" />
              <input type="email" placeholder="Email" className="border p-2 rounded" />
              <input type="text" placeholder="Specialty" className="border p-2 rounded" />
              <input type="text" placeholder="Qualifications" className="border p-2 rounded" />
              <input type="text" placeholder="Licence" className="border p-2 rounded" />
              <input type="number" placeholder="Fee" className="border p-2 rounded" />
              <input type="file" className="border p-2 rounded" />
            </div>
            <div className="mt-6 flex justify-end space-x-3 space-x-reverse">
              <button onClick={() => setShowModal(false)} className="px-4 py-2 border rounded">Cancel</button>
              <button onClick={() => setShowModal(false)} className="px-4 py-2 bg-[#00523a] text-white rounded">Save</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
