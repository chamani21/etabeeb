'use client';

export default function AdminReports() {
  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      <div className="flex justify-between items-center">
        <h2 className="text-2xl font-bold text-[#00523a]">Reports & Analytics</h2>
        <button className="border border-[#00523a] text-[#00523a] px-4 py-2 rounded flex items-center gap-2">
          Export CSV
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-100 h-64 flex flex-col items-center justify-center">
          <p className="text-gray-500 font-medium">Appointment Stats Chart (Placeholder)</p>
          <div className="w-full h-32 mt-4 bg-gray-100 flex items-end justify-around px-4">
            <div className="w-8 bg-[#00523a] h-12"></div>
            <div className="w-8 bg-[#00523a] h-24"></div>
            <div className="w-8 bg-[#00523a] h-16"></div>
            <div className="w-8 bg-[#00523a] h-20"></div>
          </div>
        </div>

        <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-100">
          <h3 className="text-lg font-bold mb-4 border-b pb-2">Revenue Summary</h3>
          <ul className="space-y-3">
            <li className="flex justify-between"><span>Total Revenue (MTD)</span> <span className="font-bold">PKR 450,000</span></li>
            <li className="flex justify-between"><span>By Dr. Ayesha</span> <span>PKR 200,000</span></li>
            <li className="flex justify-between"><span>By Dr. Ali</span> <span>PKR 150,000</span></li>
          </ul>
        </div>

        <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-100 h-64 flex flex-col items-center justify-center">
          <p className="text-gray-500 font-medium">Patient Registration Trend (Placeholder)</p>
        </div>

        <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-100">
          <h3 className="text-lg font-bold mb-4 border-b pb-2">Doctor Performance</h3>
          <table className="w-full text-right text-sm">
            <thead>
              <tr className="text-gray-500 border-b">
                <th className="pb-2">Doctor</th>
                <th className="pb-2">Appts Completed</th>
                <th className="pb-2">Avg Consult Time</th>
              </tr>
            </thead>
            <tbody>
              <tr className="border-b">
                <td className="py-2">Dr. Ayesha</td>
                <td>45</td>
                <td>12m 30s</td>
              </tr>
              <tr>
                <td className="py-2">Dr. Ali</td>
                <td>32</td>
                <td>15m 10s</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
