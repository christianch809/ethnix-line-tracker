import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { api } from '../api';

export default function LineForm({ user }) {
  const { id } = useParams();
  const navigate = useNavigate();
  const isEdit = Boolean(id);

  const [form, setForm] = useState({
    phone_number: '', carrier: 'AT&T', status: 'active',
    employee_name: '', department: '', location: '',
    plan_name: '', monthly_cost: '', activation_date: '',
    deactivation_date: '', notes: ''
  });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (isEdit) {
      api.getLine(id).then(data => setForm({
        phone_number: data.phone_number || '',
        carrier: data.carrier || 'AT&T',
        status: data.status || 'active',
        employee_name: data.employee_name || '',
        department: data.department || '',
        location: data.location || '',
        plan_name: data.plan_name || '',
        monthly_cost: data.monthly_cost || '',
        activation_date: data.activation_date || '',
        deactivation_date: data.deactivation_date || '',
        notes: data.notes || ''
      })).catch(err => { alert(err.message); navigate('/lines'); });
    }
  }, [id]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      const payload = { ...form, [isEdit ? 'updated_by' : 'created_by']: user };
      if (isEdit) await api.updateLine(id, payload);
      else await api.createLine(payload);
      navigate('/lines');
    } catch (err) { alert(err.message); }
    setSaving(false);
  };

  const set = (field) => (e) => setForm({ ...form, [field]: e.target.value });

  return (
    <div className="max-w-2xl mx-auto">
      <h1 className="text-2xl font-bold text-gray-800 mb-6">{isEdit ? 'Edit Line' : 'Add New Line'}</h1>
      <form onSubmit={handleSubmit} className="bg-white rounded-xl shadow-sm p-6 space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Field label="Phone Number" value={form.phone_number} onChange={set('phone_number')} required placeholder="(615) 555-1234" />
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Carrier</label>
            <select value={form.carrier} onChange={set('carrier')} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm">
              <option>AT&T</option>
              <option>Verizon</option>
            </select>
          </div>
          <Field label="Employee Name" value={form.employee_name} onChange={set('employee_name')} />
          <Field label="Department (CECO)" value={form.department} onChange={set('department')} />
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
          <Field label="Plan Name" value={form.plan_name} onChange={set('plan_name')} />
          <Field label="Monthly Cost" value={form.monthly_cost} onChange={set('monthly_cost')} type="number" step="0.01" />
          <Field label="Activation Date" value={form.activation_date} onChange={set('activation_date')} type="date" />
          {form.status === 'inactive' && (
            <Field label="Deactivation Date" value={form.deactivation_date} onChange={set('deactivation_date')} type="date" />
          )}
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Notes</label>
          <textarea value={form.notes} onChange={set('notes')} rows={3} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" />
        </div>
        <div className="flex gap-3 pt-2">
          <button type="submit" disabled={saving} className="bg-blue-700 text-white px-6 py-2 rounded-lg hover:bg-blue-800 disabled:opacity-50">
            {saving ? 'Saving...' : isEdit ? 'Update Line' : 'Create Line'}
          </button>
          <button type="button" onClick={() => navigate('/lines')} className="bg-gray-100 px-6 py-2 rounded-lg hover:bg-gray-200">Cancel</button>
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
