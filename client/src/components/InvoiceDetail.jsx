import React, { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { api } from '../api';

export default function InvoiceDetail() {
  const { id } = useParams();
  const [invoice, setInvoice] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.getInvoice(id).then(setInvoice).catch(console.error).finally(() => setLoading(false));
  }, [id]);

  if (loading) return <div className="text-center py-12 text-gray-500">Loading...</div>;
  if (!invoice) return <div className="text-center py-12 text-red-500">Invoice not found</div>;

  const r = invoice.reconciliation || { matched: { lines: [], count: 0, total: 0 }, ghost: { lines: [], count: 0, total: 0 }, not_billed: { lines: [], count: 0, estimated_savings: 0 } };

  return (
    <div>
      <div className="flex items-center gap-4 mb-6">
        <Link to="/invoices" className="text-blue-600 hover:underline">&larr; Back</Link>
        <h1 className="text-2xl font-bold text-gray-800">Invoice: {invoice.filename}</h1>
      </div>

      {/* Invoice Info */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
        <InfoCard label="Carrier" value={invoice.carrier} />
        <InfoCard label="Billing Period" value={invoice.billing_period} />
        <InfoCard label="Total Amount" value={invoice.total_amount ? `$${Number(invoice.total_amount).toLocaleString('en-US', { minimumFractionDigits: 2 })}` : '—'} />
        <InfoCard label="Lines in Invoice" value={(invoice.lines || []).length} />
      </div>

      {/* Reconciliation Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
        <div className="bg-green-50 border-2 border-green-300 rounded-xl p-5">
          <div className="flex items-center gap-2 mb-2">
            <span className="text-2xl">✅</span>
            <h3 className="text-lg font-bold text-green-800">Matched</h3>
          </div>
          <p className="text-sm text-green-700 mb-1">In system AND in invoice — everything is normal</p>
          <div className="flex justify-between items-end mt-3">
            <span className="text-3xl font-black text-green-700">{r.matched.count}</span>
            <span className="text-lg font-bold text-green-600">${r.matched.total.toLocaleString('en-US', { minimumFractionDigits: 2 })}</span>
          </div>
        </div>

        <div className="bg-red-50 border-2 border-red-300 rounded-xl p-5">
          <div className="flex items-center gap-2 mb-2">
            <span className="text-2xl">🔴</span>
            <h3 className="text-lg font-bold text-red-800">Ghost Lines</h3>
          </div>
          <p className="text-sm text-red-700 mb-1">In invoice but NOT in our system — we're being charged for unknown lines!</p>
          <div className="flex justify-between items-end mt-3">
            <span className="text-3xl font-black text-red-700">{r.ghost.count}</span>
            <span className="text-lg font-bold text-red-600">${r.ghost.total.toLocaleString('en-US', { minimumFractionDigits: 2 })}</span>
          </div>
        </div>

        <div className="bg-orange-50 border-2 border-orange-300 rounded-xl p-5">
          <div className="flex items-center gap-2 mb-2">
            <span className="text-2xl">🟠</span>
            <h3 className="text-lg font-bold text-orange-800">Not Billed</h3>
          </div>
          <p className="text-sm text-orange-700 mb-1">Active in our system but NOT in invoice — candidates to cancel</p>
          <div className="flex justify-between items-end mt-3">
            <span className="text-3xl font-black text-orange-700">{r.not_billed.count}</span>
            <span className="text-sm font-bold text-orange-600">Est. monthly: ${r.not_billed.estimated_savings.toLocaleString('en-US', { minimumFractionDigits: 2 })}</span>
          </div>
        </div>
      </div>

      {/* Ghost Lines Detail */}
      {r.ghost.count > 0 && (
        <Section
          title="🔴 Ghost Lines — Billed but NOT in Our System"
          subtitle={`${r.ghost.count} unknown lines costing $${r.ghost.total.toFixed(2)}/month`}
          color="red"
          lines={r.ghost.lines}
          columns={['phone_number', 'description', 'amount']}
          headers={['Phone Number', 'Description', 'Amount']}
        />
      )}

      {/* Not Billed Detail */}
      {r.not_billed.count > 0 && (
        <Section
          title="🟠 Not Billed — Active in System but NOT in Invoice"
          subtitle={`${r.not_billed.count} lines not being billed — consider canceling or investigating`}
          color="orange"
          lines={r.not_billed.lines}
          columns={['phone_number', 'employee_name', 'carrier', 'monthly_cost']}
          headers={['Phone Number', 'Employee', 'Carrier', 'Monthly Cost']}
        />
      )}

      {/* Matched Lines Detail */}
      <Section
        title="✅ Matched Lines — In System AND in Invoice"
        subtitle={`${r.matched.count} lines totaling $${r.matched.total.toFixed(2)}`}
        color="green"
        lines={r.matched.lines}
        columns={['phone_number', 'description', 'amount']}
        headers={['Phone Number', 'Description', 'Amount']}
        defaultCollapsed={r.matched.count > 20}
      />
    </div>
  );
}

function InfoCard({ label, value }) {
  return (
    <div className="bg-white rounded-xl shadow-sm p-4">
      <p className="text-sm text-gray-500">{label}</p>
      <p className="text-lg font-semibold">{value}</p>
    </div>
  );
}

function Section({ title, subtitle, color, lines, columns, headers, defaultCollapsed = false }) {
  const [collapsed, setCollapsed] = useState(defaultCollapsed);
  const colors = {
    red: 'bg-red-50 border-red-200',
    orange: 'bg-orange-50 border-orange-200',
    green: 'bg-green-50 border-green-200',
  };
  const headerBg = {
    red: 'bg-red-100',
    orange: 'bg-orange-100',
    green: 'bg-green-100',
  };

  return (
    <div className={`rounded-xl shadow-sm border p-6 mb-6 ${colors[color]}`}>
      <div className="flex items-start justify-between mb-1 cursor-pointer" onClick={() => setCollapsed(!collapsed)}>
        <div>
          <h2 className="text-lg font-bold">{title}</h2>
          <p className="text-sm text-gray-600">{subtitle}</p>
        </div>
        <span className="text-gray-400 text-lg">{collapsed ? '▸' : '▾'}</span>
      </div>

      {!collapsed && (
        lines.length === 0 ? (
          <p className="text-gray-400 mt-4">No lines</p>
        ) : (
          <table className="w-full text-sm mt-4">
            <thead className={headerBg[color]}>
              <tr>
                {headers.map((h, i) => (
                  <th key={i} className="px-4 py-2 text-left font-medium">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200 bg-white/50">
              {lines.map((l, i) => (
                <tr key={i}>
                  {columns.map((col, j) => (
                    <td key={j} className={`px-4 py-2 ${col === 'phone_number' ? 'font-mono font-medium' : ''}`}>
                      {col === 'amount' || col === 'monthly_cost'
                        ? (l[col] ? `$${Number(l[col]).toFixed(2)}` : '—')
                        : (l[col] || '—')}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        )
      )}
    </div>
  );
}
