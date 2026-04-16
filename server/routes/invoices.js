import { Router } from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { PDFDocument } from 'pdf-lib';
import { query, run } from '../db.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const uploadDir = path.join(__dirname, '..', 'uploads');
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });

const storage = multer.diskStorage({
  destination: uploadDir,
  filename: (req, file, cb) => cb(null, Date.now() + '-' + file.originalname)
});
const upload = multer({ storage, limits: { fileSize: 50 * 1024 * 1024 } });

const router = Router();

// Helper: split PDF into batches of N pages, return as base64 PDFs
async function splitPdfPages(pdfBuffer, pagesPerBatch = 3) {
  const srcDoc = await PDFDocument.load(pdfBuffer);
  const totalPages = srcDoc.getPageCount();
  const batches = [];

  for (let start = 0; start < totalPages; start += pagesPerBatch) {
    const end = Math.min(start + pagesPerBatch, totalPages);
    const newDoc = await PDFDocument.create();
    const pages = await newDoc.copyPages(srcDoc, Array.from({ length: end - start }, (_, i) => start + i));
    pages.forEach(p => newDoc.addPage(p));
    const bytes = await newDoc.save();
    batches.push({
      base64: Buffer.from(bytes).toString('base64'),
      pages: `${start + 1}-${end}`,
      sizeKB: Math.round(bytes.length / 1024)
    });
  }

  return { batches, totalPages };
}

// Helper: wait N ms
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

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

    const pdfBuffer = fs.readFileSync(file.path);
    console.log(`[INVOICE] Processing ${file.originalname} (${(pdfBuffer.length / 1024 / 1024).toFixed(1)}MB) for ${carrier}`);

    // Split PDF into small batches
    const { batches, totalPages } = await splitPdfPages(pdfBuffer, 3);
    console.log(`[INVOICE] ${totalPages} pages split into ${batches.length} batches`);

    // Setup Claude
    const Anthropic = (await import('@anthropic-ai/sdk')).default;
    const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

    const prompt = `Extract ALL phone numbers and charges from these ${carrier} invoice pages.
Phone numbers are 10-digit US numbers (e.g., 615-555-1234 → "6155551234").
Return ONLY JSON: {"total_amount": null, "lines": [{"phone_number": "6155551234", "description": "plan", "amount": 45.00}]}
Include EVERY phone number you see, even if amount is 0. If you see a total amount for the whole invoice, include it.`;

    let allLines = [];
    let totalAmount = null;

    // Process each batch with delay between them
    for (let i = 0; i < batches.length; i++) {
      const batch = batches[i];
      console.log(`[INVOICE] Batch ${i + 1}/${batches.length} (pages ${batch.pages}, ${batch.sizeKB}KB)`);

      // Wait between batches to respect rate limits
      if (i > 0) {
        console.log(`[INVOICE] Waiting 30s for rate limit...`);
        await sleep(30000);
      }

      try {
        const message = await anthropic.messages.create({
          model: 'claude-sonnet-4-20250514',
          max_tokens: 4096,
          messages: [{
            role: 'user',
            content: [
              {
                type: 'document',
                source: { type: 'base64', media_type: 'application/pdf', data: batch.base64 }
              },
              { type: 'text', text: prompt + `\nThese are pages ${batch.pages} of ${totalPages}.` }
            ]
          }]
        });

        const content = message.content[0].text;
        const jsonMatch = content.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          const parsed = JSON.parse(jsonMatch[0]);
          if (parsed.total_amount && !totalAmount) totalAmount = parsed.total_amount;
          if (parsed.lines && Array.isArray(parsed.lines)) {
            allLines = allLines.concat(parsed.lines);
          }
        }
        console.log(`[INVOICE] Batch ${i + 1}: found ${allLines.length} lines so far`);
      } catch (batchErr) {
        console.error(`[INVOICE] Batch ${i + 1} error:`, batchErr.message);
        // If rate limited, wait longer and retry once
        if (batchErr.status === 429) {
          console.log('[INVOICE] Rate limited, waiting 60s and retrying...');
          await sleep(60000);
          try {
            const retry = await anthropic.messages.create({
              model: 'claude-sonnet-4-20250514',
              max_tokens: 4096,
              messages: [{
                role: 'user',
                content: [
                  { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: batch.base64 } },
                  { type: 'text', text: prompt + `\nPages ${batch.pages} of ${totalPages}.` }
                ]
              }]
            });
            const retryContent = retry.content[0].text;
            const retryMatch = retryContent.match(/\{[\s\S]*\}/);
            if (retryMatch) {
              const parsed = JSON.parse(retryMatch[0]);
              if (parsed.total_amount && !totalAmount) totalAmount = parsed.total_amount;
              if (parsed.lines) allLines = allLines.concat(parsed.lines);
            }
            console.log(`[INVOICE] Retry OK: ${allLines.length} lines`);
          } catch (retryErr) {
            console.error(`[INVOICE] Retry also failed:`, retryErr.message);
          }
        }
      }
    }

    // Deduplicate
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
        phoneMap[phone] = { phone_number: phone, description: line.description || '', amount: Number(line.amount) || 0 };
      }
    }
    const dedupedLines = Object.values(phoneMap);
    console.log(`[INVOICE] Final: ${dedupedLines.length} unique lines from ${totalPages} pages`);

    // Save invoice
    const result = await run(`
      INSERT INTO invoices (filename, file_path, carrier, billing_period, total_amount, uploaded_by, raw_extracted_text, status)
      VALUES (?, ?, ?, ?, ?, ?, ?, 'pending')
    `, [file.originalname, file.path, carrier, billing_period, totalAmount, uploaded_by,
      `Processed ${totalPages} pages in ${batches.length} batches. Found ${dedupedLines.length} lines.`]);

    const invoiceId = result.lastID;

    // Match against system
    const activeLines = await query("SELECT id, phone_number FROM lines WHERE status = 'active'");
    const sysPhoneMap = {};
    for (const al of activeLines) {
      sysPhoneMap[(al.phone_number || '').replace(/\D/g, '').slice(-10)] = al.id;
    }

    let matchCount = 0, ghostCount = 0;
    for (const line of dedupedLines) {
      const matchedId = sysPhoneMap[line.phone_number] || null;
      if (matchedId) matchCount++; else ghostCount++;
      await run(`INSERT INTO invoice_lines (invoice_id, phone_number, description, amount, matched_line_id, match_status)
        VALUES (?, ?, ?, ?, ?, ?)`,
        [invoiceId, line.phone_number, line.description, line.amount, matchedId, matchedId ? 'matched' : 'ghost']);
    }

    console.log(`[INVOICE] Done: ${dedupedLines.length} lines (${matchCount} matched, ${ghostCount} ghost)`);

    res.json({
      id: invoiceId,
      message: `Invoice processed: ${totalPages} pages, ${dedupedLines.length} lines found`,
      total_pages: totalPages,
      lines_found: dedupedLines.length,
      matched: matchCount,
      ghost: ghostCount
    });
  } catch (err) {
    console.error('[INVOICE] Upload error:', err);
    res.status(500).json({ error: err.message });
  }
});

// DELETE invoice
router.delete('/:id', async (req, res) => {
  try {
    const { deleted_by, confirm_delete } = req.body || {};
    if (!confirm_delete) {
      return res.status(400).json({ error: 'Must send confirm_delete: true' });
    }

    const invoices = await query('SELECT * FROM invoices WHERE id = ?', [req.params.id]);
    if (!invoices.length) return res.status(404).json({ error: 'Invoice not found' });

    await run('DELETE FROM invoice_lines WHERE invoice_id = ?', [req.params.id]);
    await run('DELETE FROM invoices WHERE id = ?', [req.params.id]);

    await run(`INSERT INTO audit_log (entity_type, entity_id, action, changed_by, changes_json)
      VALUES ('invoice', ?, 'deleted', ?, ?)`,
      [req.params.id, deleted_by || 'unknown', JSON.stringify({ filename: invoices[0].filename })]);

    try {
      if (invoices[0].file_path && fs.existsSync(invoices[0].file_path)) fs.unlinkSync(invoices[0].file_path);
    } catch (e) {}

    res.json({ message: 'Invoice deleted' });
  } catch (err) {
    console.error('[INVOICE ERROR]', err);
    res.status(500).json({ error: err.message });
  }
});

export default router;
