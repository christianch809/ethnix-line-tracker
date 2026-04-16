import React, { useState } from 'react';
import { Link, useLocation } from 'react-router-dom';

const navItems = [
  { path: '/', label: 'Dashboard', icon: '📊' },
  { path: '/headcount', label: 'Headcount', icon: '👥' },
  { path: '/lines', label: 'Lines', icon: '📱' },
  { path: '/devices', label: 'Devices', icon: '💻' },
  { path: '/invoices', label: 'Invoices', icon: '📄' },
  { path: '/audit', label: 'Audit Log', icon: '📋' },
];

export default function Layout({ user, onLogout, children }) {
  const location = useLocation();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  return (
    <div className="min-h-screen flex">
      {/* Mobile overlay */}
      {sidebarOpen && (
        <div className="fixed inset-0 bg-black/50 z-20 lg:hidden" onClick={() => setSidebarOpen(false)} />
      )}

      {/* Sidebar */}
      <aside className={`fixed lg:static inset-y-0 left-0 z-30 w-64 bg-blue-900 text-white transform transition-transform lg:translate-x-0 ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'}`}>
        <div className="p-6 border-b border-blue-800">
          <h1 className="text-xl font-bold">Ethnix Group</h1>
          <p className="text-blue-300 text-sm mt-1">Line & Device Tracker</p>
        </div>
        <nav className="p-4 space-y-1">
          {navItems.map(item => (
            <Link
              key={item.path}
              to={item.path}
              onClick={() => setSidebarOpen(false)}
              className={`flex items-center gap-3 px-4 py-3 rounded-lg transition ${
                location.pathname === item.path
                  ? 'bg-blue-700 text-white'
                  : 'text-blue-200 hover:bg-blue-800'
              }`}
            >
              <span>{item.icon}</span>
              <span>{item.label}</span>
            </Link>
          ))}
        </nav>
        <div className="absolute bottom-0 left-0 right-0 p-4 border-t border-blue-800">
          <div className="flex items-center justify-between">
            <span className="text-sm text-blue-300">{user}</span>
            <button onClick={onLogout} className="text-sm text-blue-400 hover:text-white transition">
              Logout
            </button>
          </div>
        </div>
      </aside>

      {/* Main */}
      <div className="flex-1 flex flex-col min-w-0">
        <header className="bg-white shadow-sm px-6 py-4 flex items-center lg:hidden">
          <button onClick={() => setSidebarOpen(true)} className="text-gray-600 text-2xl mr-4">☰</button>
          <h1 className="text-lg font-semibold text-gray-800">Ethnix Group</h1>
        </header>
        <main className="flex-1 p-6 overflow-auto">
          {children}
        </main>
      </div>
    </div>
  );
}
