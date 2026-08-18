import { Router } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { requireAdmin, requireCron } from '../middleware/auth.js';
import { getDb, generateId } from '../utils/db.js';
import { encrypt } from '../utils/crypto.js';
import { checkSourceHealth } from '../services/sourceService.js';
import { callAI } from '../services/aiService.js';
import { log } from '../utils/logger.js';

const router = Router();

// ── Auth ─────────────────────────────────────────────────────────

router.post('/login', async (req, res) => {
  try {
    const { username, password } = req.body;
    if (!username || !password) return res.status(400).json({ error: 'Username and password required' });

    const db = getDb();
    const user = db.prepare('SELECT * FROM admin_users WHERE username = ?').get(username);

    if (!user) {
      const count = db.prepare('SELECT COUNT(*) as c FROM admin_users').get().c;
      if (count === 0) {
        const hash = await bcrypt.hash(password, 12);
        db.prepare('INSERT INTO admin_users (id, username, password_hash) VALUES (?, ?, ?)').run(generateId(), username, hash);
        const secret = db.prepare("SELECT value FROM admin_settings WHERE key = 'admin_jwt_secret'").get()?.value;
        const token = jwt.sign({ username, role: 'admin' }, secret, { expiresIn: '7d' });
        return res.json({ token, message: 'First admin account created' });
      }
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const valid = await bcrypt.compare(password, user.password_hash);
    if (!valid) return res.status(401).json({ error: 'Invalid credentials' });

    const secret = db.prepare("SELECT value FROM admin_settings WHERE key = 'admin_jwt_secret'").get()?.value;
    const token = jwt.sign({ username, role: 'admin' }, secret, { expiresIn: '7d' });
    res.json({ token });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── AI Providers ─────────────────────────────────────────────────

router.get('/providers', requireAdmin, (req, res) => {
  const db = getDb();
  const providers = db.prepare('SELECT * FROM ai_providers ORDER BY priority ASC').all();
  res.json(providers.map(p => ({ ...p, api_key_encrypted: p.api_key_encrypted ? '***' : null })));
});

router.post('/providers', requireAdmin, (req, res) => {
  try {
    const { id, name, provider_type, api_key, base_url, model, priority = 99 } = req.body;
    if (!name || !provider_type) return res.status(400).json({ error: 'name and provider_type required' });

    const db = getDb();
    const providerId = id || generateId();
    const encrypted = api_key ? encrypt(api_key) : null;

    db.prepare(`
      INSERT INTO ai_providers (id, name, provider_type, api_key_encrypted, base_url, model, priority, enabled)
      VALUES (?, ?, ?, ?, ?, ?, ?, 1)
      ON CONFLICT(id) DO UPDATE SET
        name=excluded.name, provider_type=excluded.provider_type,
        api_key_encrypted=COALESCE(excluded.api_key_encrypted, api_key_encrypted),
        base_url=excluded.base_url, model=excluded.model, priority=excluded.priority,
        updated_at=CURRENT_TIMESTAMP
    `).run(providerId, name, provider_type, encrypted, base_url || null, model || null, priority);

    res.json({ success: true, id: providerId });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.patch('/providers/:id', requireAdmin, (req, res) => {
  try {
    const db = getDb();
    const { enabled, priority, model, api_key } = req.body;
    const fields = [];
    const vals = [];

    if (enabled !== undefined) { fields.push('enabled=?'); vals.push(enabled ? 1 : 0); }
    if (priority !== undefined) { fields.push('priority=?'); vals.push(priority); }
    if (model !== undefined) { fields.push('model=?'); vals.push(model); }
    if (api_key) { fields.push('api_key_encrypted=?'); vals.push(encrypt(api_key)); }
    fields.push('updated_at=CURRENT_TIMESTAMP');

    db.prepare(`UPDATE ai_providers SET ${fields.join(',')} WHERE id=?`).run(...vals, req.params.id);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.delete('/providers/:id', requireAdmin, (req, res) => {
  const db = getDb();
  db.prepare('DELETE FROM ai_providers WHERE id = ?').run(req.params.id);
  res.json({ success: true });
});

router.post('/providers/:id/test', requireAdmin, async (req, res) => {
  try {
    const db = getDb();
    const provider = db.prepare('SELECT * FROM ai_providers WHERE id = ?').get(req.params.id);
    if (!provider) return res.status(404).json({ error: 'Provider not found' });

    const orig = provider.enabled;
    db.prepare('UPDATE ai_providers SET enabled=1 WHERE id=?').run(req.params.id);

    try {
      const start = Date.now();
      const { result } = await callAI('Respond with exactly: {"status":"ok","test":true}');
      const duration = Date.now() - start;
      db.prepare('UPDATE ai_providers SET enabled=?, health_status=? WHERE id=?').run(orig, 'healthy', req.params.id);
      res.json({ success: true, duration_ms: duration, response_preview: result.slice(0, 200) });
    } catch (err) {
      db.prepare('UPDATE ai_providers SET enabled=?, health_status=? WHERE id=?').run(orig, 'unhealthy', req.params.id);
      res.json({ success: false, error: err.message });
    }
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── Data Sources ─────────────────────────────────────────────────

router.get('/sources', requireAdmin, (req, res) => {
  const db = getDb();
  const sources = db.prepare('SELECT * FROM data_sources ORDER BY category, priority ASC').all();
  res.json(sources.map(s => ({ ...s, api_key_encrypted: s.api_key_encrypted ? '***' : null })));
});

router.post('/sources', requireAdmin, (req, res) => {
  try {
    const { id, name, source_type, category, endpoint_url, api_key, config = '{}', priority = 99 } = req.body;
    if (!name || !source_type || !category) return res.status(400).json({ error: 'name, source_type, category required' });

    const db = getDb();
    const sourceId = id || generateId();
    const encrypted = api_key ? encrypt(api_key) : null;

    db.prepare(`
      INSERT INTO data_sources (id, name, source_type, category, endpoint_url, api_key_encrypted, config, priority, enabled)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1)
      ON CONFLICT(id) DO UPDATE SET
        name=excluded.name, source_type=excluded.source_type, category=excluded.category,
        endpoint_url=excluded.endpoint_url,
        api_key_encrypted=COALESCE(excluded.api_key_encrypted, api_key_encrypted),
        config=excluded.config, priority=excluded.priority, updated_at=CURRENT_TIMESTAMP
    `).run(sourceId, name, source_type, category, endpoint_url || null, encrypted, config, priority);

    res.json({ success: true, id: sourceId });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.patch('/sources/:id', requireAdmin, (req, res) => {
  try {
    const db = getDb();
    const { enabled, priority, api_key, config } = req.body;
    const fields = [];
    const vals = [];

    if (enabled !== undefined) { fields.push('enabled=?'); vals.push(enabled ? 1 : 0); }
    if (priority !== undefined) { fields.push('priority=?'); vals.push(priority); }
    if (api_key) { fields.push('api_key_encrypted=?'); vals.push(encrypt(api_key)); }
    if (config !== undefined) { fields.push('config=?'); vals.push(typeof config === 'string' ? config : JSON.stringify(config)); }
    fields.push('updated_at=CURRENT_TIMESTAMP');

    db.prepare(`UPDATE data_sources SET ${fields.join(',')} WHERE id=?`).run(...vals, req.params.id);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.delete('/sources/:id', requireAdmin, (req, res) => {
  const db = getDb();
  const src = db.prepare('SELECT * FROM data_sources WHERE id = ?').get(req.params.id);
  if (src?.is_default) return res.status(400).json({ error: 'Cannot delete a default source. Disable it instead.' });
  db.prepare('DELETE FROM data_sources WHERE id = ?').run(req.params.id);
  res.json({ success: true });
});

router.post('/test-source', requireAdmin, async (req, res) => {
  try {
    const { source_id } = req.body;
    if (!source_id) return res.status(400).json({ error: 'source_id required' });
    const result = await checkSourceHealth(source_id);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── Health & Logs ─────────────────────────────────────────────────

router.get('/health', requireAdmin, (req, res) => {
  const db = getDb();
  const providers = db.prepare('SELECT id, name, health_status, failure_count, last_used_at FROM ai_providers').all();
  const sources = db.prepare('SELECT id, name, category, health_status, failure_count, last_checked_at FROM data_sources').all();
  const lastSnapshot = db.prepare('SELECT created_at, is_stale FROM dashboard_snapshots ORDER BY created_at DESC LIMIT 1').get();
  res.json({ providers, sources, last_snapshot: lastSnapshot });
});

// Called by health-check cron via x-cron-secret
router.post('/health-check-all', requireCron, async (req, res) => {
  const db = getDb();
  const sources = db.prepare('SELECT id, name FROM data_sources WHERE enabled = 1').all();
  const results = [];

  for (const source of sources) {
    try {
      const result = await checkSourceHealth(source.id);
      results.push({ id: source.id, name: source.name, ...result });
    } catch (err) {
      results.push({ id: source.id, name: source.name, status: 'error', error: err.message });
    }
  }

  res.json({ success: true, checked: results.length, results });
});

router.get('/history', requireAdmin, (req, res) => {
  const db = getDb();
  const limit = parseInt(req.query.limit) || 50;
  const logs = db.prepare('SELECT * FROM provider_logs ORDER BY created_at DESC LIMIT ?').all(limit);
  res.json(logs);
});

// ── Settings ──────────────────────────────────────────────────────

router.get('/settings', requireAdmin, (req, res) => {
  const db = getDb();
  const settings = db.prepare("SELECT key, value FROM admin_settings WHERE key != 'admin_jwt_secret'").all();
  res.json(Object.fromEntries(settings.map(s => [s.key, s.value])));
});

router.patch('/settings', requireAdmin, (req, res) => {
  try {
    const db = getDb();
    const safe = ['morning_refresh_time', 'post_event_delay_1', 'post_event_delay_2', 'min_event_impact'];
    const update = db.prepare('INSERT OR REPLACE INTO admin_settings (key, value, updated_at) VALUES (?, ?, CURRENT_TIMESTAMP)');
    for (const [k, v] of Object.entries(req.body)) {
      if (safe.includes(k)) update.run(k, String(v));
    }
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── Assets ────────────────────────────────────────────────────────

router.get('/assets', requireAdmin, (req, res) => {
  const db = getDb();
  res.json(db.prepare('SELECT * FROM assets ORDER BY display_order').all());
});

router.patch('/assets/:id', requireAdmin, (req, res) => {
  try {
    const db = getDb();
    const { enabled, display_order } = req.body;
    const fields = [];
    const vals = [];
    if (enabled !== undefined) { fields.push('enabled=?'); vals.push(enabled ? 1 : 0); }
    if (display_order !== undefined) { fields.push('display_order=?'); vals.push(display_order); }
    if (fields.length === 0) return res.status(400).json({ error: 'Nothing to update' });
    db.prepare(`UPDATE assets SET ${fields.join(',')} WHERE id=?`).run(...vals, req.params.id);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
