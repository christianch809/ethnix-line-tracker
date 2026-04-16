import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { run, query } from './db.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const USER = 'Chris';

export default async function autoSeed() {
  const data = JSON.parse(fs.readFileSync(path.join(__dirname, 'seed-data.json'), 'utf8'));
  console.log(`[AUTO-SEED] ${data.lines.length} lines, ${data.devices.length} devices`);

  const lineIdMap = {};
  for (const l of data.lines) {
    const result = await run(
      `INSERT INTO lines (phone_number, carrier, status, employee_name, department, location, activation_date, deactivation_date, created_by, updated_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [l.p, l.c, l.s, l.e, l.d, l.l, l.a || null, l.dd || null, USER, USER]
    );
    lineIdMap[l.i] = result.lastID;
  }

  for (const d of data.devices) {
    const lineId = d.li ? lineIdMap[d.li] : null;
    await run(
      `INSERT INTO devices (equipment_type, model, imei, carrier, status, condition, location, assigned_to_line_id, employee_name, entry_date, created_by, updated_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [d.t, d.m, d.im, d.c, d.s, d.co, d.l, lineId, d.e, d.ed || null, USER, USER]
    );
  }

  for (const l of data.lines) {
    await run(`INSERT INTO audit_log (entity_type, entity_id, action, changed_by, changes_json) VALUES ('line', ?, 'created', ?, ?)`,
      [lineIdMap[l.i], USER, JSON.stringify({ source: 'Auto-seed', phone: l.p })]);
  }

  for (const a of data.audit) {
    await run(`INSERT INTO audit_log (entity_type, entity_id, action, changed_by, changes_json) VALUES (?, ?, ?, ?, ?)`,
      [a.et, a.ei, a.a, a.cb, a.ch]);
  }

  const total = Number((await query('SELECT COUNT(*) as count FROM lines'))[0].count);
  console.log(`[AUTO-SEED] Done. ${total} lines in database.`);
}
