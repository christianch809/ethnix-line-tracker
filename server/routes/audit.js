import { Router } from 'express';
import { query } from '../db.js';

const router = Router();

router.get('/', async (req, res) => {
  try {
    const { entity_type, action } = req.query;
    let sql = 'SELECT * FROM audit_log';
    const conditions = [];
    const params = [];

    if (entity_type) { conditions.push('entity_type = ?'); params.push(entity_type); }
    if (action) { conditions.push('action = ?'); params.push(action); }

    if (conditions.length) sql += ' WHERE ' + conditions.join(' AND ');
    sql += ' ORDER BY timestamp DESC LIMIT 500';

    res.json(await query(sql, params));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
