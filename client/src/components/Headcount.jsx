import React, { useState, useEffect } from 'react';
import { api } from '../api';

export default function Headcount() {
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState('');

  const load = () => {
    setLoading(true);
    const params = new URLSearchParams();
    if (search) params.set('search', search);
    if (filter) params.set('missing', filter);
    api.getHeadcount(params.toString()).then(setData).catch(console.error).finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, [filter]);

  const handleSearch = (e) => { e.preventDefault(); load(); };

  const withDevice = data.filter(e => e.devices.length > 0).length;
  const withoutDevice = data.filter(e => e.devices.length === 0).length;

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-800">Headcount</h1>
          <p className="text-sm text-gray-500">{data.length} employees — {withDevice} with device, {withoutDevice} without</p>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-white rounded-xl shadow-sm p-3 mb-4 flex flex-wrap gap-2 items-center">
        <form onSubmit={handleSearch} className="flex gap-2 flex-1 min-w-[200px]">
          <input type="text" placeholder="Search name, department, phone..."
            value={search} onChange={(e) => setSearch(e.target.value)}
            className="flex-1 border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:ring-2 focus:ring-blue-500 outline-none" />
          <button type="submit" className="bg-gray-100 px-3 py-1.5 rounded-lg text-sm hover:bg-gray-200">Search</button>
        </form>
        <select value={filter} onChange={(e) => setFilter(e.target.value)} className="border border-gray-300 rounded-lg px-2 py-1.5 text-sm">
          <option value="">All Employees</option>
          <option value="device">Missing Device</option>
        </select>
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl shadow-sm overflow-x-auto border border-gray-200">
        {loading ? (
          <div className="text-center py-12 text-gray-500">Loading...</div>
        ) : data.length === 0 ? (
          <div className="text-center py-12 text-gray-400">No employees found</div>
        ) : (
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="bg-gray-100 text-gray-600 text-left text-xs uppercase tracking-wider">
                <th className="px-4 py-2.5 border-b border-r border-gray-200">Employee</th>
                <th className="px-4 py-2.5 border-b border-r border-gray-200">Department</th>
                <th className="px-4 py-2.5 border-b border-r border-gray-200">Location</th>
                <th className="px-4 py-2.5 border-b border-r border-gray-200 text-center w-32">Line</th>
                <th className="px-4 py-2.5 border-b border-r border-gray-200">Phone Number</th>
                <th className="px-4 py-2.5 border-b border-r border-gray-200 text-center w-32">Device</th>
                <th className="px-4 py-2.5 border-b border-gray-200">Device Info</th>
              </tr>
            </thead>
            <tbody>
              {data.map((emp, i) => {
                const hasLine = emp.lines.length > 0;
                const hasDevice = emp.devices.length > 0;

                return (
                  <tr key={i} className={`border-b border-gray-100 hover:bg-gray-50/50 ${!hasDevice ? 'bg-orange-50/30' : ''}`}>
                    <td className="px-4 py-2.5 border-r border-gray-200 font-medium">{emp.employee_name}</td>
                    <td className="px-4 py-2.5 border-r border-gray-200">{emp.department || <span className="text-gray-300">—</span>}</td>
                    <td className="px-4 py-2.5 border-r border-gray-200">{emp.location || <span className="text-gray-300">—</span>}</td>
                    <td className="px-4 py-2.5 border-r border-gray-200 text-center">
                      {hasLine ? (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-bold bg-green-100 text-green-700">✅ Yes</span>
                      ) : (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-bold bg-red-100 text-red-700">❌ No</span>
                      )}
                    </td>
                    <td className="px-4 py-2.5 border-r border-gray-200 font-mono text-xs">
                      {emp.lines.map(l => l.phone_number).join(', ') || <span className="text-gray-300">—</span>}
                    </td>
                    <td className="px-4 py-2.5 border-r border-gray-200 text-center">
                      {hasDevice ? (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-bold bg-green-100 text-green-700">✅ Yes</span>
                      ) : (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-bold bg-orange-100 text-orange-700">⚠️ No</span>
                      )}
                    </td>
                    <td className="px-4 py-2.5 border-gray-200 text-xs">
                      {emp.devices.map(d => `${d.equipment_type} ${d.model}`).join(', ') || <span className="text-gray-300">No device assigned</span>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
