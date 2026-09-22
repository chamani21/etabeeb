'use client';

export default function AdminDashboard() {
  const stats = [
    { label: "Today's Appointments", value: 12 },
    { label: "Active Doctors", value: 6 },
    { label: "Total Patients", value: 234 },
    { label: "Completed Today", value: 8 },
    { label: "Cancelled", value: 1 },
    { label: "No Shows", value: 0 },
    { label: "Pending Payments", value: 3 },
    { label: "Failed Notifications", value: 1 },
  ];

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      <h2 className="text-2xl font-bold text-[#00523a]">Dashboard</h2>
      
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {stats.map((stat, i) => (
          <div key={i} className="bg-white p-6 rounded-lg shadow-sm border border-gray-100 flex flex-col">
            <span className="text-gray-500 text-sm font-medium">{stat.label}</span>
            <span className="text-3xl font-bold text-[#00523a] mt-2">{stat.value}</span>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mt-6">
        <div className="lg:col-span-2 bg-white rounded-lg shadow-sm border border-gray-100 p-6">
          <h3 className="text-lg font-semibold text-gray-800 border-b pb-3 mb-4">Recent Activity</h3>
          <ul className="space-y-4">
            {[1, 2, 3].map((_, i) => (
              <li key={i} className="flex items-start">
                <div className="w-2 h-2 mt-2 rounded-full bg-[#D4AF37] ml-3"></div>
                <div>
                  <p className="text-sm text-gray-800">Dr. Smith completed an appointment with Patient ID #12{i}</p>
                  <span className="text-xs text-gray-500">10 mins ago</span>
                </div>
              </li>
            ))}
          </ul>
        </div>
        
        <div className="bg-white rounded-lg shadow-sm border border-gray-100 p-6">
          <h3 className="text-lg font-semibold text-gray-800 border-b pb-3 mb-4">Quick Actions</h3>
          <div className="space-y-3">
            <button className="w-full bg-[#00523a] hover:bg-[#006d4e] text-white py-2 px-4 rounded transition-colors text-right">Add Doctor</button>
            <button className="w-full border border-[#00523a] text-[#00523a] hover:bg-[#e6fff6] py-2 px-4 rounded transition-colors text-right">Manual Booking</button>
            <button className="w-full border border-[#00523a] text-[#00523a] hover:bg-[#e6fff6] py-2 px-4 rounded transition-colors text-right">Send Notification</button>
          </div>
        </div>
      </div>
    </div>
  );
}
