import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import { initDB, run, query } from './db.js';

dotenv.config();

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const data = JSON.parse(fs.readFileSync(path.join(__dirname, 'seed-data.json'), 'utf8'));
const USER = 'Chris';

async function seed() {
  await initDB();

  // Check if data already exists
  const existing = await query('SELECT COUNT(*) as c FROM lines');
  if (existing[0].c > 0) {
    console.log(`Database already has ${existing[0].c} lines. Skipping seed.`);
    console.log('To re-seed, delete all data first.');
    process.exit(0);
  }

  console.log(`Seeding ${data.lines.length} lines, ${data.devices.length} devices, ${data.audit.length} audit records...`);

  // Insert lines — track idx->id mapping
  const lineIdMap = {};
  for (const l of data.lines) {
    const result = await run(`
      INSERT INTO lines (phone_number, carrier, status, employee_name, department, location,
        activation_date, deactivation_date, created_by, updated_by)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [l.p, l.c, l.s, l.e, l.d, l.l, l.a || null, l.dd || null, USER, USER]);
    lineIdMap[l.i] = result.lastID;
  }
  console.log(`  Lines inserted: ${data.lines.length}`);

  // Insert devices
  for (const d of data.devices) {
    const lineId = d.li ? lineIdMap[d.li] : null;
    await run(`
      INSERT INTO devices (equipment_type, model, imei, carrier, status, condition, location,
        assigned_to_line_id, employee_name, entry_date, created_by, updated_by)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [d.t, d.m, d.im, d.c, d.s, d.co, d.l, lineId, d.e, d.ed || null, USER, USER]);
  }
  console.log(`  Devices inserted: ${data.devices.length}`);

  // Insert audit records for all lines
  for (const l of data.lines) {
    const lineId = lineIdMap[l.i];
    await run(`INSERT INTO audit_log (entity_type, entity_id, action, changed_by, changes_json)
      VALUES ('line', ?, 'created', ?, ?)`,
      [lineId, USER, JSON.stringify({ source: 'Seed import', phone: l.p, employee: l.e })]);
  }

  // Insert history audit records
  for (const a of data.audit) {
    await run(`INSERT INTO audit_log (entity_type, entity_id, action, changed_by, changes_json)
      VALUES (?, ?, ?, ?, ?)`,
      [a.et, a.ei, a.a, a.cb, a.ch]);
  }
  console.log(`  Audit records inserted: ${data.lines.length + data.audit.length}`);

  const totalLines = (await query('SELECT COUNT(*) as c FROM lines'))[0].c;
  const totalDevices = (await query('SELECT COUNT(*) as c FROM devices'))[0].c;
  const totalAudit = (await query('SELECT COUNT(*) as c FROM audit_log'))[0].c;

  console.log('\n===== SEED COMPLETE =====');
  console.log(`Total lines: ${totalLines}`);
  console.log(`Total devices: ${totalDevices}`);
  console.log(`Total audit records: ${totalAudit}`);
  process.exit(0);
}

seed().catch(err => {
  console.error('Seed failed:', err);
  process.exit(1);
});
