/**
 * import-to-railway.js
 * Script para importar datos del Excel directamente a la base de datos PostgreSQL de Railway.
 *
 * Uso:  node import-to-railway.js
 * Requiere: variable de entorno DATABASE_URL con la URL de PostgreSQL de Railway.
 */

import pg from 'pg';
import XLSX from 'xlsx';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const EXCEL_PATH = path.join(__dirname, 'server', 'Base de datos oficial telefonos - Ethnix Group sept25.xlsx');
const USER = 'Chris';

// ============================================================
// DATABASE CONNECTION
// ============================================================

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error('ERROR: Falta la variable DATABASE_URL.');
  console.error('Ejecuta asi:  DATABASE_URL="postgresql://..." node import-to-railway.js');
  process.exit(1);
}

const pool = new pg.Pool({
  connectionString: DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

async function query(sql, params = []) {
  const result = await pool.query(sql, params);
  return result.rows;
}

async function run(sql, params = []) {
  const isInsert = sql.trim().toUpperCase().startsWith('INSERT');
  let finalSql = sql;
  if (isInsert && !/RETURNING/i.test(finalSql)) {
    finalSql = finalSql.trimEnd().replace(/;?\s*$/, '') + ' RETURNING id';
  }
  const result = await pool.query(finalSql, params);
  return { lastID: isInsert ? result.rows[0]?.id : null };
}

// ============================================================
// SCHEMA — creates all 5 tables
// ============================================================

const SCHEMA = `
CREATE TABLE IF NOT EXISTS lines (
  id SERIAL PRIMARY KEY,
  phone_number TEXT NOT NULL,
  carrier TEXT DEFAULT 'AT&T',
  status TEXT DEFAULT 'active',
  employee_name TEXT,
  department TEXT,
  location TEXT,
  plan_name TEXT,
  monthly_cost REAL,
  activation_date TEXT,
  deactivation_date TEXT,
  notes TEXT,
  verified INTEGER DEFAULT 0,
  verified_by TEXT,
  verified_at TEXT,
  created_by TEXT,
  updated_by TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS devices (
  id SERIAL PRIMARY KEY,
  equipment_type TEXT,
  model TEXT,
  imei TEXT,
  carrier TEXT DEFAULT 'AT&T',
  status TEXT DEFAULT 'available',
  condition TEXT DEFAULT 'perfect',
  location TEXT,
  assigned_to_line_id INTEGER REFERENCES lines(id),
  employee_name TEXT,
  entry_date TEXT,
  notes TEXT,
  verified INTEGER DEFAULT 0,
  verified_by TEXT,
  verified_at TEXT,
  created_by TEXT,
  updated_by TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS audit_log (
  id SERIAL PRIMARY KEY,
  entity_type TEXT NOT NULL,
  entity_id INTEGER,
  action TEXT NOT NULL,
  changed_by TEXT,
  changes_json TEXT,
  timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS invoices (
  id SERIAL PRIMARY KEY,
  filename TEXT,
  file_path TEXT,
  carrier TEXT,
  billing_period TEXT,
  total_amount REAL,
  uploaded_by TEXT,
  upload_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  status TEXT DEFAULT 'pending',
  raw_extracted_text TEXT
);

CREATE TABLE IF NOT EXISTS invoice_lines (
  id SERIAL PRIMARY KEY,
  invoice_id INTEGER NOT NULL REFERENCES invoices(id),
  phone_number TEXT,
  description TEXT,
  amount REAL,
  matched_line_id INTEGER REFERENCES lines(id),
  match_status TEXT DEFAULT 'ghost'
);
`;

// ============================================================
// NORMALIZATION HELPERS (same as original import.js)
// ============================================================

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

// ============================================================
// MAIN IMPORT
// ============================================================

async function main() {
  console.log('=== ETHNIX LINE TRACKER — Importacion a Railway PostgreSQL ===\n');

  // 1. Test connection
  console.log('Conectando a Railway PostgreSQL...');
  try {
    const res = await pool.query('SELECT NOW()');
    console.log('Conexion exitosa. Hora del servidor:', res.rows[0].now);
  } catch (err) {
    console.error('ERROR: No se pudo conectar a la base de datos.');
    console.error(err.message);
    process.exit(1);
  }

  // 2. Create tables
  console.log('\nCreando tablas...');
  const statements = SCHEMA.split(';').map(s => s.trim()).filter(Boolean);
  for (const stmt of statements) {
    await pool.query(stmt);
  }
  console.log('Tablas creadas: lines, devices, audit_log, invoices, invoice_lines');

  // 3. Check if tables already have data
  const existingLines = (await query('SELECT COUNT(*) as c FROM lines'))[0].c;
  if (parseInt(existingLines) > 0) {
    console.log(`\nADVERTENCIA: La tabla "lines" ya tiene ${existingLines} registros.`);
    console.log('Se va a BORRAR todo y reimportar desde cero...');
    await pool.query('DELETE FROM invoice_lines');
    await pool.query('DELETE FROM invoices');
    await pool.query('DELETE FROM audit_log');
    await pool.query('DELETE FROM devices');
    await pool.query('DELETE FROM lines');
    // Reset sequences
    await pool.query("ALTER SEQUENCE lines_id_seq RESTART WITH 1");
    await pool.query("ALTER SEQUENCE devices_id_seq RESTART WITH 1");
    await pool.query("ALTER SEQUENCE audit_log_id_seq RESTART WITH 1");
    console.log('Tablas limpiadas.');
  }

  // 4. Read Excel
  console.log('\nLeyendo archivo Excel...');
  const workbook = XLSX.readFile(EXCEL_PATH);
  console.log('Hojas encontradas:', workbook.SheetNames.join(', '));

  // ============================
  // SHEET 1: DISPOSITIVOS ACTIVOS
  // ============================
  console.log('\n--- Importando DISPOSITIVOS ACTIVOS ---');
  const activeSheet = workbook.Sheets['DISPOSITIVOS ACTIVOS'];
  if (!activeSheet) {
    console.log('  ADVERTENCIA: Hoja "DISPOSITIVOS ACTIVOS" no encontrada. Saltando.');
  } else {
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
        VALUES ($1, $2, 'active', $3, $4, $5, $6, $7, $8)
      `, [phone, carrier, employee, department, location, row['Fecha de asignacion'] || null, USER, USER]);

      const lineId = lineResult.lastID;

      if (imei || model) {
        await run(`
          INSERT INTO devices (equipment_type, model, imei, carrier, status, condition, location,
            assigned_to_line_id, employee_name, entry_date, created_by, updated_by)
          VALUES ($1, $2, $3, $4, 'assigned', $5, $6, $7, $8, $9, $10, $11)
        `, [equipType, model, imei, carrier, condition, location, lineId, employee,
          row['Fecha de asignacion'] || null, USER, USER]);
      }

      await run(`INSERT INTO audit_log (entity_type, entity_id, action, changed_by, changes_json)
        VALUES ('line', $1, 'created', $2, $3)`,
        [lineId, USER, JSON.stringify({ source: 'Excel Import - DISPOSITIVOS ACTIVOS', phone, employee })]);

      activeCount++;
    }
    console.log(`  Importadas ${activeCount} lineas activas + dispositivos.`);
  }

  // ============================
  // SHEET 2: DISCON or SUSPEND
  // ============================
  console.log('\n--- Importando DISCON or SUSPEND ---');
  const disconSheet = workbook.Sheets['DISCON or SUSPEND'];
  if (!disconSheet) {
    console.log('  ADVERTENCIA: Hoja "DISCON or SUSPEND" no encontrada. Saltando.');
  } else {
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
        VALUES ($1, $2, 'inactive', $3, $4, $5, $6, $7, $8)
      `, [phone, carrier, employee, department, location, deactivationDate || null, USER, USER]);

      const lineId = lineResult.lastID;

      if (imei || model) {
        await run(`
          INSERT INTO devices (equipment_type, model, imei, carrier, status, condition, location,
            assigned_to_line_id, employee_name, created_by, updated_by)
          VALUES ($1, $2, $3, $4, 'assigned', $5, $6, $7, $8, $9, $10)
        `, [equipType, model, imei, carrier, condition, location, lineId, employee, USER, USER]);
      }

      await run(`INSERT INTO audit_log (entity_type, entity_id, action, changed_by, changes_json)
        VALUES ('line', $1, 'created', $2, $3)`,
        [lineId, USER, JSON.stringify({ source: 'Excel Import - DISCON or SUSPEND', phone, status: 'inactive' })]);

      disconCount++;
    }
    console.log(`  Importadas ${disconCount} lineas desconectadas/suspendidas.`);
  }

  // ============================
  // SHEET 3: STOCK DISPOSITIVOS
  // ============================
  console.log('\n--- Importando STOCK DISPOSITIVOS ---');
  const stockSheet = workbook.Sheets['STOCK DISPOSITIVOS'];
  if (!stockSheet) {
    console.log('  ADVERTENCIA: Hoja "STOCK DISPOSITIVOS" no encontrada. Saltando.');
  } else {
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
        VALUES ($1, $2, $3, $4, $5, $6, $7, NULL, $8, $9, $10)
      `, [equipType, model, imei, carrier, status, condition, location, entryDate || null, USER, USER]);

      await run(`INSERT INTO audit_log (entity_type, entity_id, action, changed_by, changes_json)
        VALUES ('device', $1, 'created', $2, $3)`,
        [result.lastID, USER, JSON.stringify({ source: 'Excel Import - STOCK DISPOSITIVOS', imei, status })]);

      stockCount++;
    }
    console.log(`  Importados ${stockCount} dispositivos en stock.`);
  }

  // ============================
  // SHEET 4: HISTORIAL DE CAMBIOS Y REEMPLAZ
  // ============================
  console.log('\n--- Importando HISTORIAL DE CAMBIOS Y REEMPLAZ ---');
  const histSheet = workbook.Sheets['HISTORIAL DE CAMBIOS Y REEMPLAZ'];
  if (!histSheet) {
    console.log('  ADVERTENCIA: Hoja "HISTORIAL DE CAMBIOS Y REEMPLAZ" no encontrada. Saltando.');
  } else {
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
        VALUES ('device', $1, $2, $3, $4)`,
        [row['ID'] || null, mappedAction, changedBy, JSON.stringify(changes)]);

      histCount++;
    }
    console.log(`  Importados ${histCount} registros de historial.`);
  }

  // ============================
  // SUMMARY
  // ============================
  const totalLines = (await query('SELECT COUNT(*) as c FROM lines'))[0].c;
  const totalDevices = (await query('SELECT COUNT(*) as c FROM devices'))[0].c;
  const totalAudit = (await query('SELECT COUNT(*) as c FROM audit_log'))[0].c;

  console.log('\n========================================');
  console.log('  IMPORTACION COMPLETADA CON EXITO');
  console.log('========================================');
  console.log(`  Lineas totales:        ${totalLines}`);
  console.log(`  Dispositivos totales:  ${totalDevices}`);
  console.log(`  Registros de audit:    ${totalAudit}`);
  console.log('========================================\n');

  await pool.end();
  process.exit(0);
}

main().catch(err => {
  console.error('\nERROR FATAL durante la importacion:');
  console.error(err);
  pool.end();
  process.exit(1);
});
