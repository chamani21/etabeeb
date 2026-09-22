'use client';

export default function AdminAudit() {
  const mockAudit = [
    { id: 1, time: '2026-09-22 10:15', user: 'Admin 1', role: 'Super Admin', action: 'Update Settings', resource: 'System', outcome: 'Success' },
    { id: 2, time: '2026-09-22 09:30', user: 'Admin 2', role: 'Admin', action: 'Bypass Payment', resource: 'Appointment A-2001', outcome: 'Success' },
  ];

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      <h2 className="text-2xl font-bold text-[#00523a]">Audit Logs</h2>
      
      <div className="flex gap-4 mb-4">
        <input type="text" placeholder="Search logs..." className="border p-2 rounded shadow-sm flex-1" />
        <select className="border p-2 rounded shadow-sm"><option>All Actions</option></select>
        <input type="date" className="border p-2 rounded shadow-sm" />
      </div>

      <div className="bg-white shadow-sm rounded-lg border border-gray-100 overflow-hidden">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50 text-right">
            <tr>
              <th className="px-6 py-3 text-xs font-medium text-gray-500 uppercase">Timestamp</th>
              <th className="px-6 py-3 text-xs font-medium text-gray-500 uppercase">User</th>
              <th className="px-6 py-3 text-xs font-medium text-gray-500 uppercase">Role</th>
              <th className="px-6 py-3 text-xs font-medium text-gray-500 uppercase">Action</th>
              <th className="px-6 py-3 text-xs font-medium text-gray-500 uppercase">Resource</th>
              <th className="px-6 py-3 text-xs font-medium text-gray-500 uppercase">Outcome</th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {mockAudit.map((log) => (
              <tr key={log.id} className="hover:bg-gray-50">
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{log.time}</td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{log.user}</td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{log.role}</td>
                <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">{log.action}</td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{log.resource}</td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{log.outcome}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
