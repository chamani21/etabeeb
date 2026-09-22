'use client';

export default function AdminSettings() {
  return (
    <div className="space-y-6 max-w-4xl mx-auto pb-10">
      <div className="flex justify-between items-center mb-6">
        <h2 className="text-2xl font-bold text-[#00523a]">System Settings</h2>
        <button className="bg-[#00523a] text-white px-6 py-2 rounded font-medium">Save Changes</button>
      </div>

      <div className="bg-white rounded-lg shadow-sm border border-gray-100 p-6 space-y-4">
        <h3 className="text-lg font-bold border-b pb-2">Organization Details</h3>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm text-gray-600 mb-1">Clinic Name</label>
            <input type="text" defaultValue="eTabeeb Clinic" className="w-full border p-2 rounded" />
          </div>
          <div>
            <label className="block text-sm text-gray-600 mb-1">WhatsApp Number</label>
            <input type="text" defaultValue="+92 300 1234567" className="w-full border p-2 rounded" />
          </div>
          <div className="col-span-2">
            <label className="block text-sm text-gray-600 mb-1">Address</label>
            <textarea defaultValue="123 Health Ave, Lahore" className="w-full border p-2 rounded" rows={2}></textarea>
          </div>
        </div>
      </div>

      <div className="bg-white rounded-lg shadow-sm border border-gray-100 p-6 space-y-4">
        <h3 className="text-lg font-bold border-b pb-2">Notification Preferences</h3>
        <div className="space-y-3">
          <label className="flex items-center space-x-3 space-x-reverse">
            <input type="checkbox" defaultChecked className="w-4 h-4 text-[#00523a]" />
            <span>Enable WhatsApp Notifications</span>
          </label>
          <label className="flex items-center space-x-3 space-x-reverse">
            <input type="checkbox" defaultChecked className="w-4 h-4 text-[#00523a]" />
            <span>Enable Email Notifications</span>
          </label>
          <div className="pt-2">
            <label className="block text-sm text-gray-600 mb-1">Reminder Timing (Hours before appt)</label>
            <input type="number" defaultValue="24" className="w-full max-w-xs border p-2 rounded" />
          </div>
        </div>
      </div>

      <div className="bg-white rounded-lg shadow-sm border border-gray-100 p-6 space-y-4">
        <h3 className="text-lg font-bold border-b pb-2">Platform Settings</h3>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm text-gray-600 mb-1">Default Consult Duration (mins)</label>
            <input type="number" defaultValue="15" className="w-full border p-2 rounded" />
          </div>
          <div>
            <label className="block text-sm text-gray-600 mb-1">Max Upload Size (MB)</label>
            <input type="number" defaultValue="10" className="w-full border p-2 rounded" />
          </div>
        </div>
      </div>
    </div>
  );
}
