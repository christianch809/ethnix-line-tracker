import { Router } from 'express';
import { query, run } from '../db.js';

const router = Router();

// GET all lines with optional filters + invoice status
router.get('/', async (req, res) => {
  try {
    const { search, status, carrier, location, no_device, unverified } = req.query;

    // Find latest invoice
    const latestInv = await query('SELECT id FROM invoices ORDER BY upload_date DESC LIMIT 1');
    const latestInvId = latestInv.length ? latestInv[0].id : null;

    let invoicePhoneSet = null;
    if (latestInvId) {
      const invLines = await query('SELECT phone_number FROM invoice_lines WHERE invoice_id = ?', [latestInvId]);
      invoicePhoneSet = new Set(invLines.map(il => (il.phone_number || '').replace(/\D/g, '').slice(-10)));
    }

    let sql = `
      SELECT l.*,
        d.id as device_id, d.equipment_type as device_type, d.model as device_model, d.imei as device_imei
      FROM lines l
      LEFT JOIN devices d ON d.assigned_to_line_id = l.id
    `;
    const conditions = [];
    const params = [];

    if (search) {
      conditions.push(`(l.phone_number LIKE ? OR l.employee_name LIKE ?)`);
      params.push(`%${search}%`, `%${search}%`);
    }
    if (status) { conditions.push(`l.status = ?`); params.push(status); }
    if (carrier) { conditions.push(`l.carrier = ?`); params.push(carrier); }
    if (location) { conditions.push(`l.location = ?`); params.push(location); }
    if (no_device === 'true') { conditions.push(`d.id IS NULL`); }
    if (unverified === 'true') { conditions.push(`(l.verified = 0 OR l.verified IS NULL)`); }

    if (conditions.length) sql += ' WHERE ' + conditions.join(' AND ');
    sql += ' ORDER BY l.id ASC';

    const rows = await query(sql, params);

    for (const row of rows) {
      if (!invoicePhoneSet) {
        row.invoice_status = null;
      } else {
        const normalized = (row.phone_number || '').replace(/\D/g, '').slice(-10);
        if (invoicePhoneSet.has(normalized)) {
          row.invoice_status = 'billed';
        } else if (row.status === 'active') {
          row.invoice_status = 'not_billed';
        } else {
          row.invoice_status = null;
        }
      }
    }

    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET single line
router.get('/:id', async (req, res) => {
  try {
    const rows = await query('SELECT * FROM lines WHERE id = ?', [req.params.id]);
    if (!rows.length) return res.status(404).json({ error: 'Line not found' });
    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST create line
router.post('/', async (req, res) => {
  try {
    const { phone_number, carrier, status, employee_name, department, location,
      plan_name, monthly_cost, activation_date, deactivation_date, notes, created_by } = req.body;

    const result = await run(`
      INSERT INTO lines (phone_number, carrier, status, employee_name, department, location,
        plan_name, monthly_cost, activation_date, deactivation_date, notes, created_by, updated_by)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [phone_number, carrier || 'AT&T', status || 'active', employee_name, department, location,
      plan_name, monthly_cost || null, activation_date, deactivation_date, notes, created_by, created_by]);

    await run(`INSERT INTO audit_log (entity_type, entity_id, action, changed_by, changes_json)
      VALUES ('line', ?, 'created', ?, ?)`,
      [result.lastID, created_by, JSON.stringify(req.body)]);

    res.json({ id: result.lastID, message: 'Line created' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PATCH inline edit
router.patch('/:id', async (req, res) => {
  try {
    const { updated_by, ...fields } = req.body;
    delete fields.id;
    delete fields.created_at;
    delete fields.created_by;

    const allowed = ['phone_number', 'carrier', 'status', 'employee_name', 'department',
      'location', 'plan_name', 'monthly_cost', 'activation_date', 'deactivation_date', 'notes'];

    const sets = [];
    const params = [];
    for (const [key, val] of Object.entries(fields)) {
      if (allowed.includes(key)) {
        sets.push(`${key} = ?`);
        params.push(val === '' ? null : val);
      }
    }
    if (!sets.length) return res.status(400).json({ error: 'No valid fields to update' });

    sets.push('updated_by = ?', "updated_at = datetime('now')");
    params.push(updated_by, req.params.id);

    await run(`UPDATE lines SET ${sets.join(', ')} WHERE id = ?`, params);

    await run(`INSERT INTO audit_log (entity_type, entity_id, action, changed_by, changes_json)
      VALUES ('line', ?, 'updated', ?, ?)`,
      [req.params.id, updated_by, JSON.stringify(fields)]);

    res.json({ message: 'Line updated' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PUT full update line
router.put('/:id', async (req, res) => {
  try {
    const { phone_number, carrier, status, employee_name, department, location,
      plan_name, monthly_cost, activation_date, deactivation_date, notes, updated_by } = req.body;

    await run(`
      UPDATE lines SET phone_number=?, carrier=?, status=?, employee_name=?, department=?, location=?,
        plan_name=?, monthly_cost=?, activation_date=?, deactivation_date=?, notes=?,
        updated_by=?, updated_at=datetime('now')
      WHERE id = ?
    `, [phone_number, carrier, status, employee_name, department, location,
      plan_name, monthly_cost || null, activation_date, deactivation_date, notes,
      updated_by, req.params.id]);

    await run(`INSERT INTO audit_log (entity_type, entity_id, action, changed_by, changes_json)
      VALUES ('line', ?, 'updated', ?, ?)`,
      [req.params.id, updated_by, JSON.stringify(req.body)]);

    res.json({ message: 'Line updated' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PUT toggle status
router.put('/:id/toggle-status', async (req, res) => {
  try {
    const { status, updated_by } = req.body;
    const deactivation_date = status === 'inactive' ? new Date().toISOString().split('T')[0] : null;

    await run(`UPDATE lines SET status=?, deactivation_date=?, updated_by=?, updated_at=datetime('now') WHERE id=?`,
      [status, deactivation_date, updated_by, req.params.id]);

    const action = status === 'active' ? 'activated' : 'deactivated';
    await run(`INSERT INTO audit_log (entity_type, entity_id, action, changed_by, changes_json)
      VALUES ('line', ?, ?, ?, ?)`,
      [req.params.id, action, updated_by, JSON.stringify({ status })]);

    res.json({ message: `Line ${action}` });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PUT verify/unverify
router.put('/:id/verify', async (req, res) => {
  try {
    const { verified, updated_by } = req.body;
    const now = new Date().toISOString();

    await run(`UPDATE lines SET verified=?, verified_by=?, verified_at=?, updated_by=?, updated_at=datetime('now') WHERE id=?`,
      [verified ? 1 : 0, verified ? updated_by : null, verified ? now : null, updated_by, req.params.id]);

    await run(`INSERT INTO audit_log (entity_type, entity_id, action, changed_by, changes_json)
      VALUES ('line', ?, ?, ?, ?)`,
      [req.params.id, verified ? 'verified' : 'unverified', updated_by,
        JSON.stringify({ verified, verified_by: updated_by, verified_at: now })]);

    res.json({ message: verified ? 'Line verified' : 'Line unverified' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PUT assign device to line
router.put('/:id/assign-device', async (req, res) => {
  try {
    const { device_id, updated_by } = req.body;
    const lineId = req.params.id;

    const currentDevices = await query('SELECT id FROM devices WHERE assigned_to_line_id = ?', [lineId]);
    for (const cd of currentDevices) {
      await run(`UPDATE devices SET assigned_to_line_id=NULL, status='available', updated_by=?, updated_at=datetime('now') WHERE id=?`,
        [updated_by, cd.id]);
    }

    if (!device_id) {
      return res.json({ message: 'Device unassigned from line' });
    }

    const lineRows = await query('SELECT * FROM lines WHERE id = ?', [lineId]);
    if (!lineRows.length) return res.status(404).json({ error: 'Line not found' });

    await run(`UPDATE devices SET assigned_to_line_id=?, status='assigned', employee_name=?,
      updated_by=?, updated_at=datetime('now') WHERE id=?`,
      [lineId, lineRows[0].employee_name, updated_by, device_id]);

    await run(`INSERT INTO audit_log (entity_type, entity_id, action, changed_by, changes_json)
      VALUES ('device', ?, 'assigned', ?, ?)`,
      [device_id, updated_by, JSON.stringify({ line_id: lineId, phone_number: lineRows[0].phone_number })]);

    res.json({ message: 'Device assigned to line' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
