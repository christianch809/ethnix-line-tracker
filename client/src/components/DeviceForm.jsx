import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { api } from '../api';

export default function DeviceForm({ user }) {
  const { id } = useParams();
  const navigate = useNavigate();
  const isEdit = Boolean(id);

  const [form, setForm] = useState({
    equipment_type: 'iPhone', model: '', imei: '',
    carrier: 'AT&T', status: 'available', condition: 'perfect',
    location: '', employee_name: '', entry_date: '', notes: ''
  });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (isEdit) {
      api.getDevice(id).then(data => setForm({
        equipment_type: data.equipment_type || 'iPhone',
        model: data.model || '', imei: data.imei || '',
        carrier: data.carrier || 'AT&T', status: data.status || 'available',
        condition: data.condition || 'perfect', location: data.location || '',
        employee_name: data.employee_name || '', entry_date: data.entry_date || '',
        notes: data.notes || ''
      })).catch(err => { alert(err.message); navigate('/devices'); });
    }
  }, [id]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      const payload = { ...form, [isEdit ? 'updated_by' : 'created_by']: user };
      if (isEdit) await api.updateDevice(id, payload);
      else await api.createDevice(payload);
      navigate('/devices');
    } catch (err) { alert(err.message); }
    setSaving(false);
  };

  const set = (field) => (e) => setForm({ ...form, [field]: e.target.value });

  return (
    <div className="max-w-2xl mx-auto">
      <h1 className="text-2xl font-bold text-gray-800 mb-6">{isEdit ? 'Edit Device' : 'Add New Device'}</h1>
      <form onSubmit={handleSubmit} className="bg-white rounded-xl shadow-sm p-6 space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Equipment Type</label>
            <select value={form.equipment_type} onChange={set('equipment_type')} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm">
              <option>iPhone</option>
              <option>iPad</option>
              <option>Galaxy</option>
              <option>Hotspot</option>
              <option>Other</option>
            </select>
          </div>
          <Field label="Model" value={form.model} onChange={set('model')} placeholder="iPhone 15 Pro" />
          <Field label="IMEI" value={form.imei} onChange={set('imei')} placeholder="123456789012345" />
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Carrier</label>
            <select value={form.carrier} onChange={set('carrier')} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm">
              <option>AT&T</option>
              <option>Verizon</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Condition</label>
            <select value={form.condition} onChange={set('condition')} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm">
              <option value="perfect">Perfect</option>
              <option value="good">Good</option>
              <option value="damaged">Damaged</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Location</label>
            <select value={form.location} onChange={set('location')} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm">
              <option value="">Select...</option>
              <option>Nashville</option>
              <option>Memphis</option>
              <option>Cincinnati</option>
              <option>Dallas</option>
              <option>Houston</option>
              <option>Other</option>
            </select>
          </div>
          <Field label="Employee Name" value={form.employee_name} onChange={set('employee_name')} />
          <Field label="Entry Date" value={form.entry_date} onChange={set('entry_date')} type="date" />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Notes</label>
          <textarea value={form.notes} onChange={set('notes')} rows={3} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" />
        </div>
        <div className="flex gap-3 pt-2">
          <button type="submit" disabled={saving} className="bg-blue-700 text-white px-6 py-2 rounded-lg hover:bg-blue-800 disabled:opacity-50">
            {saving ? 'Saving...' : isEdit ? 'Update Device' : 'Create Device'}
          </button>
          <button type="button" onClick={() => navigate('/devices')} className="bg-gray-100 px-6 py-2 rounded-lg hover:bg-gray-200">Cancel</button>
        </div>
      </form>
    </div>
  );
}

function Field({ label, ...props }) {
  return (
    <div>
      <label className="block text-sm font-medium text-gray-700 mb-1">{label}</label>
      <input {...props} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none" />
    </div>
  );
}
