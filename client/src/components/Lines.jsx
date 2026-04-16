import React, { useState, useEffect, useCallback } from 'react';
import { api } from '../api';
import { TextCell, SelectCell, NumberCell, StatusBadge, VerifiedCheck, InvoiceStatusBadge } from './EditableCell';
import SearchableSelect from './SearchableSelect';

const CARRIERS = ['AT&T', 'Verizon'];
const LOCATIONS = ['Nashville', 'Memphis', 'Cincinnati', 'Dallas', 'Houston', 'Other'];

export default function Lines({ user }) {
  const [lines, setLines] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [filterCarrier, setFilterCarrier] = useState('');
  const [filterLocation, setFilterLocation] = useState('');
  const [showUnverified, setShowUnverified] = useState(false);
  const [availableDevices, setAvailableDevices] = useState([]);
  const [addingNew, setAddingNew] = useState(false);
  const [newLine, setNewLine] = useState({ phone_number: '', carrier: 'AT&T', employee_name: '', department: '', location: '' });

  const loadLines = useCallback(() => {
    setLoading(true);
    const params = new URLSearchParams();
    if (search) params.set('search', search);
    if (filterStatus) params.set('status', filterStatus);
    if (filterCarrier) params.set('carrier', filterCarrier);
    if (filterLocation) params.set('location', filterLocation);
    if (showUnverified) params.set('unverified', 'true');
    api.getLines(params.toString()).then(setLines).catch(console.error).finally(() => setLoading(false));
  }, [search, filterStatus, filterCarrier, filterLocation, showUnverified]);

  useEffect(() => { loadLines(); }, [loadLines]);

  useEffect(() => {
    api.getAvailableDevices().then(setAvailableDevices).catch(console.error);
  }, [lines]);

  const saveField = async (lineId, field, value) => {
    try {
      await api.patchLine(lineId, { [field]: value, updated_by: user });
      setLines(prev => prev.map(l => l.id === lineId ? { ...l, [field]: value } : l));
    } catch (err) { alert(err.message); }
  };

  const handleVerify = async (line) => {
    const newVal = !line.verified;
    try {
      await api.verifyLine(line.id, { verified: newVal, updated_by: user });
      setLines(prev => prev.map(l => l.id === line.id
        ? { ...l, verified: newVal ? 1 : 0, verified_by: newVal ? user : null, verified_at: newVal ? new Date().toISOString() : null }
        : l));
    } catch (err) { alert(err.message); }
  };

  const handleAssignDevice = async (lineId, deviceId) => {
    try {
      await api.assignDeviceToLine(lineId, { device_id: deviceId || null, updated_by: user });
      loadLines();
    } catch (err) { alert(err.message); }
  };

  const handleToggleStatus = async (line) => {
    const newStatus = line.status === 'active' ? 'inactive' : 'active';
    try {
      await api.toggleLineStatus(line.id, { status: newStatus, updated_by: user });
      loadLines();
    } catch (err) { alert(err.message); }
  };

  const handleDelete = async (line) => {
    if (!confirm(`Are you sure you want to DELETE line ${line.phone_number}?\nThis cannot be undone.`)) return;
    try {
      await api.deleteLine(line.id, { deleted_by: user });
      loadLines();
    } catch (err) { alert(err.message); }
  };

  const handleAddNew = async () => {
    if (!newLine.phone_number.trim()) return;
    try {
      await api.createLine({ ...newLine, status: 'active', created_by: user });
      setNewLine({ phone_number: '', carrier: 'AT&T', employee_name: '', department: '', location: '' });
      setAddingNew(false);
      loadLines();
    } catch (err) { alert(err.message); }
  };

  const handleSearch = (e) => { e.preventDefault(); loadLines(); };

  const deviceOptions = availableDevices.map(d => ({
    value: String(d.id),
    label: `${d.equipment_type} ${d.model} (${d.imei?.slice(-6) || '?'})`
  }));

  const verified = lines.filter(l => l.verified).length;
  const total = lines.length;

  return (
    <div>
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-800">Lines</h1>
          <p className="text-sm text-gray-500">
            {verified}/{total} verified
            {showUnverified && <span className="ml-2 text-orange-600 font-medium">(showing unverified only)</span>}
          </p>
        </div>
        <button onClick={() => setAddingNew(true)} className="bg-blue-700 text-white px-4 py-2 rounded-lg hover:bg-blue-800 transition text-sm font-medium">
          + Add Line
        </button>
      </div>

      {/* Filters */}
      <div className="bg-white rounded-xl shadow-sm p-3 mb-4 flex flex-wrap gap-2 items-center">
        <form onSubmit={handleSearch} className="flex gap-2 flex-1 min-w-[200px]">
          <input type="text" placeholder="Search phone or employee..."
            value={search} onChange={(e) => setSearch(e.target.value)}
            className="flex-1 border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:ring-2 focus:ring-blue-500 outline-none" />
          <button type="submit" className="bg-gray-100 px-3 py-1.5 rounded-lg text-sm hover:bg-gray-200">Search</button>
        </form>
        <select value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)} className="border border-gray-300 rounded-lg px-2 py-1.5 text-sm">
          <option value="">All Status</option>
          <option value="active">Active</option>
          <option value="inactive">Inactive</option>
        </select>
        <select value={filterCarrier} onChange={(e) => setFilterCarrier(e.target.value)} className="border border-gray-300 rounded-lg px-2 py-1.5 text-sm">
          <option value="">All Carriers</option>
          <option>AT&T</option>
          <option>Verizon</option>
        </select>
        <select value={filterLocation} onChange={(e) => setFilterLocation(e.target.value)} className="border border-gray-300 rounded-lg px-2 py-1.5 text-sm">
          <option value="">All Locations</option>
          {LOCATIONS.map(l => <option key={l}>{l}</option>)}
        </select>
        <button
          onClick={() => setShowUnverified(!showUnverified)}
          className={`px-3 py-1.5 rounded-lg text-sm font-medium transition ${showUnverified ? 'bg-orange-500 text-white shadow' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}
        >
          {showUnverified ? '✓ Unverified Only' : 'Show Unverified Only'}
        </button>
      </div>

      {/* Spreadsheet Table */}
      <div className="bg-white rounded-xl shadow-sm overflow-x-auto border border-gray-200">
        {loading ? (
          <div className="text-center py-12 text-gray-500">Loading...</div>
        ) : (
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="bg-gray-100 text-gray-600 text-left text-xs uppercase tracking-wider">
                <th className="px-2 py-2.5 w-28 text-center border-b border-r border-gray-200">Verified</th>
                <th className="px-2 py-2.5 border-b border-r border-gray-200">Phone Number</th>
                <th className="px-2 py-2.5 border-b border-r border-gray-200 w-20">Carrier</th>
                <th className="px-2 py-2.5 border-b border-r border-gray-200 w-20">Status</th>
                <th className="px-2 py-2.5 border-b border-r border-gray-200">Employee</th>
                <th className="px-2 py-2.5 border-b border-r border-gray-200">Dept (CECO)</th>
                <th className="px-2 py-2.5 border-b border-r border-gray-200 w-24">Location</th>
                <th className="px-2 py-2.5 border-b border-r border-gray-200 w-24">Cost</th>
                <th className="px-2 py-2.5 border-b border-r border-gray-200 min-w-[200px]">Device</th>
                <th className="px-2 py-2.5 border-b border-r border-gray-200 w-28 text-center">Invoice</th>
                <th className="px-2 py-2.5 border-b border-r border-gray-200">Notes</th>
                <th className="px-2 py-2.5 border-b border-gray-200 w-10"></th>
              </tr>
            </thead>
            <tbody>
              {/* Add new row */}
              {addingNew && (
                <tr className="bg-green-50 border-b-2 border-green-300">
                  <td className="px-2 py-1 border-r border-gray-200"></td>
                  <td className="px-2 py-1 border-r border-gray-200">
                    <input value={newLine.phone_number} onChange={e => setNewLine({ ...newLine, phone_number: e.target.value })}
                      placeholder="Phone number" autoFocus
                      className="w-full border border-green-300 rounded px-1.5 py-0.5 text-sm bg-white" />
                  </td>
                  <td className="px-2 py-1 border-r border-gray-200">
                    <select value={newLine.carrier} onChange={e => setNewLine({ ...newLine, carrier: e.target.value })}
                      className="w-full border border-green-300 rounded px-1 py-0.5 text-sm bg-white">
                      {CARRIERS.map(c => <option key={c}>{c}</option>)}
                    </select>
                  </td>
                  <td className="px-2 py-1 border-r border-gray-200"><StatusBadge status="active" /></td>
                  <td className="px-2 py-1 border-r border-gray-200">
                    <input value={newLine.employee_name} onChange={e => setNewLine({ ...newLine, employee_name: e.target.value })}
                      placeholder="Employee" className="w-full border border-green-300 rounded px-1.5 py-0.5 text-sm bg-white" />
                  </td>
                  <td className="px-2 py-1 border-r border-gray-200">
                    <input value={newLine.department} onChange={e => setNewLine({ ...newLine, department: e.target.value })}
                      placeholder="CECO" className="w-full border border-green-300 rounded px-1.5 py-0.5 text-sm bg-white" />
                  </td>
                  <td className="px-2 py-1 border-r border-gray-200">
                    <select value={newLine.location} onChange={e => setNewLine({ ...newLine, location: e.target.value })}
                      className="w-full border border-green-300 rounded px-1 py-0.5 text-sm bg-white">
                      <option value="">—</option>
                      {LOCATIONS.map(l => <option key={l}>{l}</option>)}
                    </select>
                  </td>
                  <td className="px-2 py-1 border-r border-gray-200"></td>
                  <td className="px-2 py-1 border-r border-gray-200"></td>
                  <td className="px-2 py-1 border-r border-gray-200"></td>
                  <td className="px-2 py-1 border-r border-gray-200"></td>
                  <td className="px-2 py-1 border-gray-200">
                    <div className="flex gap-1">
                      <button onClick={handleAddNew} className="text-green-700 hover:bg-green-100 rounded px-1 py-0.5 text-xs font-medium">✓</button>
                      <button onClick={() => setAddingNew(false)} className="text-gray-500 hover:bg-gray-100 rounded px-1 py-0.5 text-xs">✕</button>
                    </div>
                  </td>
                </tr>
              )}

              {lines.length === 0 && !addingNew && (
                <tr><td colSpan={12} className="text-center py-12 text-gray-400">No lines found</td></tr>
              )}

              {lines.map(line => {
                const deviceLabel = line.device_id
                  ? `${line.device_type || ''} ${line.device_model || ''}`
                  : null;

                return (
                  <tr key={line.id} className={`border-b border-gray-100 hover:bg-gray-50/50 transition-colors ${!line.verified ? 'bg-orange-50/20' : ''}`}>
                    <td className="px-2 py-1.5 border-r border-gray-200 text-center">
                      <VerifiedCheck
                        verified={line.verified}
                        verifiedBy={line.verified_by}
                        verifiedAt={line.verified_at}
                        onToggle={() => handleVerify(line)}
                      />
                    </td>
                    <td className="px-1 py-0.5 border-r border-gray-200">
                      <TextCell value={line.phone_number} mono onSave={v => saveField(line.id, 'phone_number', v)} placeholder="Phone" />
                    </td>
                    <td className="px-1 py-0.5 border-r border-gray-200">
                      <SelectCell value={line.carrier} options={CARRIERS} onSave={v => saveField(line.id, 'carrier', v)} />
                    </td>
                    <td className="px-2 py-1 border-r border-gray-200">
                      <button onClick={() => handleToggleStatus(line)} title="Click to toggle">
                        <StatusBadge status={line.status} verified={line.verified} />
                      </button>
                    </td>
                    <td className="px-1 py-0.5 border-r border-gray-200">
                      <TextCell value={line.employee_name} onSave={v => saveField(line.id, 'employee_name', v)} placeholder="Employee name" />
                    </td>
                    <td className="px-1 py-0.5 border-r border-gray-200">
                      <TextCell value={line.department} onSave={v => saveField(line.id, 'department', v)} placeholder="CECO" />
                    </td>
                    <td className="px-1 py-0.5 border-r border-gray-200">
                      <SelectCell value={line.location} options={LOCATIONS} onSave={v => saveField(line.id, 'location', v)} />
                    </td>
                    <td className="px-1 py-0.5 border-r border-gray-200">
                      <NumberCell value={line.monthly_cost} prefix="$" onSave={v => saveField(line.id, 'monthly_cost', v)} />
                    </td>
                    <td className="px-1 py-0.5 border-r border-gray-200">
                      <DeviceAssignment
                        currentDevice={deviceLabel}
                        deviceId={line.device_id}
                        availableDevices={deviceOptions}
                        onAssign={(deviceId) => handleAssignDevice(line.id, deviceId)}
                      />
                    </td>
                    <td className="px-2 py-1 border-r border-gray-200 text-center">
                      <InvoiceStatusBadge status={line.invoice_status} />
                    </td>
                    <td className="px-1 py-0.5 border-r border-gray-200">
                      <TextCell value={line.notes} onSave={v => saveField(line.id, 'notes', v)} placeholder="Notes" />
                    </td>
                    <td className="px-1 py-1 text-center">
                      <div className="flex gap-1 justify-center">
                        <button
                          onClick={() => handleToggleStatus(line)}
                          className={`text-xs font-bold px-1.5 py-0.5 rounded ${line.status === 'active' ? 'text-red-500 hover:bg-red-50' : 'text-green-500 hover:bg-green-50'}`}
                          title={line.status === 'active' ? 'Deactivate' : 'Activate'}
                        >
                          {line.status === 'active' ? '✕' : '✓'}
                        </button>
                        <button
                          onClick={() => handleDelete(line)}
                          className="text-xs font-bold px-1.5 py-0.5 rounded text-gray-400 hover:text-red-600 hover:bg-red-50"
                          title="Delete line"
                        >
                          🗑
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
      <p className="text-xs text-gray-400 mt-2">{total} line(s) — click any cell to edit inline</p>
    </div>
  );
}

function DeviceAssignment({ currentDevice, deviceId, availableDevices, onAssign }) {
  const [open, setOpen] = useState(false);

  if (open) {
    const options = availableDevices.map(d => ({
      value: d.value,
      label: d.label,
      sub: d.imei ? `IMEI: ${d.imei}` : ''
    }));
    return (
      <SearchableSelect
        options={options}
        value={deviceId}
        placeholder="Search device by model, type..."
        onSelect={(val) => { onAssign(val); setOpen(false); }}
        onClose={() => setOpen(false)}
      />
    );
  }

  return (
    <div
      onClick={() => setOpen(true)}
      className={`cursor-pointer px-1.5 py-0.5 rounded hover:bg-blue-50 min-h-[28px] text-xs transition-colors ${currentDevice ? 'text-blue-700 font-medium' : 'text-gray-300 italic'}`}
    >
      {currentDevice || 'Click to assign device'}
    </div>
  );
}
