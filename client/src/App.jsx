import React, { useState } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import Login from './components/Login';
import Layout from './components/Layout';
import Dashboard from './components/Dashboard';
import Lines from './components/Lines';
import Devices from './components/Devices';
import Invoices from './components/Invoices';
import InvoiceDetail from './components/InvoiceDetail';
import AuditLog from './components/AuditLog';

export default function App() {
  const [user, setUser] = useState(localStorage.getItem('ethnix_user') || '');

  const handleLogin = (name) => {
    localStorage.setItem('ethnix_user', name);
    setUser(name);
  };

  const handleLogout = () => {
    localStorage.removeItem('ethnix_user');
    setUser('');
  };

  if (!user) return <Login onLogin={handleLogin} />;

  return (
    <Layout user={user} onLogout={handleLogout}>
      <Routes>
        <Route path="/" element={<Dashboard />} />
        <Route path="/lines" element={<Lines user={user} />} />
        <Route path="/devices" element={<Devices user={user} />} />
        <Route path="/invoices" element={<Invoices user={user} />} />
        <Route path="/invoices/:id" element={<InvoiceDetail />} />
        <Route path="/audit" element={<AuditLog />} />
        <Route path="*" element={<Navigate to="/" />} />
      </Routes>
    </Layout>
  );
}
