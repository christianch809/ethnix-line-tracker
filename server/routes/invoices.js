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
const upload = multer({ storage, limits: { fileSize: 30 * 1024 * 1024 } });

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

    console.log(`[INVOICE] Processing ${file.originalname} (${(file.size / 1024 / 1024).toFixed(1)}MB) for ${carrier}`);

    const pdfBuffer = fs.readFileSync(file.path);
    const pdfBase64 = pdfBuffer.toString('base64');

    // First try text extraction
    let rawText = '';
    try {
      const pdfParse = (await import('pdf-parse')).default;
      const pdfData = await pdfParse(pdfBuffer);
      rawText = pdfData.text || '';
    } catch (e) {
      console.log('[INVOICE] pdf-parse failed:', e.message);
    }

    const hasUsableText = rawText.replace(/\s/g, '').length > 500;
    console.log(`[INVOICE] Text extraction: ${rawText.length} chars, usable: ${hasUsableText}`);

    // Use Claude with PDF file directly (works for scanned/image PDFs)
    const Anthropic = (await import('@anthropic-ai/sdk')).default;
    const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

    const prompt = `You are a billing analyst extracting data from a ${carrier} corporate wireless invoice.

YOUR TASK: Find EVERY phone number/wireless line listed in this invoice and its charges.

RULES:
- Phone numbers appear as: (615) 555-1234, 615-555-1234, 615.555.1234, 6155551234
- Extract ONLY the 10-digit US phone number as just digits: "6155551234"
- For each phone, get the total monthly charges (recurring + fees + taxes for that line)
- If a phone appears multiple times, sum all its charges
- Include ALL phone numbers even if charges are $0
- Also find the invoice total amount

Return ONLY valid JSON:
{
  "total_amount": 1234.56,
  "lines": [
    {"phone_number": "6155551234", "description": "Plan or service name", "amount": 45.00}
  ]
}`;

    let allLines = [];
    let totalAmount = null;

    // Strategy 1: Send PDF directly to Claude (handles scanned/image PDFs)
    console.log('[INVOICE] Sending PDF to Claude with vision...');
    try {
      const message = await anthropic.messages.create({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 8192,
        messages: [{
          role: 'user',
          content: [
            {
              type: 'document',
              source: { type: 'base64', media_type: 'application/pdf', data: pdfBase64 }
            },
            { type: 'text', text: prompt }
          ]
        }]
      });

      const content = message.content[0].text;
      console.log('[INVOICE] Claude response length:', content.length);
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        totalAmount = parsed.total_amount || null;
        if (parsed.lines && Array.isArray(parsed.lines)) {
          allLines = parsed.lines;
        }
      }
      console.log(`[INVOICE] Vision extracted ${allLines.length} lines`);
    } catch (visionErr) {
      console.error('[INVOICE] Vision failed:', visionErr.message);

      // Strategy 2: Fall back to text if vision fails
      if (hasUsableText) {
        console.log('[INVOICE] Falling back to text extraction...');
        try {
          const textMsg = await anthropic.messages.create({
            model: 'claude-sonnet-4-20250514',
            max_tokens: 8192,
            messages: [{
              role: 'user',
              content: prompt + '\n\nINVOICE TEXT:\n' + rawText.substring(0, 80000)
            }]
          });
          const textContent = textMsg.content[0].text;
          const textMatch = textContent.match(/\{[\s\S]*\}/);
          if (textMatch) {
            const parsed = JSON.parse(textMatch[0]);
            totalAmount = parsed.total_amount || null;
            if (parsed.lines && Array.isArray(parsed.lines)) {
              allLines = parsed.lines;
            }
          }
          console.log(`[INVOICE] Text fallback extracted ${allLines.length} lines`);
        } catch (textErr) {
          console.error('[INVOICE] Text fallback also failed:', textErr.message);
        }
      }
    }

    // Deduplicate by phone number
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
    `, [file.originalname, file.path, carrier, billing_period, totalAmount, uploaded_by,
      rawText.substring(0, 100000) || 'PDF processed via vision (image-based)']);

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
      const matchedId = sysPhoneMap[line.phone_number] || null;
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
