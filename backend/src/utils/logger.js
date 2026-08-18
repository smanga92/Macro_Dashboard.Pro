import { getDb, generateId } from './db.js';

export function log(type, status, message, extra = {}) {
  const ts = new Date().toISOString();
  console.log(`[${ts}] [${type}] [${status}] ${message}`);
  try {
    const db = getDb();
    db.prepare(`
      INSERT INTO provider_logs (id, log_type, provider_id, source_id, status, message, duration_ms)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(
      generateId(),
      type,
      extra.provider_id || null,
      extra.source_id   || null,
      status,
      message,
      extra.duration_ms || null
    );
  } catch (e) {
    // Don't let logging failures crash the app
    console.error('Logger DB error:', e.message);
  }
}

export function logProvider(providerId, status, message, durationMs) {
  log('ai_provider', status, message, { provider_id: providerId, duration_ms: durationMs });
}

export function logSource(sourceId, status, message, durationMs) {
  log('data_source', status, message, { source_id: sourceId, duration_ms: durationMs });
}
