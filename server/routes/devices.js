import { Router } from 'express';
import { query, run } from '../db.js';

const router = Router();

// GET available lines (must be before /:id)
router.get('/available-lines', async (req, res) => {
  try {
    res.json(await query("SELECT id, phone_number, employee_name FROM lines WHERE status = 'active' ORDER BY phone_number"));
  } catch (err) {
    console.error('[DEVICES ERROR]', err); res.status(500).json({ error: String(err.message || err) });
  }
});

// GET all devices with optional filters
router.get('/', async (req, res) => {
  try {
    const { search, status, location, carrier, unverified } = req.query;
    let sql = `
      SELECT d.*, l.phone_number as line_phone, l.employee_name as line_employee
      FROM devices d
      LEFT JOIN lines l ON d.assigned_to_line_id = l.id
    `;
    const conditions = [];
    const params = [];

    if (search) {
      conditions.push(`(d.imei LIKE ? OR d.employee_name LIKE ? OR d.model LIKE ?)`);
      params.push(`%${search}%`, `%${search}%`, `%${search}%`);
    }
    if (status) { conditions.push(`d.status = ?`); params.push(status); }
    if (location) { conditions.push(`d.location = ?`); params.push(location); }
    if (carrier) { conditions.push(`d.carrier = ?`); params.push(carrier); }
    if (unverified === 'true') { conditions.push(`(d.verified = 0 OR d.verified IS NULL)`); }

    if (conditions.length) sql += ' WHERE ' + conditions.join(' AND ');
    sql += ' ORDER BY d.id ASC';

    res.json(await query(sql, params));
  } catch (err) {
    console.error('[DEVICES ERROR]', err); res.status(500).json({ error: String(err.message || err) });
  }
});

// GET single device
router.get('/:id', async (req, res) => {
  try {
    const rows = await query('SELECT * FROM devices WHERE id = ?', [req.params.id]);
    if (!rows.length) return res.status(404).json({ error: 'Device not found' });
    res.json(rows[0]);
  } catch (err) {
    console.error('[DEVICES ERROR]', err); res.status(500).json({ error: String(err.message || err) });
  }
});

// POST create device
router.post('/', async (req, res) => {
  try {
    const { equipment_type, model, imei, carrier, status, condition, location,
      employee_name, entry_date, notes, created_by } = req.body;

    const result = await run(`
      INSERT INTO devices (equipment_type, model, imei, carrier, status, condition, location,
        employee_name, entry_date, notes, created_by, updated_by)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [equipment_type, model, imei, carrier || 'AT&T', status || 'available',
      condition || 'perfect', location, employee_name, entry_date, notes, created_by, created_by]);

    await run(`INSERT INTO audit_log (entity_type, entity_id, action, changed_by, changes_json)
      VALUES ('device', ?, 'created', ?, ?)`,
      [result.lastID, created_by, JSON.stringify(req.body)]);

    res.json({ id: result.lastID, message: 'Device created' });
  } catch (err) {
    console.error('[DEVICES ERROR]', err); res.status(500).json({ error: String(err.message || err) });
  }
});

// PATCH inline edit
router.patch('/:id', async (req, res) => {
  try {
    const { updated_by, ...fields } = req.body;
    delete fields.id;
    delete fields.created_at;
    delete fields.created_by;

    const allowed = ['equipment_type', 'model', 'imei', 'carrier', 'status', 'condition',
      'location', 'employee_name', 'entry_date', 'notes'];

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

    await run(`UPDATE devices SET ${sets.join(', ')} WHERE id = ?`, params);

    // CASCADE: if employee_name or location changed on an assigned device, sync to its line
    if (fields.employee_name !== undefined || fields.location !== undefined) {
      const device = (await query('SELECT assigned_to_line_id FROM devices WHERE id = ?', [req.params.id]))[0];
      if (device?.assigned_to_line_id) {
        const lineSets = [];
        const lineParams = [];
        if (fields.employee_name !== undefined) {
          lineSets.push('employee_name = ?');
          lineParams.push(fields.employee_name || null);
        }
        if (fields.location !== undefined) {
          lineSets.push('location = ?');
          lineParams.push(fields.location || null);
        }
        lineSets.push('updated_by = ?', "updated_at = datetime('now')");
        lineParams.push(updated_by, device.assigned_to_line_id);
        await run(`UPDATE lines SET ${lineSets.join(', ')} WHERE id = ?`, lineParams);
      }
    }

    await run(`INSERT INTO audit_log (entity_type, entity_id, action, changed_by, changes_json)
      VALUES ('device', ?, 'updated', ?, ?)`,
      [req.params.id, updated_by, JSON.stringify(fields)]);

    res.json({ message: 'Device updated' });
  } catch (err) {
    console.error('[DEVICES ERROR]', err); res.status(500).json({ error: String(err.message || err) });
  }
});

// PUT full update device
router.put('/:id', async (req, res) => {
  try {
    const { equipment_type, model, imei, carrier, status, condition, location,
      employee_name, entry_date, notes, updated_by } = req.body;

    await run(`
      UPDATE devices SET equipment_type=?, model=?, imei=?, carrier=?, status=?, condition=?,
        location=?, employee_name=?, entry_date=?, notes=?, updated_by=?, updated_at=datetime('now')
      WHERE id = ?
    `, [equipment_type, model, imei, carrier, status, condition, location,
      employee_name, entry_date, notes, updated_by, req.params.id]);

    await run(`INSERT INTO audit_log (entity_type, entity_id, action, changed_by, changes_json)
      VALUES ('device', ?, 'updated', ?, ?)`,
      [req.params.id, updated_by, JSON.stringify(req.body)]);

    res.json({ message: 'Device updated' });
  } catch (err) {
    console.error('[DEVICES ERROR]', err); res.status(500).json({ error: String(err.message || err) });
  }
});

// PUT assign device to line
router.put('/:id/assign', async (req, res) => {
  try {
    const { line_id, updated_by } = req.body;

    if (!line_id) {
      const deviceRows = await query('SELECT * FROM devices WHERE id = ?', [req.params.id]);
      const oldLineId = deviceRows[0]?.assigned_to_line_id;
      await run(`UPDATE devices SET assigned_to_line_id=NULL, status='available',
        updated_by=?, updated_at=datetime('now') WHERE id=?`,
        [updated_by, req.params.id]);
      await run(`INSERT INTO audit_log (entity_type, entity_id, action, changed_by, changes_json)
        VALUES ('device', ?, 'unassigned', ?, ?)`,
        [req.params.id, updated_by, JSON.stringify({ previous_line_id: oldLineId })]);
      return res.json({ message: 'Device moved to storage' });
    }

    const lineRows = await query('SELECT * FROM lines WHERE id = ?', [line_id]);
    if (!lineRows.length) return res.status(404).json({ error: 'Line not found' });

    const existing = await query('SELECT id FROM devices WHERE assigned_to_line_id = ? AND id != ?', [line_id, req.params.id]);
    for (const ex of existing) {
      await run(`UPDATE devices SET assigned_to_line_id=NULL, status='available', updated_by=?, updated_at=datetime('now') WHERE id=?`,
        [updated_by, ex.id]);
    }

    await run(`UPDATE devices SET assigned_to_line_id=?, status='assigned', employee_name=?,
      updated_by=?, updated_at=datetime('now') WHERE id=?`,
      [line_id, lineRows[0].employee_name, updated_by, req.params.id]);

    await run(`INSERT INTO audit_log (entity_type, entity_id, action, changed_by, changes_json)
      VALUES ('device', ?, 'assigned', ?, ?)`,
      [req.params.id, updated_by, JSON.stringify({ line_id, phone_number: lineRows[0].phone_number })]);

    res.json({ message: 'Device assigned to line' });
  } catch (err) {
    console.error('[DEVICES ERROR]', err); res.status(500).json({ error: String(err.message || err) });
  }
});

// PUT unassign device from line
router.put('/:id/unassign', async (req, res) => {
  try {
    const { updated_by } = req.body;
    const deviceRows = await query('SELECT * FROM devices WHERE id = ?', [req.params.id]);
    if (!deviceRows.length) return res.status(404).json({ error: 'Device not found' });

    const oldLineId = deviceRows[0].assigned_to_line_id;

    await run(`UPDATE devices SET assigned_to_line_id=NULL, status='available',
      updated_by=?, updated_at=datetime('now') WHERE id=?`,
      [updated_by, req.params.id]);

    await run(`INSERT INTO audit_log (entity_type, entity_id, action, changed_by, changes_json)
      VALUES ('device', ?, 'unassigned', ?, ?)`,
      [req.params.id, updated_by, JSON.stringify({ previous_line_id: oldLineId })]);

    res.json({ message: 'Device unassigned' });
  } catch (err) {
    console.error('[DEVICES ERROR]', err); res.status(500).json({ error: String(err.message || err) });
  }
});

// PUT verify/unverify
router.put('/:id/verify', async (req, res) => {
  try {
    const { verified, updated_by } = req.body;
    const now = new Date().toISOString();

    await run(`UPDATE devices SET verified=?, verified_by=?, verified_at=?, updated_by=?, updated_at=datetime('now') WHERE id=?`,
      [verified ? 1 : 0, verified ? updated_by : null, verified ? now : null, updated_by, req.params.id]);

    await run(`INSERT INTO audit_log (entity_type, entity_id, action, changed_by, changes_json)
      VALUES ('device', ?, ?, ?, ?)`,
      [req.params.id, verified ? 'verified' : 'unverified', updated_by,
        JSON.stringify({ verified, verified_by: updated_by, verified_at: now })]);

    res.json({ message: verified ? 'Device verified' : 'Device unverified' });
  } catch (err) {
    console.error('[DEVICES ERROR]', err); res.status(500).json({ error: String(err.message || err) });
  }
});

// DELETE device
router.delete('/:id', async (req, res) => {
  try {
    const { deleted_by } = req.body || {};
    const rows = await query('SELECT * FROM devices WHERE id = ?', [req.params.id]);
    if (!rows.length) return res.status(404).json({ error: 'Device not found' });

    await run('DELETE FROM devices WHERE id = ?', [req.params.id]);

    await run(`INSERT INTO audit_log (entity_type, entity_id, action, changed_by, changes_json)
      VALUES ('device', ?, 'deleted', ?, ?)`,
      [req.params.id, deleted_by || 'unknown', JSON.stringify({ equipment_type: rows[0].equipment_type, model: rows[0].model, imei: rows[0].imei })]);

    res.json({ message: 'Device deleted' });
  } catch (err) {
    console.error('[DEVICES ERROR]', err); res.status(500).json({ error: String(err.message || err) });
  }
});

export default router;
