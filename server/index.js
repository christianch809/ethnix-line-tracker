import express from 'express';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import { initDB } from './db.js';
import linesRouter from './routes/lines.js';
import devicesRouter from './routes/devices.js';
import invoicesRouter from './routes/invoices.js';
import auditRouter from './routes/audit.js';
import dashboardRouter from './routes/dashboard.js';

dotenv.config();

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors());
app.use(express.json());

app.use('/api/lines', linesRouter);
app.use('/api/devices', devicesRouter);
app.use('/api/invoices', invoicesRouter);
app.use('/api/audit', auditRouter);
app.use('/api/dashboard', dashboardRouter);

// In production, serve the built client
const clientDist = path.join(__dirname, '..', 'client', 'dist');
app.use(express.static(clientDist));
app.get('*', (req, res) => {
  if (!req.path.startsWith('/api')) {
    res.sendFile(path.join(clientDist, 'index.html'));
  }
});

initDB().then(() => {
  app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}).catch(err => {
  console.error('Failed to initialize database:', err);
  process.exit(1);
});
