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

  // Flatten: one row per line per employee
  const rows = [];
  for (const emp of data) {
    const maxRows = Math.max(emp.lines.length, 1);
    for (let i = 0; i < maxRows; i++) {
      const line = emp.lines[i] || null;
      const device = emp.devices[i] || null;
      rows.push({
        employee_name: emp.employee_name,
        department: emp.department,
        ceco: emp.department,
        location: emp.location,
        isFirstRow: i === 0,
        rowSpan: maxRows,
        line,
        device,
        hasPhone: !!line,
        hasDevice: !!device,
        // Categorize device
        iPhone: device?.equipment_type === 'iPhone' ? device : null,
        iPad: device?.equipment_type === 'iPad' ? device : null,
        otherDevice: device && device.equipment_type !== 'iPhone' && device.equipment_type !== 'iPad' ? device : null,
      });
    }
  }

  const totalEmployees = data.length;
  const withDevice = data.filter(e => e.devices.length > 0).length;
  const withoutDevice = data.filter(e => e.devices.length === 0).length;

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-800">Headcount</h1>
          <p className="text-sm text-gray-500">
            {totalEmployees} employees — {withDevice} with device, {withoutDevice} without
          </p>
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
        ) : rows.length === 0 ? (
          <div className="text-center py-12 text-gray-400">No employees found</div>
        ) : (
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="bg-gray-100 text-gray-600 text-left text-xs uppercase tracking-wider">
                <th className="px-3 py-2.5 border-b border-r border-gray-200">Employee</th>
                <th className="px-3 py-2.5 border-b border-r border-gray-200">Department</th>
                <th className="px-3 py-2.5 border-b border-r border-gray-200">CECO</th>
                <th className="px-3 py-2.5 border-b border-r border-gray-200">Location</th>
                <th className="px-3 py-2.5 border-b border-r border-gray-200 text-center">Line</th>
                <th className="px-3 py-2.5 border-b border-r border-gray-200">Phone Number</th>
                <th className="px-3 py-2.5 border-b border-r border-gray-200">Carrier</th>
                <th className="px-3 py-2.5 border-b border-r border-gray-200 text-center">iPhone</th>
                <th className="px-3 py-2.5 border-b border-r border-gray-200 text-center">iPad</th>
                <th className="px-3 py-2.5 border-b border-gray-200 text-center">Other Device</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row, i) => {
                const borderClass = row.isFirstRow && i > 0 ? 'border-t-2 border-gray-300' : 'border-b border-gray-100';
                const bgClass = !row.hasDevice && row.isFirstRow ? 'bg-orange-50/30' : '';

                return (
                  <tr key={i} className={`${borderClass} ${bgClass} hover:bg-gray-50/50`}>
                    {/* Employee info — only on first row, spans multiple */}
                    {row.isFirstRow ? (
                      <>
                        <td className="px-3 py-2 border-r border-gray-200 font-semibold" rowSpan={row.rowSpan}>
                          {row.employee_name}
                        </td>
                        <td className="px-3 py-2 border-r border-gray-200" rowSpan={row.rowSpan}>
                          {row.department || <span className="text-gray-300">—</span>}
                        </td>
                        <td className="px-3 py-2 border-r border-gray-200" rowSpan={row.rowSpan}>
                          {row.ceco || <span className="text-gray-300">—</span>}
                        </td>
                        <td className="px-3 py-2 border-r border-gray-200" rowSpan={row.rowSpan}>
                          {row.location || <span className="text-gray-300">—</span>}
                        </td>
                      </>
                    ) : null}

                    {/* Line */}
                    <td className="px-3 py-2 border-r border-gray-200 text-center">
                      {row.hasPhone ? (
                        <span className="text-green-600 font-bold">✅</span>
                      ) : (
                        <span className="text-gray-300">—</span>
                      )}
                    </td>
                    <td className="px-3 py-2 border-r border-gray-200 font-mono text-xs">
                      {row.line?.phone_number || <span className="text-gray-300">—</span>}
                    </td>
                    <td className="px-3 py-2 border-r border-gray-200 text-xs">
                      {row.line?.carrier || <span className="text-gray-300">—</span>}
                    </td>

                    {/* iPhone */}
                    <td className="px-3 py-2 border-r border-gray-200 text-center">
                      {row.iPhone ? (
                        <div>
                          <span className="text-green-600 font-bold">✅</span>
                          <div className="text-[10px] text-gray-500 mt-0.5 leading-tight">{row.iPhone.model}</div>
                        </div>
                      ) : row.isFirstRow && !data.find(e => e.employee_name === row.employee_name)?.devices.some(d => d.equipment_type === 'iPhone') ? (
                        <span className="text-gray-300 text-xs">N/A</span>
                      ) : (
                        <span className="text-gray-200">—</span>
                      )}
                    </td>

                    {/* iPad */}
                    <td className="px-3 py-2 border-r border-gray-200 text-center">
                      {row.iPad ? (
                        <div>
                          <span className="text-green-600 font-bold">✅</span>
                          <div className="text-[10px] text-gray-500 mt-0.5 leading-tight">{row.iPad.model}</div>
                        </div>
                      ) : row.isFirstRow && !data.find(e => e.employee_name === row.employee_name)?.devices.some(d => d.equipment_type === 'iPad') ? (
                        <span className="text-gray-300 text-xs">N/A</span>
                      ) : (
                        <span className="text-gray-200">—</span>
                      )}
                    </td>

                    {/* Other Device (Galaxy, Hotspot, etc) */}
                    <td className="px-3 py-2 border-gray-200 text-center">
                      {row.otherDevice ? (
                        <div>
                          <span className="text-green-600 font-bold">✅</span>
                          <div className="text-[10px] text-gray-500 mt-0.5 leading-tight">{row.otherDevice.equipment_type} {row.otherDevice.model}</div>
                        </div>
                      ) : (
                        <span className="text-gray-200">—</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
      <p className="text-xs text-gray-400 mt-2">{totalEmployees} employees, {rows.length} rows</p>
    </div>
  );
}
