import { Router } from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { query, run } from '../db.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const uploadDir = path.join(__dirname, '..', 'uploads');
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });

const storage = multer.diskStorage({
  destination: uploadDir,
  filename: (req, file, cb) => cb(null, Date.now() + '-' + file.originalname)
});
const upload = multer({ storage });

const router = Router();

// GET all invoices
router.get('/', async (req, res) => {
  try {
    res.json(await query('SELECT * FROM invoices ORDER BY upload_date DESC'));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET single invoice with lines + reconciliation
router.get('/:id', async (req, res) => {
  try {
    const invoices = await query('SELECT * FROM invoices WHERE id = ?', [req.params.id]);
    if (!invoices.length) return res.status(404).json({ error: 'Invoice not found' });

    const invoice = invoices[0];
    invoice.lines = await query('SELECT * FROM invoice_lines WHERE invoice_id = ?', [invoice.id]);

    // Split into matched and ghost
    const matched = invoice.lines.filter(l => l.match_status === 'matched');
    const ghost = invoice.lines.filter(l => l.match_status === 'ghost');

    // Find not-billed: active lines for this carrier NOT in this invoice
    const invoicePhones = invoice.lines.map(l => l.phone_number).filter(Boolean);
    const invoicePhoneSet = new Set(invoicePhones.map(p => (p || '').replace(/\D/g, '').slice(-10)));

    const allActiveLines = await query(
      'SELECT id, phone_number, employee_name, carrier, monthly_cost FROM lines WHERE status = ? AND carrier = ?',
      ['active', invoice.carrier]
    );
    const notBilled = allActiveLines.filter(l => {
      const normalized = (l.phone_number || '').replace(/\D/g, '').slice(-10);
      return !invoicePhoneSet.has(normalized);
    });

    // Calculate totals
    const matchedTotal = matched.reduce((sum, l) => sum + (Number(l.amount) || 0), 0);
    const ghostTotal = ghost.reduce((sum, l) => sum + (Number(l.amount) || 0), 0);
    const notBilledEstimate = notBilled.reduce((sum, l) => sum + (Number(l.monthly_cost) || 0), 0);

    invoice.reconciliation = {
      matched: { lines: matched, count: matched.length, total: matchedTotal },
      ghost: { lines: ghost, count: ghost.length, total: ghostTotal },
      not_billed: { lines: notBilled, count: notBilled.length, estimated_savings: notBilledEstimate }
    };

    res.json(invoice);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST upload invoice
router.post('/upload', upload.single('invoice'), async (req, res) => {
  try {
    const { carrier, billing_period, uploaded_by } = req.body;
    const file = req.file;
    if (!file) return res.status(400).json({ error: 'No file uploaded' });

    // Extract text from PDF
    const pdfParse = (await import('pdf-parse')).default;
    const pdfBuffer = fs.readFileSync(file.path);
    const pdfData = await pdfParse(pdfBuffer);
    const rawText = pdfData.text;

    // Use Claude to extract line items
    const Anthropic = (await import('@anthropic-ai/sdk')).default;
    const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

    const message = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 4096,
      messages: [{
        role: 'user',
        content: `You are analyzing a ${carrier} phone bill. Extract ALL phone line items from this invoice text.

For each line, extract:
- phone_number (format: just digits, e.g., "6155551234")
- description (the plan or service description)
- amount (numeric value only, no $ sign)

Also extract the total_amount for the entire invoice.

Return ONLY valid JSON in this exact format, no other text:
{
  "total_amount": 1234.56,
  "lines": [
    {"phone_number": "6155551234", "description": "Unlimited Plan", "amount": 45.00}
  ]
}

Invoice text:
${rawText.substring(0, 15000)}`
      }]
    });

    let extracted = { total_amount: null, lines: [] };
    try {
      const content = message.content[0].text;
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (jsonMatch) extracted = JSON.parse(jsonMatch[0]);
    } catch (parseErr) {
      console.error('Failed to parse Claude response:', parseErr);
    }

    // Save invoice
    const result = await run(`
      INSERT INTO invoices (filename, file_path, carrier, billing_period, total_amount, uploaded_by, raw_extracted_text, status)
      VALUES (?, ?, ?, ?, ?, ?, ?, 'pending')
    `, [file.originalname, file.path, carrier, billing_period, extracted.total_amount, uploaded_by, rawText.substring(0, 50000)]);

    const invoiceId = result.lastID;

    // Match extracted lines against system lines
    const activeLines = await query("SELECT id, phone_number FROM lines WHERE status = 'active'");
    const phoneMap = {};
    for (const al of activeLines) {
      const normalized = (al.phone_number || '').replace(/\D/g, '').slice(-10);
      phoneMap[normalized] = al.id;
    }

    for (const line of extracted.lines) {
      const normalized = (line.phone_number || '').replace(/\D/g, '').slice(-10);
      const matchedId = phoneMap[normalized] || null;
      const matchStatus = matchedId ? 'matched' : 'ghost';

      await run(`INSERT INTO invoice_lines (invoice_id, phone_number, description, amount, matched_line_id, match_status)
        VALUES (?, ?, ?, ?, ?, ?)`,
        [invoiceId, line.phone_number, line.description, line.amount, matchedId, matchStatus]);
    }

    res.json({ id: invoiceId, message: 'Invoice processed', lines_found: extracted.lines.length });
  } catch (err) {
    console.error('Invoice upload error:', err);
    res.status(500).json({ error: err.message });
  }
});

export default router;
