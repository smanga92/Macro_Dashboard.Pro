import { Router } from 'express';
import { requireAdmin, requireCron } from '../middleware/auth.js';
import { getLatestDashboard, runMorningDashboard, getDashboardHistory, runPostEventDashboard } from '../services/dashboardService.js';
import { getDb } from '../utils/db.js';

const router = Router();

// GET /api/dashboard/latest
router.get('/latest', (req, res) => {
  try {
    const dashboard = getLatestDashboard();
    if (!dashboard) return res.json({ available: false, message: 'No dashboard run yet. Trigger a run from admin.' });
    res.json({ available: true, ...dashboard });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/dashboard/run — admin OR cron triggered
router.post('/run', (req, res, next) => {
  const cronSecret = process.env.CRON_SECRET;
  const providedCron = req.headers['x-cron-secret'];
  if (cronSecret && providedCron === cronSecret) return next();
  requireAdmin(req, res, next);
}, async (req, res) => {
  try {
    const result = await runMorningDashboard();
    res.json({ success: true, ...result });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/dashboard/run-event/:eventId — admin OR cron triggered
router.post('/run-event/:eventId', (req, res, next) => {
  const cronSecret = process.env.CRON_SECRET;
  const providedCron = req.headers['x-cron-secret'];
  if (cronSecret && providedCron === cronSecret) return next();
  requireAdmin(req, res, next);
}, async (req, res) => {
  try {
    const { delay = '1min' } = req.body;
    const result = await runPostEventDashboard(req.params.eventId, delay);
    res.json({ success: true, ...result });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/dashboard/history
router.get('/history', (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 20;
    res.json(getDashboardHistory(limit));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/dashboard/snapshot/:id
router.get('/snapshot/:id', (req, res) => {
  try {
    const db = getDb();
    const snapshot = db.prepare('SELECT * FROM dashboard_snapshots WHERE id = ?').get(req.params.id);
    if (!snapshot) return res.status(404).json({ error: 'Snapshot not found' });
    const signals = db.prepare('SELECT * FROM asset_signals WHERE snapshot_id = ?').all(req.params.id);
    res.json({ ...snapshot, signals: signals.map(s => ({ ...s, drivers: JSON.parse(s.drivers || '[]') })) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
