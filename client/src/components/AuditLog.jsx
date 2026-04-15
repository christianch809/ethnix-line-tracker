import React, { useState, useEffect } from 'react';
import { api } from '../api';

export default function AuditLog() {
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filterEntity, setFilterEntity] = useState('');
  const [filterAction, setFilterAction] = useState('');

  useEffect(() => {
    const params = new URLSearchParams();
    if (filterEntity) params.set('entity_type', filterEntity);
    if (filterAction) params.set('action', filterAction);
    setLoading(true);
    api.getAuditLog(params.toString()).then(setLogs).catch(console.error).finally(() => setLoading(false));
  }, [filterEntity, filterAction]);

  return (
    <div>
      <h1 className="text-2xl font-bold text-gray-800 mb-6">Audit Log</h1>

      <div className="bg-white rounded-xl shadow-sm p-4 mb-6 flex gap-4">
        <select value={filterEntity} onChange={(e) => setFilterEntity(e.target.value)} className="border border-gray-300 rounded-lg px-3 py-2 text-sm">
          <option value="">All Entities</option>
          <option value="line">Lines</option>
          <option value="device">Devices</option>
        </select>
        <select value={filterAction} onChange={(e) => setFilterAction(e.target.value)} className="border border-gray-300 rounded-lg px-3 py-2 text-sm">
          <option value="">All Actions</option>
          <option value="created">Created</option>
          <option value="updated">Updated</option>
          <option value="activated">Activated</option>
          <option value="deactivated">Deactivated</option>
          <option value="assigned">Assigned</option>
          <option value="unassigned">Unassigned</option>
        </select>
      </div>

      <div className="bg-white rounded-xl shadow-sm overflow-x-auto">
        {loading ? (
          <div className="text-center py-12 text-gray-500">Loading...</div>
        ) : logs.length === 0 ? (
          <div className="text-center py-12 text-gray-400">No audit records</div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-gray-600 text-left">
              <tr>
                <th className="px-4 py-3">Date/Time</th>
                <th className="px-4 py-3">Entity</th>
                <th className="px-4 py-3">ID</th>
                <th className="px-4 py-3">Action</th>
                <th className="px-4 py-3">Changed By</th>
                <th className="px-4 py-3">Changes</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {logs.map(log => {
                let changes = {};
                try { changes = JSON.parse(log.changes_json || '{}'); } catch {}
                return (
                  <tr key={log.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3 text-xs">{new Date(log.timestamp).toLocaleString()}</td>
                    <td className="px-4 py-3 capitalize">{log.entity_type}</td>
                    <td className="px-4 py-3">{log.entity_id}</td>
                    <td className="px-4 py-3">
                      <span className={`px-2 py-0.5 rounded text-xs font-medium ${
                        log.action === 'created' ? 'bg-green-100 text-green-700' :
                        log.action === 'updated' ? 'bg-blue-100 text-blue-700' :
                        log.action === 'deactivated' ? 'bg-red-100 text-red-700' :
                        log.action === 'assigned' ? 'bg-purple-100 text-purple-700' :
                        log.action === 'unassigned' ? 'bg-yellow-100 text-yellow-700' :
                        'bg-gray-100 text-gray-700'
                      }`}>{log.action}</span>
                    </td>
                    <td className="px-4 py-3">{log.changed_by}</td>
                    <td className="px-4 py-3 text-xs max-w-md">
                      <pre className="whitespace-pre-wrap text-gray-500">{JSON.stringify(changes, null, 1)}</pre>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
      <p className="text-xs text-gray-400 mt-2">{logs.length} record(s)</p>
    </div>
  );
}
