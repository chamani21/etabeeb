import Link from 'next/link';

export default function AdminLayout({
  children,
  params: { locale },
}: {
  children: React.ReactNode;
  params: { locale: string };
}) {
  const menuItems = [
    { name: 'Dashboard', href: `/${locale}/admin/dashboard` },
    { name: 'Doctors', href: `/${locale}/admin/doctors` },
    { name: 'Patients', href: `/${locale}/admin/patients` },
    { name: 'Appointments', href: `/${locale}/admin/appointments` },
    { name: 'Schedules', href: `/${locale}/admin/schedules` },
    { name: 'Notifications', href: `/${locale}/admin/notifications` },
    { name: 'Reports', href: `/${locale}/admin/reports` },
    { name: 'Audit', href: `/${locale}/admin/audit` },
    { name: 'Settings', href: `/${locale}/admin/settings` },
  ];

  return (
    <div className="flex h-screen bg-gray-50 text-gray-900 font-sans">
      <aside className="w-64 bg-[#0B3D2E] text-white flex flex-col">
        <div className="p-6 border-b border-white/10">
          <h2 className="text-2xl font-bold text-[#D4AF37]">eTabeeb Admin</h2>
        </div>
        <nav className="flex-1 overflow-y-auto py-4">
          <ul className="space-y-1">
            {menuItems.map((item) => (
              <li key={item.name}>
                <Link
                  href={item.href}
                  className="block px-6 py-3 hover:bg-white/10 hover:text-[#D4AF37] transition-colors"
                >
                  {item.name}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
      </aside>

      <main className="flex-1 flex flex-col min-w-0">
        <header className="bg-white border-b border-gray-200 px-6 py-4 flex justify-between items-center h-16 shadow-sm">
          <h1 className="text-xl font-semibold text-gray-800">Operational Control Center</h1>
          <div className="flex items-center space-x-4 space-x-reverse">
            <span className="text-sm font-medium">Admin User</span>
            <button className="text-sm text-red-600 hover:text-red-800 border border-red-200 px-3 py-1 rounded">Logout</button>
          </div>
        </header>
        <div className="flex-1 overflow-y-auto p-6 bg-[#e6fff6]">
          {children}
        </div>
      </main>
    </div>
  );
}
