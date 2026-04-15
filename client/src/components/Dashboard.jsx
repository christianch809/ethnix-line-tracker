import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api';

export default function Dashboard() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.getDashboard().then(setData).catch(console.error).finally(() => setLoading(false));
  }, []);

  if (loading) return <div className="text-center py-12 text-gray-500">Loading dashboard...</div>;
  if (!data) return <div className="text-center py-12 text-red-500">Error loading dashboard</div>;

  return (
    <div>
      <h1 className="text-2xl font-bold text-gray-800 mb-6">Dashboard</h1>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
        <StatCard title="Active Lines" value={data.activeLines} color="blue" />
        <StatCard title="Monthly Cost" value={`$${(data.monthlyCost || 0).toLocaleString('en-US', { minimumFractionDigits: 2 })}`} color="green" />
        <StatCard title="Assigned Devices" value={data.assignedDevices} color="purple" />
        <StatCard title="Available Devices" value={data.availableDevices} color="yellow" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Ghost Line Alerts */}
        <div className="bg-white rounded-xl shadow-sm p-6">
          <h2 className="text-lg font-semibold text-gray-800 mb-4">Ghost Line Alerts</h2>
          {data.ghostLines && data.ghostLines.length > 0 ? (
            <div className="space-y-2">
              {data.ghostLines.map((g, i) => (
                <div key={i} className="flex items-center gap-2 text-sm p-2 bg-yellow-50 rounded-lg">
                  <span className="text-yellow-500">⚠️</span>
                  <span className="font-mono">{g.phone_number}</span>
                  <span className="text-gray-500">— billed but not in system</span>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-gray-400 text-sm">No ghost lines detected</p>
          )}
        </div>

        {/* Devices by Status */}
        <div className="bg-white rounded-xl shadow-sm p-6">
          <h2 className="text-lg font-semibold text-gray-800 mb-4">Devices by Status</h2>
          <div className="space-y-3">
            {(data.devicesByStatus || []).map((d, i) => (
              <div key={i} className="flex justify-between items-center">
                <span className="capitalize text-gray-600">{d.status}</span>
                <span className="bg-gray-100 px-3 py-1 rounded-full text-sm font-semibold">{d.count}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Recent Activity */}
        <div className="bg-white rounded-xl shadow-sm p-6 lg:col-span-2">
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-lg font-semibold text-gray-800">Recent Activity</h2>
            <Link to="/audit" className="text-blue-600 text-sm hover:underline">View all</Link>
          </div>
          {data.recentActivity && data.recentActivity.length > 0 ? (
            <div className="space-y-2">
              {data.recentActivity.map((a, i) => (
                <div key={i} className="flex items-center gap-3 text-sm p-2 border-b border-gray-50">
                  <span className={`px-2 py-0.5 rounded text-xs font-medium ${
                    a.action === 'created' ? 'bg-green-100 text-green-700' :
                    a.action === 'updated' ? 'bg-blue-100 text-blue-700' :
                    a.action === 'deactivated' ? 'bg-red-100 text-red-700' :
                    'bg-gray-100 text-gray-700'
                  }`}>{a.action}</span>
                  <span className="text-gray-600">{a.entity_type} #{a.entity_id}</span>
                  <span className="text-gray-400 ml-auto">{a.changed_by} — {new Date(a.timestamp).toLocaleString()}</span>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-gray-400 text-sm">No recent activity</p>
          )}
        </div>
      </div>
    </div>
  );
}

function StatCard({ title, value, color }) {
  const colors = {
    blue: 'bg-blue-50 text-blue-700 border-blue-200',
    green: 'bg-green-50 text-green-700 border-green-200',
    purple: 'bg-purple-50 text-purple-700 border-purple-200',
    yellow: 'bg-yellow-50 text-yellow-700 border-yellow-200',
  };
  return (
    <div className={`rounded-xl border p-6 ${colors[color]}`}>
      <p className="text-sm font-medium opacity-75">{title}</p>
      <p className="text-3xl font-bold mt-2">{value}</p>
    </div>
  );
}
