import React, { useState, useEffect, useCallback } from 'react';
import { api } from '../api';
import { TextCell, SelectCell, StatusBadge, VerifiedCheck } from './EditableCell';

const CARRIERS = ['AT&T', 'Verizon'];
const EQUIP_TYPES = ['iPhone', 'iPad', 'Galaxy', 'Hotspot', 'Other'];
const CONDITIONS = ['perfect', 'good', 'damaged'];
const LOCATIONS = ['Nashville', 'Memphis', 'Cincinnati', 'Dallas', 'Houston', 'Other'];
const DEVICE_STATUSES = ['assigned', 'available', 'damaged', 'lost'];

export default function Devices({ user }) {
  const [devices, setDevices] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [filterLocation, setFilterLocation] = useState('');
  const [filterCarrier, setFilterCarrier] = useState('');
  const [showUnverified, setShowUnverified] = useState(false);
  const [allLines, setAllLines] = useState([]);
  const [addingNew, setAddingNew] = useState(false);
  const [newDevice, setNewDevice] = useState({
    equipment_type: 'iPhone', model: '', imei: '', carrier: 'AT&T', condition: 'perfect', location: ''
  });

  const loadDevices = useCallback(() => {
    setLoading(true);
    const params = new URLSearchParams();
    if (search) params.set('search', search);
    if (filterStatus) params.set('status', filterStatus);
    if (filterLocation) params.set('location', filterLocation);
    if (filterCarrier) params.set('carrier', filterCarrier);
    if (showUnverified) params.set('unverified', 'true');
    api.getDevices(params.toString()).then(setDevices).catch(console.error).finally(() => setLoading(false));
  }, [search, filterStatus, filterLocation, filterCarrier, showUnverified]);

  useEffect(() => { loadDevices(); }, [loadDevices]);

  // Load all active lines for assignment
  useEffect(() => {
    api.getLines('status=active').then(setAllLines).catch(console.error);
  }, []);

  const saveField = async (deviceId, field, value) => {
    try {
      await api.patchDevice(deviceId, { [field]: value, updated_by: user });
      setDevices(prev => prev.map(d => d.id === deviceId ? { ...d, [field]: value } : d));
    } catch (err) { alert(err.message); }
  };

  const handleVerify = async (device) => {
    const newVal = !device.verified;
    try {
      await api.verifyDevice(device.id, { verified: newVal, updated_by: user });
      setDevices(prev => prev.map(d => d.id === device.id
        ? { ...d, verified: newVal ? 1 : 0, verified_by: newVal ? user : null, verified_at: newVal ? new Date().toISOString() : null }
        : d));
    } catch (err) { alert(err.message); }
  };

  const handleAssignToLine = async (deviceId, lineId) => {
    try {
      await api.assignDevice(deviceId, { line_id: lineId || null, updated_by: user });
      loadDevices();
    } catch (err) { alert(err.message); }
  };

  const handleMoveToStorage = async (device) => {
    try {
      await api.unassignDevice(device.id, { updated_by: user });
      loadDevices();
    } catch (err) { alert(err.message); }
  };

  const handleAddNew = async () => {
    if (!newDevice.model.trim() && !newDevice.imei.trim()) return;
    try {
      await api.createDevice({ ...newDevice, status: 'available', created_by: user });
      setNewDevice({ equipment_type: 'iPhone', model: '', imei: '', carrier: 'AT&T', condition: 'perfect', location: '' });
      setAddingNew(false);
      loadDevices();
    } catch (err) { alert(err.message); }
  };

  const handleSearch = (e) => { e.preventDefault(); loadDevices(); };

  const lineOptions = allLines.map(l => ({
    value: String(l.id),
    label: `${l.phone_number} — ${l.employee_name || '?'}`
  }));

  const verified = devices.filter(d => d.verified).length;
  const total = devices.length;

  return (
    <div>
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-800">Devices</h1>
          <p className="text-sm text-gray-500">{verified}/{total} verified</p>
        </div>
        <button onClick={() => setAddingNew(true)} className="bg-blue-700 text-white px-4 py-2 rounded-lg hover:bg-blue-800 transition text-sm font-medium">
          + Add Device
        </button>
      </div>

      {/* Filters */}
      <div className="bg-white rounded-xl shadow-sm p-3 mb-4 flex flex-wrap gap-2 items-center">
        <form onSubmit={handleSearch} className="flex gap-2 flex-1 min-w-[200px]">
          <input
            type="text" placeholder="Search IMEI, model, or employee..."
            value={search} onChange={(e) => setSearch(e.target.value)}
            className="flex-1 border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:ring-2 focus:ring-blue-500 outline-none"
          />
          <button type="submit" className="bg-gray-100 px-3 py-1.5 rounded-lg text-sm hover:bg-gray-200">Search</button>
        </form>
        <select value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)} className="border border-gray-300 rounded-lg px-2 py-1.5 text-sm">
          <option value="">All Status</option>
          {DEVICE_STATUSES.map(s => <option key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</option>)}
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
          className={`px-3 py-1.5 rounded-lg text-sm font-medium transition ${showUnverified ? 'bg-orange-100 text-orange-700 border border-orange-300' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}
        >
          {showUnverified ? '✓ Showing Unverified Only' : 'Show Unverified Only'}
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
                <th className="px-2 py-2.5 w-24 text-center border-b border-r border-gray-200">Verified</th>
                <th className="px-2 py-2.5 border-b border-r border-gray-200 w-20">Type</th>
                <th className="px-2 py-2.5 border-b border-r border-gray-200">Model</th>
                <th className="px-2 py-2.5 border-b border-r border-gray-200">IMEI</th>
                <th className="px-2 py-2.5 border-b border-r border-gray-200 w-20">Carrier</th>
                <th className="px-2 py-2.5 border-b border-r border-gray-200 w-20">Status</th>
                <th className="px-2 py-2.5 border-b border-r border-gray-200 w-20">Cond.</th>
                <th className="px-2 py-2.5 border-b border-r border-gray-200 w-24">Location</th>
                <th className="px-2 py-2.5 border-b border-r border-gray-200">Employee</th>
                <th className="px-2 py-2.5 border-b border-r border-gray-200 min-w-[200px]">Assigned Line</th>
                <th className="px-2 py-2.5 border-b border-r border-gray-200">Notes</th>
                <th className="px-2 py-2.5 border-b border-gray-200 w-20"></th>
              </tr>
            </thead>
            <tbody>
              {/* Add new row */}
              {addingNew && (
                <tr className="bg-green-50 border-b-2 border-green-300">
                  <td className="px-2 py-1 border-r border-gray-200"></td>
                  <td className="px-2 py-1 border-r border-gray-200">
                    <select value={newDevice.equipment_type} onChange={e => setNewDevice({ ...newDevice, equipment_type: e.target.value })}
                      className="w-full border border-green-300 rounded px-1 py-0.5 text-sm bg-white">
                      {EQUIP_TYPES.map(t => <option key={t}>{t}</option>)}
                    </select>
                  </td>
                  <td className="px-2 py-1 border-r border-gray-200">
                    <input value={newDevice.model} onChange={e => setNewDevice({ ...newDevice, model: e.target.value })}
                      placeholder="Model" autoFocus className="w-full border border-green-300 rounded px-1.5 py-0.5 text-sm bg-white" />
                  </td>
                  <td className="px-2 py-1 border-r border-gray-200">
                    <input value={newDevice.imei} onChange={e => setNewDevice({ ...newDevice, imei: e.target.value })}
                      placeholder="IMEI" className="w-full border border-green-300 rounded px-1.5 py-0.5 text-sm bg-white font-mono" />
                  </td>
                  <td className="px-2 py-1 border-r border-gray-200">
                    <select value={newDevice.carrier} onChange={e => setNewDevice({ ...newDevice, carrier: e.target.value })}
                      className="w-full border border-green-300 rounded px-1 py-0.5 text-sm bg-white">
                      {CARRIERS.map(c => <option key={c}>{c}</option>)}
                    </select>
                  </td>
                  <td className="px-2 py-1 border-r border-gray-200"><StatusBadge status="available" /></td>
                  <td className="px-2 py-1 border-r border-gray-200">
                    <select value={newDevice.condition} onChange={e => setNewDevice({ ...newDevice, condition: e.target.value })}
                      className="w-full border border-green-300 rounded px-1 py-0.5 text-sm bg-white">
                      {CONDITIONS.map(c => <option key={c}>{c}</option>)}
                    </select>
                  </td>
                  <td className="px-2 py-1 border-r border-gray-200">
                    <select value={newDevice.location} onChange={e => setNewDevice({ ...newDevice, location: e.target.value })}
                      className="w-full border border-green-300 rounded px-1 py-0.5 text-sm bg-white">
                      <option value="">—</option>
                      {LOCATIONS.map(l => <option key={l}>{l}</option>)}
                    </select>
                  </td>
                  <td className="px-2 py-1 border-r border-gray-200"></td>
                  <td className="px-2 py-1 border-r border-gray-200"></td>
                  <td className="px-2 py-1 border-r border-gray-200"></td>
                  <td className="px-2 py-1 border-gray-200">
                    <div className="flex gap-1">
                      <button onClick={handleAddNew} className="text-green-700 hover:bg-green-100 rounded px-1.5 py-0.5 text-xs font-medium">Save</button>
                      <button onClick={() => setAddingNew(false)} className="text-gray-500 hover:bg-gray-100 rounded px-1.5 py-0.5 text-xs">Cancel</button>
                    </div>
                  </td>
                </tr>
              )}

              {devices.length === 0 && (
                <tr><td colSpan={12} className="text-center py-12 text-gray-400">No devices found</td></tr>
              )}

              {devices.map(d => (
                <tr key={d.id} className={`border-b border-gray-100 hover:bg-gray-50/50 transition-colors ${!d.verified ? 'bg-orange-50/30' : ''}`}>
                  {/* Verified */}
                  <td className="px-2 py-1 border-r border-gray-200 text-center">
                    <VerifiedCheck
                      verified={d.verified}
                      verifiedBy={d.verified_by}
                      verifiedAt={d.verified_at}
                      onToggle={() => handleVerify(d)}
                    />
                  </td>

                  {/* Type */}
                  <td className="px-1 py-0.5 border-r border-gray-200">
                    <SelectCell value={d.equipment_type} options={EQUIP_TYPES} onSave={v => saveField(d.id, 'equipment_type', v)} />
                  </td>

                  {/* Model */}
                  <td className="px-1 py-0.5 border-r border-gray-200">
                    <TextCell value={d.model} onSave={v => saveField(d.id, 'model', v)} placeholder="Model" />
                  </td>

                  {/* IMEI */}
                  <td className="px-1 py-0.5 border-r border-gray-200">
                    <TextCell value={d.imei} mono onSave={v => saveField(d.id, 'imei', v)} placeholder="IMEI" />
                  </td>

                  {/* Carrier */}
                  <td className="px-1 py-0.5 border-r border-gray-200">
                    <SelectCell value={d.carrier} options={CARRIERS} onSave={v => saveField(d.id, 'carrier', v)} />
                  </td>

                  {/* Status */}
                  <td className="px-2 py-1 border-r border-gray-200">
                    <StatusBadge status={d.status} verified={d.verified} />
                  </td>

                  {/* Condition */}
                  <td className="px-1 py-0.5 border-r border-gray-200">
                    <SelectCell value={d.condition} options={CONDITIONS} onSave={v => saveField(d.id, 'condition', v)} />
                  </td>

                  {/* Location */}
                  <td className="px-1 py-0.5 border-r border-gray-200">
                    <SelectCell value={d.location} options={LOCATIONS} onSave={v => saveField(d.id, 'location', v)} />
                  </td>

                  {/* Employee */}
                  <td className="px-1 py-0.5 border-r border-gray-200">
                    <TextCell value={d.employee_name} onSave={v => saveField(d.id, 'employee_name', v)} placeholder="Employee" />
                  </td>

                  {/* Line Assignment */}
                  <td className="px-1 py-0.5 border-r border-gray-200">
                    <LineAssignment
                      currentLine={d.line_phone}
                      lineId={d.assigned_to_line_id}
                      allLines={lineOptions}
                      onAssign={(lineId) => handleAssignToLine(d.id, lineId)}
                    />
                  </td>

                  {/* Notes */}
                  <td className="px-1 py-0.5 border-r border-gray-200">
                    <TextCell value={d.notes} onSave={v => saveField(d.id, 'notes', v)} placeholder="Notes" />
                  </td>

                  {/* Actions */}
                  <td className="px-2 py-1 text-center">
                    {d.status === 'assigned' && (
                      <button
                        onClick={() => handleMoveToStorage(d)}
                        className="text-xs font-medium text-orange-600 hover:bg-orange-50 rounded px-2 py-0.5"
                        title="Move to storage"
                      >
                        → Storage
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
      <p className="text-xs text-gray-400 mt-2">{total} device(s) — click any cell to edit</p>
    </div>
  );
}

// Line assignment inline component
function LineAssignment({ currentLine, lineId, allLines, onAssign }) {
  const [open, setOpen] = useState(false);

  if (open) {
    return (
      <select
        autoFocus
        value={lineId || ''}
        onChange={e => { onAssign(e.target.value || null); setOpen(false); }}
        onBlur={() => setOpen(false)}
        className="w-full bg-blue-50 border border-blue-300 rounded px-1 py-0.5 text-xs outline-none"
      >
        <option value="">No line (storage)</option>
        {lineId && currentLine && (
          <option value={lineId}>{currentLine} (current)</option>
        )}
        {allLines.filter(l => String(l.value) !== String(lineId)).map(l => (
          <option key={l.value} value={l.value}>{l.label}</option>
        ))}
      </select>
    );
  }

  return (
    <div
      onClick={() => setOpen(true)}
      className={`cursor-pointer px-1.5 py-0.5 rounded hover:bg-blue-50 min-h-[28px] text-xs transition-colors ${currentLine ? 'text-blue-700 font-mono font-medium' : 'text-gray-300 italic'}`}
    >
      {currentLine || 'Click to assign line'}
    </div>
  );
}
