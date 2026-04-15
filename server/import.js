import XLSX from 'xlsx';
import path from 'path';
import { fileURLToPath } from 'url';
import { initDB, run, query } from './db.js';
import dotenv from 'dotenv';

dotenv.config();

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const EXCEL_PATH = path.join(__dirname, 'Base de datos oficial telefonos - Ethnix Group sept25.xlsx');
const USER = 'Chris';

async function importData() {
  await initDB();
  console.log('Database initialized.');

  const workbook = XLSX.readFile(EXCEL_PATH);

  // ============================
  // 1. DISPOSITIVOS ACTIVOS
  // ============================
  console.log('\n--- Importing DISPOSITIVOS ACTIVOS ---');
  const activeSheet = workbook.Sheets['DISPOSITIVOS ACTIVOS'];
  const activeRows = XLSX.utils.sheet_to_json(activeSheet, { raw: false });
  let activeCount = 0;

  for (const row of activeRows) {
    const phone = (row['LINEA MOVIL'] || '').trim();
    if (!phone || phone === 'SIN LINEA') continue;

    const carrier = normalizeCarrier(row['Proveedor']);
    const employee = (row['Usuario Asignado'] || '').trim();
    const department = (row['CECO'] || '').trim();
    const location = (row['LOCATION'] || '').trim();
    const equipType = normalizeEquipType((row['EQUIPMENT TYPE'] || '').trim());
    const model = (row['MODEL'] || '').trim();
    const imei = normalizeImei(row['IMEI']);
    const condition = normalizeCondition(row['Condicion de equipo']);

    if (!employee && !imei && !model) continue;

    const lineResult = await run(`
      INSERT INTO lines (phone_number, carrier, status, employee_name, department, location,
        activation_date, created_by, updated_by)
      VALUES (?, ?, 'active', ?, ?, ?, ?, ?, ?)
    `, [phone, carrier, employee, department, location, row['Fecha de asignacion'] || null, USER, USER]);

    const lineId = lineResult.lastID;

    if (imei || model) {
      await run(`
        INSERT INTO devices (equipment_type, model, imei, carrier, status, condition, location,
          assigned_to_line_id, employee_name, entry_date, created_by, updated_by)
        VALUES (?, ?, ?, ?, 'assigned', ?, ?, ?, ?, ?, ?, ?)
      `, [equipType, model, imei, carrier, condition, location, lineId, employee,
        row['Fecha de asignacion'] || null, USER, USER]);
    }

    await run(`INSERT INTO audit_log (entity_type, entity_id, action, changed_by, changes_json)
      VALUES ('line', ?, 'created', ?, ?)`,
      [lineId, USER, JSON.stringify({ source: 'Excel Import - DISPOSITIVOS ACTIVOS', phone, employee })]);

    activeCount++;
  }
  console.log(`  Imported ${activeCount} active lines + devices.`);

  // ============================
  // 2. DISCON or SUSPEND
  // ============================
  console.log('\n--- Importing DISCON or SUSPEND ---');
  const disconSheet = workbook.Sheets['DISCON or SUSPEND'];
  const disconRows = XLSX.utils.sheet_to_json(disconSheet, { raw: false });
  let disconCount = 0;

  for (const row of disconRows) {
    const phone = (row['LINEA MOVIL'] || '').trim();
    if (!phone || phone === 'SIN LINEA') continue;

    const carrier = normalizeCarrier(row['Proveedor']);
    const employee = (row['Usuario Asignado'] || '').trim();
    const department = (row['CECO'] || '').trim();
    const location = (row['LOCATION'] || '').trim();
    const equipType = normalizeEquipType((row['EQUIPMENT TYPE'] || '').trim());
    const model = (row['MODEL'] || '').trim();
    const imei = normalizeImei(row['IMEI']);
    const condition = normalizeCondition(row['Condicion de equipo']);
    const deactivationDate = (row['Fecha de desconeccion'] || '').trim();

    const lineResult = await run(`
      INSERT INTO lines (phone_number, carrier, status, employee_name, department, location,
        deactivation_date, created_by, updated_by)
      VALUES (?, ?, 'inactive', ?, ?, ?, ?, ?, ?)
    `, [phone, carrier, employee, department, location, deactivationDate || null, USER, USER]);

    const lineId = lineResult.lastID;

    if (imei || model) {
      await run(`
        INSERT INTO devices (equipment_type, model, imei, carrier, status, condition, location,
          assigned_to_line_id, employee_name, created_by, updated_by)
        VALUES (?, ?, ?, ?, 'assigned', ?, ?, ?, ?, ?, ?)
      `, [equipType, model, imei, carrier, condition, location, lineId, employee, USER, USER]);
    }

    await run(`INSERT INTO audit_log (entity_type, entity_id, action, changed_by, changes_json)
      VALUES ('line', ?, 'created', ?, ?)`,
      [lineId, USER, JSON.stringify({ source: 'Excel Import - DISCON or SUSPEND', phone, status: 'inactive' })]);

    disconCount++;
  }
  console.log(`  Imported ${disconCount} disconnected/suspended lines.`);

  // ============================
  // 3. STOCK DISPOSITIVOS
  // ============================
  console.log('\n--- Importing STOCK DISPOSITIVOS ---');
  const stockSheet = workbook.Sheets['STOCK DISPOSITIVOS'];
  const stockRows = XLSX.utils.sheet_to_json(stockSheet, { raw: false });
  let stockCount = 0;

  for (const row of stockRows) {
    const equipType = normalizeEquipType((row['EQUIPMENT TYPE'] || '').trim());
    const model = (row['MODEL'] || '').trim();
    const imei = normalizeImei(row['IMEI']);
    const carrier = normalizeCarrier(row['Proveedor']);
    const location = (row['UBICACION'] || '').trim();
    const condition = normalizeCondition(row['CONDICION']);
    const status = normalizeDeviceStatus(row['ESTADO']);
    const entryDate = (row['FECHA DE ENTRADA'] || '').trim();

    if (!imei && !model) continue;

    const result = await run(`
      INSERT INTO devices (equipment_type, model, imei, carrier, status, condition, location,
        assigned_to_line_id, entry_date, created_by, updated_by)
      VALUES (?, ?, ?, ?, ?, ?, ?, NULL, ?, ?, ?)
    `, [equipType, model, imei, carrier, status, condition, location, entryDate || null, USER, USER]);

    await run(`INSERT INTO audit_log (entity_type, entity_id, action, changed_by, changes_json)
      VALUES ('device', ?, 'created', ?, ?)`,
      [result.lastID, USER, JSON.stringify({ source: 'Excel Import - STOCK DISPOSITIVOS', imei, status })]);

    stockCount++;
  }
  console.log(`  Imported ${stockCount} stock devices.`);

  // ============================
  // 4. HISTORIAL DE CAMBIOS Y REEMPLAZ
  // ============================
  console.log('\n--- Importing HISTORIAL DE CAMBIOS Y REEMPLAZ ---');
  const histSheet = workbook.Sheets['HISTORIAL DE CAMBIOS Y REEMPLAZ'];
  const histRows = XLSX.utils.sheet_to_json(histSheet, { raw: false });
  let histCount = 0;

  for (const row of histRows) {
    const action = (row['Accion'] || '').trim().toLowerCase();
    const changedBy = (row['Ususario que registro el cambio'] || USER).trim();

    const changes = {
      source: 'Excel Import - HISTORIAL',
      equipment_type: row['EQUIPMENT TYPE'],
      model: row['MODEL'],
      imei: row['IMEI'],
      action_original: row['Accion'],
      previous_user: row['Usuario anterior'],
      new_user: row['Nuevo usuario'],
      date: row['Fecha del cambio'],
      reason: row['Motivo'],
      where: row['Donde se hizo o cambio'],
      line: row['Linea']
    };

    let mappedAction = 'updated';
    if (action.includes('activ')) mappedAction = 'created';
    else if (action.includes('baja') || action.includes('descon')) mappedAction = 'deactivated';
    else if (action.includes('asign')) mappedAction = 'assigned';

    await run(`INSERT INTO audit_log (entity_type, entity_id, action, changed_by, changes_json)
      VALUES ('device', ?, ?, ?, ?)`,
      [row['ID'] || null, mappedAction, changedBy, JSON.stringify(changes)]);

    histCount++;
  }
  console.log(`  Imported ${histCount} history records.`);

  // Summary
  const totalLines = (await query("SELECT COUNT(*) as c FROM lines"))[0].c;
  const totalDevices = (await query("SELECT COUNT(*) as c FROM devices"))[0].c;
  const totalAudit = (await query("SELECT COUNT(*) as c FROM audit_log"))[0].c;

  console.log('\n===== IMPORT COMPLETE =====');
  console.log(`Total lines: ${totalLines}`);
  console.log(`Total devices: ${totalDevices}`);
  console.log(`Total audit records: ${totalAudit}`);
  process.exit(0);
}

function normalizeCarrier(val) {
  if (!val) return 'AT&T';
  const v = val.trim().toUpperCase();
  if (v.includes('VERIZON')) return 'Verizon';
  return 'AT&T';
}

function normalizeEquipType(val) {
  if (!val) return 'Other';
  const v = val.toLowerCase().trim();
  if (v.includes('iphone')) return 'iPhone';
  if (v.includes('ipad')) return 'iPad';
  if (v.includes('galaxy') || v.includes('samsung')) return 'Galaxy';
  if (v.includes('hotspot') || v.includes('mifi') || v.includes('netgear') || v.includes('nighthawk')) return 'Hotspot';
  return val.trim();
}

function normalizeImei(val) {
  if (!val) return '';
  return String(val).replace(/[^0-9]/g, '');
}

function normalizeCondition(val) {
  if (!val) return 'good';
  const v = val.toLowerCase().trim();
  if (v.includes('perfec')) return 'perfect';
  if (v.includes('rota') || v.includes('dañ') || v.includes('damage') || v.includes('broken')) return 'damaged';
  return 'good';
}

function normalizeDeviceStatus(val) {
  if (!val) return 'available';
  const v = val.toLowerCase().trim();
  if (v.includes('disponible') || v.includes('available')) return 'available';
  if (v.includes('dañ') || v.includes('damage') || v.includes('roto')) return 'damaged';
  if (v.includes('perdid') || v.includes('lost')) return 'lost';
  return 'available';
}

importData().catch(err => {
  console.error('Import failed:', err);
  process.exit(1);
});
