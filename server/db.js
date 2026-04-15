import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DB_PATH = path.join(__dirname, 'database.sqlite');

let mode; // 'pg' or 'sqlite'
let pool; // pg Pool
let sqliteDb; // sql.js Database

// Convert SQLite-style SQL to PostgreSQL
function sqlToPg(sql) {
  let i = 0;
  return sql
    .replace(/\?/g, () => `$${++i}`)
    .replace(/datetime\(\s*'now'\s*\)/gi, 'CURRENT_TIMESTAMP')
    .replace(/\bLIKE\b/g, 'ILIKE');
}

function saveSqlite() {
  if (mode !== 'sqlite') return;
  const data = sqliteDb.export();
  fs.writeFileSync(DB_PATH, Buffer.from(data));
}

const SCHEMA_PG = `
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

const SCHEMA_SQLITE = `
  CREATE TABLE IF NOT EXISTS lines (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
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
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now'))
  );
  CREATE TABLE IF NOT EXISTS devices (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    equipment_type TEXT,
    model TEXT,
    imei TEXT,
    carrier TEXT DEFAULT 'AT&T',
    status TEXT DEFAULT 'available',
    condition TEXT DEFAULT 'perfect',
    location TEXT,
    assigned_to_line_id INTEGER,
    employee_name TEXT,
    entry_date TEXT,
    notes TEXT,
    verified INTEGER DEFAULT 0,
    verified_by TEXT,
    verified_at TEXT,
    created_by TEXT,
    updated_by TEXT,
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (assigned_to_line_id) REFERENCES lines(id)
  );
  CREATE TABLE IF NOT EXISTS audit_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    entity_type TEXT NOT NULL,
    entity_id INTEGER,
    action TEXT NOT NULL,
    changed_by TEXT,
    changes_json TEXT,
    timestamp TEXT DEFAULT (datetime('now'))
  );
  CREATE TABLE IF NOT EXISTS invoices (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    filename TEXT,
    file_path TEXT,
    carrier TEXT,
    billing_period TEXT,
    total_amount REAL,
    uploaded_by TEXT,
    upload_date TEXT DEFAULT (datetime('now')),
    status TEXT DEFAULT 'pending',
    raw_extracted_text TEXT
  );
  CREATE TABLE IF NOT EXISTS invoice_lines (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    invoice_id INTEGER NOT NULL,
    phone_number TEXT,
    description TEXT,
    amount REAL,
    matched_line_id INTEGER,
    match_status TEXT DEFAULT 'ghost',
    FOREIGN KEY (invoice_id) REFERENCES invoices(id),
    FOREIGN KEY (matched_line_id) REFERENCES lines(id)
  );
`;

export async function initDB() {
  if (process.env.DATABASE_URL) {
    mode = 'pg';
    const pg = await import('pg');
    pool = new pg.default.Pool({
      connectionString: process.env.DATABASE_URL,
      ssl: process.env.DB_SSL === 'false' ? false : { rejectUnauthorized: false }
    });
    // Create tables
    const statements = SCHEMA_PG.split(';').map(s => s.trim()).filter(Boolean);
    for (const stmt of statements) {
      await pool.query(stmt);
    }
    console.log('PostgreSQL database initialized.');
  } else {
    mode = 'sqlite';
    const initSqlJs = (await import('sql.js')).default;
    const SQL = await initSqlJs();
    if (fs.existsSync(DB_PATH)) {
      const buffer = fs.readFileSync(DB_PATH);
      sqliteDb = new SQL.Database(buffer);
    } else {
      sqliteDb = new SQL.Database();
    }
    const statements = SCHEMA_SQLITE.split(';').map(s => s.trim()).filter(Boolean);
    for (const stmt of statements) {
      sqliteDb.run(stmt);
    }
    // Migrations for older databases
    const migrations = [
      'ALTER TABLE lines ADD COLUMN verified INTEGER DEFAULT 0',
      'ALTER TABLE lines ADD COLUMN verified_by TEXT',
      'ALTER TABLE lines ADD COLUMN verified_at TEXT',
      'ALTER TABLE devices ADD COLUMN verified INTEGER DEFAULT 0',
      'ALTER TABLE devices ADD COLUMN verified_by TEXT',
      'ALTER TABLE devices ADD COLUMN verified_at TEXT',
    ];
    for (const m of migrations) {
      try { sqliteDb.run(m); } catch {}
    }
    saveSqlite();
    console.log('SQLite database initialized.');
  }
}

export async function query(sql, params = []) {
  if (mode === 'pg') {
    try {
      const result = await pool.query(sqlToPg(sql), params);
      return result.rows;
    } catch (err) {
      console.error('[DB QUERY ERROR]', err.message, '\nSQL:', sqlToPg(sql).substring(0, 200));
      throw err;
    }
  } else {
    const stmt = sqliteDb.prepare(sql);
    stmt.bind(params);
    const results = [];
    while (stmt.step()) results.push(stmt.getAsObject());
    stmt.free();
    return results;
  }
}

export async function run(sql, params = []) {
  if (mode === 'pg') {
    let pgSql = sqlToPg(sql);
    const trimmed = pgSql.replace(/[\s;]+$/g, '');
    const isInsert = trimmed.trimStart().toUpperCase().startsWith('INSERT');
    const finalSql = isInsert && !/RETURNING/i.test(trimmed)
      ? trimmed + ' RETURNING id'
      : trimmed;
    try {
      const result = await pool.query(finalSql, params);
      return { lastID: isInsert ? result.rows[0]?.id : null };
    } catch (err) {
      console.error('[DB ERROR]', err.message, '\nSQL:', finalSql.substring(0, 200));
      throw err;
    }
  } else {
    sqliteDb.run(sql, params);
    saveSqlite();
    return { lastID: sqliteDb.exec("SELECT last_insert_rowid()")[0]?.values[0]?.[0] };
  }
}

export async function queryRaw(sql, params = []) {
  if (mode === 'pg') {
    try {
      const result = await pool.query(sql, params);
      return result.rows;
    } catch (err) {
      console.error('[DB RAW ERROR]', err.message);
      throw err;
    }
  }
  return query(sql, params);
}

export function getMode() { return mode; }
