import { Router } from 'express';
import { query } from '../db.js';

const router = Router();

router.get('/', async (req, res) => {
  try {
    const activeLines = (await query("SELECT COUNT(*) as count FROM lines WHERE status = 'active'"))[0].count;
    const monthlyCost = (await query("SELECT COALESCE(SUM(monthly_cost), 0) as total FROM lines WHERE status = 'active'"))[0].total;
    const assignedDevices = (await query("SELECT COUNT(*) as count FROM devices WHERE status = 'assigned'"))[0].count;
    const availableDevices = (await query("SELECT COUNT(*) as count FROM devices WHERE status = 'available'"))[0].count;
    const devicesByStatus = await query("SELECT status, COUNT(*) as count FROM devices GROUP BY status");
    const recentActivity = await query("SELECT * FROM audit_log ORDER BY timestamp DESC LIMIT 10");

    const latestInvoice = await query("SELECT id FROM invoices ORDER BY upload_date DESC LIMIT 1");
    let ghostLines = [];
    if (latestInvoice.length) {
      ghostLines = await query("SELECT phone_number FROM invoice_lines WHERE invoice_id = ? AND match_status = 'ghost'",
        [latestInvoice[0].id]);
    }

    res.json({
      activeLines,
      monthlyCost,
      assignedDevices,
      availableDevices,
      devicesByStatus,
      recentActivity,
      ghostLines
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
