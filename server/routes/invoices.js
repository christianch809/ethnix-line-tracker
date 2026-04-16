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

// GET single invoice with reconciliation
router.get('/:id', async (req, res) => {
  try {
    const invoices = await query('SELECT * FROM invoices WHERE id = ?', [req.params.id]);
    if (!invoices.length) return res.status(404).json({ error: 'Invoice not found' });

    const invoice = invoices[0];
    invoice.lines = await query('SELECT * FROM invoice_lines WHERE invoice_id = ?', [invoice.id]);

    const matched = invoice.lines.filter(l => l.match_status === 'matched');
    const ghost = invoice.lines.filter(l => l.match_status === 'ghost');

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

    console.log(`[INVOICE] Processing ${file.originalname} for ${carrier}`);

    // Extract text from PDF
    const pdfParse = (await import('pdf-parse')).default;
    const pdfBuffer = fs.readFileSync(file.path);
    const pdfData = await pdfParse(pdfBuffer);
    const rawText = pdfData.text;

    console.log(`[INVOICE] Extracted ${rawText.length} chars from PDF`);

    // Use Claude to extract line items — send in chunks if needed
    const Anthropic = (await import('@anthropic-ai/sdk')).default;
    const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

    // For large invoices, split into chunks and merge results
    const MAX_CHUNK = 80000;
    const textChunks = [];
    for (let i = 0; i < rawText.length; i += MAX_CHUNK) {
      textChunks.push(rawText.substring(i, i + MAX_CHUNK));
    }

    console.log(`[INVOICE] Sending ${textChunks.length} chunk(s) to Claude`);

    let allLines = [];
    let totalAmount = null;

    for (let ci = 0; ci < textChunks.length; ci++) {
      const chunk = textChunks[ci];
      const isFirst = ci === 0;

      const prompt = `You are a billing analyst extracting data from a ${carrier} corporate wireless invoice.

YOUR TASK: Find EVERY phone number/wireless line listed in this invoice and its charges.

IMPORTANT RULES:
- Phone numbers can appear in formats like: (615) 555-1234, 615-555-1234, 615.555.1234, 6155551234, 615 555 1234
- Extract the 10-digit phone number as just digits: "6155551234"
- Look for recurring charges, monthly charges, line access fees, equipment charges, data charges
- Each phone number may appear multiple times — give me the TOTAL charges per phone number
- If you see a line with no clear amount, set amount to 0
- DO NOT skip any phone numbers. Include ALL of them even if charges are $0
${isFirst ? '- Also extract the total_amount for the entire invoice if visible' : '- This is a continuation chunk, focus on finding additional phone numbers'}

Return ONLY valid JSON, no other text:
{
  ${isFirst ? '"total_amount": 1234.56,' : ''}
  "lines": [
    {"phone_number": "6155551234", "description": "Line description or plan", "amount": 45.00}
  ]
}

${textChunks.length > 1 ? `This is part ${ci + 1} of ${textChunks.length} of the invoice.` : ''}

INVOICE TEXT:
${chunk}`;

      try {
        const message = await anthropic.messages.create({
          model: 'claude-sonnet-4-20250514',
          max_tokens: 8192,
          messages: [{ role: 'user', content: prompt }]
        });

        const content = message.content[0].text;
        const jsonMatch = content.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          const parsed = JSON.parse(jsonMatch[0]);
          if (isFirst && parsed.total_amount) totalAmount = parsed.total_amount;
          if (parsed.lines && Array.isArray(parsed.lines)) {
            allLines = allLines.concat(parsed.lines);
          }
        }
        console.log(`[INVOICE] Chunk ${ci + 1}: found ${allLines.length} lines so far`);
      } catch (aiErr) {
        console.error(`[INVOICE] Claude error on chunk ${ci + 1}:`, aiErr.message);
      }
    }

    // Deduplicate by phone number — merge amounts
    const phoneMap = {};
    for (const line of allLines) {
      const phone = (line.phone_number || '').replace(/\D/g, '').slice(-10);
      if (!phone || phone.length < 10) continue;
      if (phoneMap[phone]) {
        phoneMap[phone].amount = (phoneMap[phone].amount || 0) + (Number(line.amount) || 0);
        if (line.description && !phoneMap[phone].description.includes(line.description)) {
          phoneMap[phone].description += '; ' + line.description;
        }
      } else {
        phoneMap[phone] = {
          phone_number: phone,
          description: line.description || '',
          amount: Number(line.amount) || 0
        };
      }
    }
    const dedupedLines = Object.values(phoneMap);
    console.log(`[INVOICE] After dedup: ${dedupedLines.length} unique phone numbers`);

    // Save invoice
    const result = await run(`
      INSERT INTO invoices (filename, file_path, carrier, billing_period, total_amount, uploaded_by, raw_extracted_text, status)
      VALUES (?, ?, ?, ?, ?, ?, ?, 'pending')
    `, [file.originalname, file.path, carrier, billing_period, totalAmount, uploaded_by, rawText.substring(0, 100000)]);

    const invoiceId = result.lastID;

    // Match against system lines
    const activeLines = await query("SELECT id, phone_number FROM lines WHERE status = 'active'");
    const sysPhoneMap = {};
    for (const al of activeLines) {
      const normalized = (al.phone_number || '').replace(/\D/g, '').slice(-10);
      sysPhoneMap[normalized] = al.id;
    }

    let matchCount = 0;
    let ghostCount = 0;
    for (const line of dedupedLines) {
      const normalized = line.phone_number;
      const matchedId = sysPhoneMap[normalized] || null;
      const matchStatus = matchedId ? 'matched' : 'ghost';
      if (matchedId) matchCount++; else ghostCount++;

      await run(`INSERT INTO invoice_lines (invoice_id, phone_number, description, amount, matched_line_id, match_status)
        VALUES (?, ?, ?, ?, ?, ?)`,
        [invoiceId, line.phone_number, line.description, line.amount, matchedId, matchStatus]);
    }

    console.log(`[INVOICE] Done. ${dedupedLines.length} lines: ${matchCount} matched, ${ghostCount} ghost`);

    res.json({
      id: invoiceId,
      message: 'Invoice processed',
      lines_found: dedupedLines.length,
      matched: matchCount,
      ghost: ghostCount
    });
  } catch (err) {
    console.error('[INVOICE] Upload error:', err);
    res.status(500).json({ error: err.message });
  }
});

export default router;
