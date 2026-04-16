import { Router } from 'express';
import { query } from '../db.js';

const router = Router();

router.get('/', async (req, res) => {
  try {
    const { search, missing } = req.query;

    // Get all lines with their devices
    const rows = await query(`
      SELECT l.id as line_id, l.phone_number, l.carrier, l.status as line_status,
        l.employee_name, l.department, l.location, l.notes as line_notes,
        d.id as device_id, d.equipment_type, d.model, d.imei, d.status as device_status
      FROM lines l
      LEFT JOIN devices d ON d.assigned_to_line_id = l.id
      WHERE l.status = 'active'
      ORDER BY l.employee_name ASC
    `);

    // Group by employee
    const employeeMap = {};
    for (const row of rows) {
      const name = (row.employee_name || 'Unknown').trim();
      if (!name) continue;

      if (!employeeMap[name]) {
        employeeMap[name] = {
          employee_name: name,
          department: row.department || '',
          location: row.location || '',
          lines: [],
          devices: [],
          notes: row.line_notes || ''
        };
      }
      employeeMap[name].lines.push({
        id: row.line_id,
        phone_number: row.phone_number,
        carrier: row.carrier
      });
      if (row.device_id) {
        employeeMap[name].devices.push({
          id: row.device_id,
          equipment_type: row.equipment_type,
          model: row.model,
          imei: row.imei
        });
      }
    }

    let result = Object.values(employeeMap);

    // Apply filters
    if (search) {
      const term = search.toLowerCase();
      result = result.filter(e =>
        e.employee_name.toLowerCase().includes(term) ||
        e.department.toLowerCase().includes(term) ||
        e.lines.some(l => l.phone_number.includes(term))
      );
    }
    if (missing === 'device') {
      result = result.filter(e => e.devices.length === 0);
    }
    if (missing === 'line') {
      result = result.filter(e => e.lines.length === 0);
    }

    res.json(result);
  } catch (err) {
    console.error('[HEADCOUNT ERROR]', err);
    res.status(500).json({ error: String(err.message || err) });
  }
});

export default router;
