import React from 'react';
import Link from 'next/link';
import { redirect } from 'next/navigation';

export default async function PatientLayout({
  children,
  params: { locale }
}: {
  children: React.ReactNode;
  params: { locale: string };
}) {
  // Mock session check
  const isAuthenticated = true;
  if (!isAuthenticated) {
    redirect(`/${locale}/login`);
  }

  return (
    <div className="flex flex-col min-h-screen bg-[#e6fff6] text-[#05201a] font-sans rtl" dir="rtl">
      <header className="sticky top-0 z-50 bg-[#00523a] text-white px-4 py-3 flex items-center justify-between shadow-md">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 bg-white/20 rounded-full flex items-center justify-center font-bold">
            eT
          </div>
          <span className="font-semibold text-lg">eTabeeb</span>
        </div>
        <div className="flex items-center gap-3">
          <button className="relative p-2 rounded-full bg-white/10 hover:bg-white/20 transition">
            <span className="sr-only">Notifications</span>
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
            </svg>
            <span className="absolute top-1 right-1 w-2 h-2 bg-red-500 rounded-full"></span>
          </button>
          <div className="text-sm font-medium">John Doe</div>
        </div>
      </header>

      <main className="flex-1 pb-20">
        <div className="max-w-md mx-auto p-4 space-y-6">
          {children}
        </div>
      </main>

      <nav className="fixed bottom-0 left-0 right-0 bg-white border-t border-[#DDE7E2] z-50">
        <div className="max-w-md mx-auto flex justify-around p-2">
          <Link href={`/${locale}/patient/dashboard`} className="flex flex-col items-center p-2 text-[#5D6F69] hover:text-[#00523a]">
            <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
            </svg>
            <span className="text-xs mt-1">Dashboard</span>
          </Link>
          <Link href={`/${locale}/patient/appointments`} className="flex flex-col items-center p-2 text-[#5D6F69] hover:text-[#00523a]">
            <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
            </svg>
            <span className="text-xs mt-1">Appts</span>
          </Link>
          <Link href={`/${locale}/patient/prescriptions`} className="flex flex-col items-center p-2 text-[#5D6F69] hover:text-[#00523a]">
            <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
            </svg>
            <span className="text-xs mt-1">Scripts</span>
          </Link>
          <Link href={`/${locale}/patient/profile`} className="flex flex-col items-center p-2 text-[#5D6F69] hover:text-[#00523a]">
            <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
            </svg>
            <span className="text-xs mt-1">Profile</span>
          </Link>
        </div>
      </nav>
    </div>
  );
}
