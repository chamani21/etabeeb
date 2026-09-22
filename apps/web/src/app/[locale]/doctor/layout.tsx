import React from 'react';
import Link from 'next/link';

export default function DoctorLayout({ children, params: { locale } }: { children: React.ReactNode, params: { locale: string } }) {
  const dir = locale === 'ps' || locale === 'ur' ? 'rtl' : 'ltr';

  return (
    <div className="min-h-screen flex bg-[#e6fff6] text-gray-900 font-sans" dir={dir}>
      {/* Sidebar */}
      <aside className="w-64 bg-[#006d4e] text-white flex-shrink-0 hidden md:flex flex-col">
        <div className="p-4 text-2xl font-bold border-b border-[#00523a] font-serif">eTabeeb</div>
        <nav className="p-4 space-y-2 flex-1">
          <Link href={`/${locale}/doctor/dashboard`} className="block py-2 px-4 rounded hover:bg-[#00523a]">Dashboard</Link>
          <Link href={`/${locale}/doctor/schedule`} className="block py-2 px-4 rounded hover:bg-[#00523a]">Schedule</Link>
          <Link href={`/${locale}/doctor/appointments`} className="block py-2 px-4 rounded hover:bg-[#00523a]">Appointments</Link>
          <Link href={`/${locale}/doctor/patients`} className="block py-2 px-4 rounded hover:bg-[#00523a]">Patients</Link>
          <Link href={`/${locale}/doctor/prescriptions`} className="block py-2 px-4 rounded hover:bg-[#00523a]">Prescriptions</Link>
          <Link href={`/${locale}/doctor/profile`} className="block py-2 px-4 rounded hover:bg-[#00523a]">Profile</Link>
        </nav>
      </aside>

      {/* Main Content */}
      <div className="flex-1 flex flex-col h-screen overflow-hidden">
        {/* Top bar */}
        <header className="bg-white shadow-sm p-4 flex justify-between items-center z-10 relative">
          <div className="md:hidden font-bold text-[#006d4e] font-serif">eTabeeb</div>
          <div className="flex-1"></div>
          <div className="flex items-center gap-4">
            <span className="text-gray-600 cursor-pointer">🔔</span>
            <div className="font-semibold text-[#00523a]">Dr. Ahmad</div>
            <button className="text-sm text-[#ba1a1a] font-medium border border-[#ba1a1a] px-3 py-1 rounded hover:bg-[#ba1a1a] hover:text-white">Logout</button>
          </div>
        </header>

        {/* Content area */}
        <main className="p-6 flex-1 overflow-auto">
          {children}
        </main>
      </div>
    </div>
  );
}
