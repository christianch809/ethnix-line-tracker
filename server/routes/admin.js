import { Router } from 'express';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { query, run, getMode } from '../db.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const router = Router();

// GET database status — for debugging
router.get('/db-status', async (req, res) => {
  try {
    const mode = getMode();
    const lines = (await query('SELECT COUNT(*) as count FROM lines'))[0];
    const devices = (await query('SELECT COUNT(*) as count FROM devices'))[0];
    const audit = (await query('SELECT COUNT(*) as count FROM audit_log'))[0];
    const invoices = (await query('SELECT COUNT(*) as count FROM invoices'))[0];

    res.json({
      mode,
      database_url_set: !!process.env.DATABASE_URL,
      counts: {
        lines: Number(lines.count),
        devices: Number(devices.count),
        audit_log: Number(audit.count),
        invoices: Number(invoices.count)
      }
    });
  } catch (err) {
    res.status(500).json({ error: err.message, stack: err.stack });
  }
});

// POST seed data — runs inside the server process with correct DATABASE_URL
router.post('/seed', async (req, res) => {
  const USER = 'Chris';

  try {
    // Check if already seeded
    const existing = await query('SELECT COUNT(*) as count FROM lines');
    const count = Number(existing[0].count);
    if (count > 0) {
      return res.json({ message: `Database already has ${count} lines. Seed skipped.`, lines: count });
    }

    // Load seed data
    const dataPath = path.join(__dirname, '..', 'seed-data.json');
    if (!fs.existsSync(dataPath)) {
      return res.status(404).json({ error: 'seed-data.json not found on server' });
    }
    const data = JSON.parse(fs.readFileSync(dataPath, 'utf8'));

    console.log(`[SEED] Starting: ${data.lines.length} lines, ${data.devices.length} devices, ${data.audit.length} audit`);
    console.log(`[SEED] Database mode: ${getMode()}`);

    // Insert lines
    const lineIdMap = {};
    for (const l of data.lines) {
      const result = await run(
        `INSERT INTO lines (phone_number, carrier, status, employee_name, department, location, activation_date, deactivation_date, created_by, updated_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [l.p, l.c, l.s, l.e, l.d, l.l, l.a || null, l.dd || null, USER, USER]
      );
      lineIdMap[l.i] = result.lastID;
    }
    console.log(`[SEED] Lines inserted: ${data.lines.length}`);

    // Insert devices
    for (const d of data.devices) {
      const lineId = d.li ? lineIdMap[d.li] : null;
      await run(
        `INSERT INTO devices (equipment_type, model, imei, carrier, status, condition, location, assigned_to_line_id, employee_name, entry_date, created_by, updated_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [d.t, d.m, d.im, d.c, d.s, d.co, d.l, lineId, d.e, d.ed || null, USER, USER]
      );
    }
    console.log(`[SEED] Devices inserted: ${data.devices.length}`);

    // Insert audit
    for (const l of data.lines) {
      const lineId = lineIdMap[l.i];
      await run(
        `INSERT INTO audit_log (entity_type, entity_id, action, changed_by, changes_json) VALUES ('line', ?, 'created', ?, ?)`,
        [lineId, USER, JSON.stringify({ source: 'Seed', phone: l.p, employee: l.e })]
      );
    }
    for (const a of data.audit) {
      await run(
        `INSERT INTO audit_log (entity_type, entity_id, action, changed_by, changes_json) VALUES (?, ?, ?, ?, ?)`,
        [a.et, a.ei, a.a, a.cb, a.ch]
      );
    }
    console.log(`[SEED] Audit inserted: ${data.lines.length + data.audit.length}`);

    // Verify
    const finalLines = Number((await query('SELECT COUNT(*) as count FROM lines'))[0].count);
    const finalDevices = Number((await query('SELECT COUNT(*) as count FROM devices'))[0].count);
    const finalAudit = Number((await query('SELECT COUNT(*) as count FROM audit_log'))[0].count);

    console.log(`[SEED] COMPLETE — Lines: ${finalLines}, Devices: ${finalDevices}, Audit: ${finalAudit}`);

    res.json({
      message: 'Seed complete',
      lines: finalLines,
      devices: finalDevices,
      audit: finalAudit
    });
  } catch (err) {
    console.error('[SEED] ERROR:', err);
    res.status(500).json({ error: err.message, stack: err.stack });
  }
});

// POST clear all data (for re-seeding)
router.post('/clear', async (req, res) => {
  try {
    await run('DELETE FROM invoice_lines');
    await run('DELETE FROM invoices');
    await run('DELETE FROM devices');
    await run('DELETE FROM audit_log');
    await run('DELETE FROM lines');
    res.json({ message: 'All data cleared' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET last invoice debug — shows raw extracted text and processing details
router.get('/invoice-debug', async (req, res) => {
  try {
    const invoices = await query('SELECT * FROM invoices ORDER BY upload_date DESC LIMIT 1');
    if (!invoices.length) return res.json({ error: 'No invoices found' });

    const inv = invoices[0];
    const lines = await query('SELECT * FROM invoice_lines WHERE invoice_id = ?', [inv.id]);
    const rawText = inv.raw_extracted_text || '';

    // Find phone-like patterns in raw text
    const phoneRegex = /\(?\d{3}\)?[\s.-]?\d{3}[\s.-]?\d{4}/g;
    const phonesInText = [...new Set((rawText.match(phoneRegex) || []).map(p => p.replace(/\D/g, '').slice(-10)))];

    res.json({
      invoice_id: inv.id,
      filename: inv.filename,
      carrier: inv.carrier,
      total_amount: inv.total_amount,
      raw_text_length: rawText.length,
      raw_text_first_2000: rawText.substring(0, 2000),
      raw_text_last_1000: rawText.substring(rawText.length - 1000),
      phone_numbers_found_in_raw_text: phonesInText.length,
      phone_numbers_sample: phonesInText.slice(0, 20),
      invoice_lines_extracted: lines.length,
      invoice_lines: lines.slice(0, 20),
      api_key_set: !!process.env.ANTHROPIC_API_KEY,
      api_key_prefix: process.env.ANTHROPIC_API_KEY ? process.env.ANTHROPIC_API_KEY.substring(0, 10) + '...' : 'NOT SET'
    });
  } catch (err) {
    res.status(500).json({ error: err.message, stack: err.stack });
  }
});

// POST reprocess last invoice — shows exactly what happens step by step
router.post('/reprocess-invoice', async (req, res) => {
  const log = [];
  const addLog = (msg) => { console.log('[REPROCESS]', msg); log.push(msg); };

  try {
    const invoices = await query('SELECT * FROM invoices ORDER BY upload_date DESC LIMIT 1');
    if (!invoices.length) return res.json({ error: 'No invoices found', log });

    const inv = invoices[0];
    addLog(`Invoice: ${inv.filename}, carrier: ${inv.carrier}`);

    const filePath = inv.file_path;
    addLog(`File path: ${filePath}`);

    const fsModule = await import('fs');
    if (!fsModule.existsSync(filePath)) {
      addLog('ERROR: File not found on disk! It was lost during redeploy.');
      return res.json({ error: 'PDF file not found on server', log });
    }

    const pdfBuffer = fsModule.readFileSync(filePath);
    addLog(`PDF size: ${(pdfBuffer.length / 1024).toFixed(0)} KB`);

    const pdfBase64 = pdfBuffer.toString('base64');
    addLog(`Base64 size: ${(pdfBase64.length / 1024).toFixed(0)} KB`);

    addLog('Checking API key...');
    if (!process.env.ANTHROPIC_API_KEY) {
      addLog('ERROR: ANTHROPIC_API_KEY not set!');
      return res.json({ error: 'No API key', log });
    }
    addLog('API key OK: ' + process.env.ANTHROPIC_API_KEY.substring(0, 12) + '...');

    const Anthropic = (await import('@anthropic-ai/sdk')).default;
    const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

    addLog('Sending PDF to Claude with document/vision...');
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
            {
              type: 'text',
              text: `Extract ALL phone numbers and their charges from this ${inv.carrier} invoice. Return JSON: {"total_amount": 123.45, "lines": [{"phone_number": "6155551234", "description": "plan", "amount": 45.00}]}`
            }
          ]
        }]
      });

      const content = message.content[0].text;
      addLog(`Claude response: ${content.substring(0, 500)}`);

      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        addLog(`Parsed: total=${parsed.total_amount}, lines=${parsed.lines?.length || 0}`);

        // Save to DB - delete old lines, insert new ones
        await run('DELETE FROM invoice_lines WHERE invoice_id = ?', [inv.id]);
        await run('UPDATE invoices SET total_amount = ? WHERE id = ?', [parsed.total_amount, inv.id]);

        const activeLines = await query("SELECT id, phone_number FROM lines WHERE status = 'active'");
        const sysPhoneMap = {};
        for (const al of activeLines) {
          sysPhoneMap[(al.phone_number || '').replace(/\D/g, '').slice(-10)] = al.id;
        }

        let matched = 0, ghost = 0;
        for (const line of (parsed.lines || [])) {
          const phone = (line.phone_number || '').replace(/\D/g, '').slice(-10);
          if (!phone || phone.length < 10) continue;
          const matchedId = sysPhoneMap[phone] || null;
          if (matchedId) matched++; else ghost++;
          await run(`INSERT INTO invoice_lines (invoice_id, phone_number, description, amount, matched_line_id, match_status)
            VALUES (?, ?, ?, ?, ?, ?)`,
            [inv.id, phone, line.description || '', Number(line.amount) || 0, matchedId, matchedId ? 'matched' : 'ghost']);
        }
        addLog(`Saved: ${matched} matched, ${ghost} ghost`);
        return res.json({ success: true, lines: (parsed.lines || []).length, matched, ghost, log });
      } else {
        addLog('ERROR: No JSON found in Claude response');
        return res.json({ error: 'No JSON in response', log });
      }
    } catch (apiErr) {
      addLog(`CLAUDE API ERROR: ${apiErr.message}`);
      addLog(`Error type: ${apiErr.constructor.name}`);
      if (apiErr.status) addLog(`HTTP status: ${apiErr.status}`);
      if (apiErr.error) addLog(`Error body: ${JSON.stringify(apiErr.error).substring(0, 500)}`);
      return res.json({ error: apiErr.message, log });
    }
  } catch (err) {
    addLog(`GENERAL ERROR: ${err.message}`);
    return res.status(500).json({ error: err.message, log });
  }
});

export default router;
