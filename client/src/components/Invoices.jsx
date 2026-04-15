import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api';

export default function Invoices({ user }) {
  const [invoices, setInvoices] = useState([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [carrier, setCarrier] = useState('AT&T');
  const [billingPeriod, setBillingPeriod] = useState('');

  const loadInvoices = () => {
    setLoading(true);
    api.getInvoices().then(setInvoices).catch(console.error).finally(() => setLoading(false));
  };

  useEffect(() => { loadInvoices(); }, []);

  const handleUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setUploading(true);
    try {
      const formData = new FormData();
      formData.append('invoice', file);
      formData.append('carrier', carrier);
      formData.append('billing_period', billingPeriod);
      formData.append('uploaded_by', user);
      const result = await api.uploadInvoice(formData);
      if (result.error) throw new Error(result.error);
      loadInvoices();
      alert('Invoice uploaded and processed successfully!');
    } catch (err) {
      alert('Error uploading invoice: ' + err.message);
    }
    setUploading(false);
    e.target.value = '';
  };

  return (
    <div>
      <h1 className="text-2xl font-bold text-gray-800 mb-6">Invoices</h1>

      {/* Upload */}
      <div className="bg-white rounded-xl shadow-sm p-6 mb-6">
        <h2 className="text-lg font-semibold mb-4">Upload Invoice PDF</h2>
        <div className="flex flex-wrap gap-4 items-end">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Carrier</label>
            <select value={carrier} onChange={(e) => setCarrier(e.target.value)} className="border border-gray-300 rounded-lg px-3 py-2 text-sm">
              <option>AT&T</option>
              <option>Verizon</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Billing Period</label>
            <input type="month" value={billingPeriod} onChange={(e) => setBillingPeriod(e.target.value)}
              className="border border-gray-300 rounded-lg px-3 py-2 text-sm" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">PDF File</label>
            <input type="file" accept=".pdf" onChange={handleUpload} disabled={uploading}
              className="text-sm file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:bg-blue-700 file:text-white file:hover:bg-blue-800 file:cursor-pointer" />
          </div>
          {uploading && <span className="text-sm text-blue-600 animate-pulse">Processing invoice with AI...</span>}
        </div>
      </div>

      {/* Invoice List */}
      <div className="bg-white rounded-xl shadow-sm overflow-x-auto">
        {loading ? (
          <div className="text-center py-12 text-gray-500">Loading...</div>
        ) : invoices.length === 0 ? (
          <div className="text-center py-12 text-gray-400">No invoices uploaded yet</div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-gray-600 text-left">
              <tr>
                <th className="px-4 py-3">Filename</th>
                <th className="px-4 py-3">Carrier</th>
                <th className="px-4 py-3">Billing Period</th>
                <th className="px-4 py-3">Total Amount</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Uploaded By</th>
                <th className="px-4 py-3">Date</th>
                <th className="px-4 py-3">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {invoices.map(inv => (
                <tr key={inv.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3">{inv.filename}</td>
                  <td className="px-4 py-3">{inv.carrier}</td>
                  <td className="px-4 py-3">{inv.billing_period}</td>
                  <td className="px-4 py-3">{inv.total_amount ? `$${Number(inv.total_amount).toFixed(2)}` : '—'}</td>
                  <td className="px-4 py-3">
                    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                      inv.status === 'reviewed' ? 'bg-green-100 text-green-700' : 'bg-yellow-100 text-yellow-700'
                    }`}>{inv.status}</span>
                  </td>
                  <td className="px-4 py-3">{inv.uploaded_by}</td>
                  <td className="px-4 py-3">{new Date(inv.upload_date).toLocaleDateString()}</td>
                  <td className="px-4 py-3">
                    <Link to={`/invoices/${inv.id}`} className="text-blue-600 hover:underline text-xs">View Details</Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
