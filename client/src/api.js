const BASE = '/api';

async function request(path, options = {}) {
  const res = await fetch(`${BASE}${path}`, {
    headers: { 'Content-Type': 'application/json', ...options.headers },
    ...options,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error || res.statusText);
  }
  return res.json();
}

export const api = {
  // Lines
  getLines: (params = '') => request(`/lines${params ? '?' + params : ''}`),
  getLine: (id) => request(`/lines/${id}`),
  createLine: (data) => request('/lines', { method: 'POST', body: JSON.stringify(data) }),
  updateLine: (id, data) => request(`/lines/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  patchLine: (id, data) => request(`/lines/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
  toggleLineStatus: (id, data) => request(`/lines/${id}/toggle-status`, { method: 'PUT', body: JSON.stringify(data) }),
  verifyLine: (id, data) => request(`/lines/${id}/verify`, { method: 'PUT', body: JSON.stringify(data) }),
  assignDeviceToLine: (lineId, data) => request(`/lines/${lineId}/assign-device`, { method: 'PUT', body: JSON.stringify(data) }),
  deleteLine: (id, data) => request(`/lines/${id}`, { method: 'DELETE', body: JSON.stringify(data) }),

  // Devices
  getDevices: (params = '') => request(`/devices${params ? '?' + params : ''}`),
  getDevice: (id) => request(`/devices/${id}`),
  createDevice: (data) => request('/devices', { method: 'POST', body: JSON.stringify(data) }),
  updateDevice: (id, data) => request(`/devices/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  patchDevice: (id, data) => request(`/devices/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
  assignDevice: (id, data) => request(`/devices/${id}/assign`, { method: 'PUT', body: JSON.stringify(data) }),
  unassignDevice: (id, data) => request(`/devices/${id}/unassign`, { method: 'PUT', body: JSON.stringify(data) }),
  verifyDevice: (id, data) => request(`/devices/${id}/verify`, { method: 'PUT', body: JSON.stringify(data) }),
  deleteDevice: (id, data) => request(`/devices/${id}`, { method: 'DELETE', body: JSON.stringify(data) }),
  getAvailableDevices: () => request('/devices?status=available'),
  getAvailableLines: () => request('/devices/available-lines'),

  // Invoices
  uploadInvoice: (formData) => fetch(`${BASE}/invoices/upload`, { method: 'POST', body: formData }).then(r => r.json()),
  getInvoices: () => request('/invoices'),
  getInvoice: (id) => request(`/invoices/${id}`),
  deleteInvoice: (id, data) => request(`/invoices/${id}`, { method: 'DELETE', body: JSON.stringify(data) }),

  // Audit
  getAuditLog: (params = '') => request(`/audit${params ? '?' + params : ''}`),

  // Headcount
  getHeadcount: (params = '') => request(`/headcount${params ? '?' + params : ''}`),

  // Dashboard
  getDashboard: () => request('/dashboard'),

  // Unassigned lines (lines with no device)
  getUnassignedLines: () => request('/lines?no_device=true'),
};
