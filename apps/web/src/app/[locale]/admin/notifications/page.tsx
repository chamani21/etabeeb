'use client';
import { useState } from 'react';

export default function AdminNotifications() {
  const [activeTab, setActiveTab] = useState('whatsapp');

  const mockNotifs = [
    { id: 1, recipient: '+92 300 1234567', template: 'appointment_reminder', channel: 'WhatsApp', status: 'Sent', time: '10 mins ago' },
    { id: 2, recipient: 'bilal@test.com', template: 'payment_receipt', channel: 'Email', status: 'Failed', time: '1 hour ago' },
  ];

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      <div className="flex justify-between items-center">
        <h2 className="text-2xl font-bold text-[#00523a]">Notifications Log</h2>
        <button className="bg-[#00523a] text-white px-4 py-2 rounded">Send Manual</button>
      </div>

      <div className="flex space-x-4 space-x-reverse border-b">
        {['whatsapp', 'email', 'in-app'].map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`pb-2 px-2 capitalize ${activeTab === tab ? 'border-b-2 border-[#00523a] text-[#00523a] font-bold' : 'text-gray-500'}`}
          >
            {tab}
          </button>
        ))}
      </div>

      <div className="bg-white shadow-sm rounded-lg border border-gray-100 overflow-hidden mt-4">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50 text-right">
            <tr>
              <th className="px-6 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">Recipient</th>
              <th className="px-6 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">Template</th>
              <th className="px-6 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">Channel</th>
              <th className="px-6 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
              <th className="px-6 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">Time</th>
              <th className="px-6 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">Action</th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {mockNotifs.filter(n => n.channel.toLowerCase() === activeTab || activeTab === 'all').map((n) => (
              <tr key={n.id} className="hover:bg-gray-50">
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{n.recipient}</td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{n.template}</td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{n.channel}</td>
                <td className="px-6 py-4 whitespace-nowrap">
                  <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${n.status === 'Sent' ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}>{n.status}</span>
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{n.time}</td>
                <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                  {n.status === 'Failed' && <button className="text-blue-600 hover:text-blue-900">Retry</button>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
