import express from 'express';
import cors from 'cors';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import { initDB } from './db.js';
import linesRouter from './routes/lines.js';
import devicesRouter from './routes/devices.js';
import invoicesRouter from './routes/invoices.js';
import auditRouter from './routes/audit.js';
import dashboardRouter from './routes/dashboard.js';
import adminRouter from './routes/admin.js';
import headcountRouter from './routes/headcount.js';

dotenv.config();

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors());
app.use(express.json());

// Health check — always works, no dependencies
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', time: new Date().toISOString() });
});

// API routes
app.use('/api/lines', linesRouter);
app.use('/api/devices', devicesRouter);
app.use('/api/invoices', invoicesRouter);
app.use('/api/audit', auditRouter);
app.use('/api/dashboard', dashboardRouter);
app.use('/api/admin', adminRouter);
app.use('/api/headcount', headcountRouter);

// Serve built client
const clientDist = path.join(__dirname, '..', 'client', 'dist');
const indexHtml = path.join(clientDist, 'index.html');

if (fs.existsSync(indexHtml)) {
  console.log('Serving client from:', clientDist);
  app.use(express.static(clientDist));
  app.get('*', (req, res) => {
    res.sendFile(indexHtml);
  });
} else {
  console.log('WARNING: client/dist not found at', clientDist);
  app.get('/', (req, res) => {
    res.send(`
      <h1>Ethnix Line Tracker - Server Running</h1>
      <p>Client not built yet. API is working:</p>
      <ul>
        <li><a href="/api/health">/api/health</a></li>
        <li><a href="/api/admin/db-status">/api/admin/db-status</a></li>
      </ul>
      <p>To seed data: open browser console (F12) and run:</p>
      <pre>fetch('/api/admin/seed',{method:'POST'}).then(r=>r.json()).then(console.log)</pre>
    `);
  });
}

initDB().then(async () => {
  // Auto-seed if database is empty
  const { query } = await import('./db.js');
  const count = Number((await query('SELECT COUNT(*) as count FROM lines'))[0].count);
  if (count === 0) {
    console.log('Database is empty, auto-seeding...');
    try {
      const fs = await import('fs');
      const seedPath = path.join(__dirname, 'seed-data.json');
      if (fs.existsSync(seedPath)) {
        const { default: seedFn } = await import('./auto-seed.js');
        await seedFn();
        console.log('Auto-seed complete.');
      } else {
        console.log('No seed-data.json found, skipping auto-seed.');
      }
    } catch (err) {
      console.error('Auto-seed failed:', err);
    }
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on port ${PORT}`);
    console.log(`Database URL set: ${!!process.env.DATABASE_URL}`);
  });
}).catch(err => {
  console.error('Failed to initialize database:', err);
  process.exit(1);
});
