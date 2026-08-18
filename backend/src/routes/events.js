import { Router } from 'express';
import { requireAdmin, requireCron } from '../middleware/auth.js';
import { fetchCalendarEvents } from '../services/sourceService.js';
import { getDb, generateId } from '../utils/db.js';

const router = Router();

// GET /api/events/upcoming
router.get('/upcoming', async (req, res) => {
  try {
    const db = getDb();
    const hours = parseInt(req.query.hours) || 24;

    let events = db.prepare(`
      SELECT * FROM calendar_events
      WHERE event_time >= datetime('now', '-1 hour')
        AND event_time <= datetime('now', '+${hours} hours')
      ORDER BY event_time ASC
    `).all();

    if (events.length === 0) {
      const fetched = await fetchCalendarEvents(hours);
      events = fetched.events;
    }

    const minImpact = req.query.impact || 'low';
    const impactRank = { low: 0, medium: 1, high: 2 };
    const filtered = events.filter(e => (impactRank[e.impact] || 0) >= (impactRank[minImpact] || 0));

    res.json({ events: filtered, count: filtered.length });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/events/refresh
router.post('/refresh', requireAdmin, async (req, res) => {
  try {
    const hours = parseInt(req.body.hours) || 48;
    const result = await fetchCalendarEvents(hours);
    res.json({ success: true, fetched: result.events.length, source: result.source_id });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/events/pending — used by post-event cron via API
router.get('/pending', (req, res) => {
  // Allow cron secret OR admin token
  const cronSecret = process.env.CRON_SECRET;
  const providedCron = req.headers['x-cron-secret'];
  const isValidCron = cronSecret && providedCron === cronSecret;

  if (!isValidCron) {
    const auth = req.headers.authorization;
    if (!auth) return res.status(401).json({ error: 'Unauthorized' });
  }

  try {
    const db = getDb();
    const pending = db.prepare(`
      SELECT * FROM calendar_events
      WHERE (refresh_1min_done = 0 OR refresh_30min_done = 0)
        AND event_time <= datetime('now')
        AND event_time >= datetime('now', '-2 hours')
        AND impact IN ('high', 'medium')
      ORDER BY event_time ASC
    `).all();
    res.json({ events: pending });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
