'use client';

export default function AdminPatients() {
  const mockPatients = [
    { id: 'P-101', name: 'Bilal Ahmed', phone: '+92 300 1234567', email: 'bilal@test.com', registered: '2026-01-10', appointments: 3, status: 'Active' },
    { id: 'P-102', name: 'Zainab Bibi', phone: '+92 321 7654321', email: 'zainab@test.com', registered: '2026-03-22', appointments: 1, status: 'Active' },
  ];

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      <h2 className="text-2xl font-bold text-[#00523a]">Patients Directory</h2>

      <div className="flex gap-4 mb-6">
        <input type="text" placeholder="Search by name, phone, email, ID..." className="border p-2 rounded w-full max-w-md shadow-sm" />
        <button className="bg-[#00523a] text-white px-4 py-2 rounded">Search</button>
      </div>

      <div className="bg-white shadow-sm rounded-lg border border-gray-100 overflow-hidden">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50 text-right">
            <tr>
              <th className="px-6 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">Patient ID</th>
              <th className="px-6 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">Name</th>
              <th className="px-6 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">Phone / Email</th>
              <th className="px-6 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">Registered</th>
              <th className="px-6 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">Total Appts</th>
              <th className="px-6 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {mockPatients.map((patient) => (
              <tr key={patient.id} className="hover:bg-gray-50 cursor-pointer">
                <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">{patient.id}</td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{patient.name}</td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                  <div>{patient.phone}</div>
                  <div className="text-xs text-gray-400">{patient.email}</div>
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{patient.registered}</td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{patient.appointments}</td>
                <td className="px-6 py-4 whitespace-nowrap">
                  <span className="px-2 inline-flex text-xs leading-5 font-semibold rounded-full bg-green-100 text-green-800">
                    {patient.status}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
