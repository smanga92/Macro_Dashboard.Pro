import { getDb, generateId } from '../utils/db.js';
import { callAI, buildMorningPrompt, buildPostEventPrompt } from './aiService.js';
import { fetchCalendarEvents, fetchNewsHeadlines } from './sourceService.js';
import { log } from '../utils/logger.js';

export async function runMorningDashboard() {
  log('dashboard', 'start', 'Morning dashboard run starting');
  const db = getDb();

  const assets = db.prepare('SELECT * FROM assets WHERE enabled = 1 ORDER BY display_order').all();

  const [calendarResult, newsResult] = await Promise.allSettled([
    fetchCalendarEvents(24),
    fetchNewsHeadlines(),
  ]);

  const calendarEvents = calendarResult.status === 'fulfilled' ? calendarResult.value.events : [];
  const headlines     = newsResult.status === 'fulfilled'     ? newsResult.value.headlines  : [];

  storeCalendarEvents(calendarEvents);

  const prompt = buildMorningPrompt(assets, headlines, calendarEvents);

  let aiResult, providerUsed, isStale = false;
  try {
    const { result, provider_id } = await callAI(prompt);
    aiResult     = result;
    providerUsed = provider_id;
  } catch (err) {
    log('dashboard', 'error', `AI call failed: ${err.message}`);
    const last = db.prepare('SELECT * FROM dashboard_snapshots ORDER BY created_at DESC LIMIT 1').get();
    if (last) {
      log('dashboard', 'warn', 'Serving cached dashboard (stale)');
      db.prepare('UPDATE dashboard_snapshots SET is_stale = 1 WHERE id = ?').run(last.id);
      return { snapshot_id: last.id, stale: true };
    }
    throw err;
  }

  const parsed     = parseAIResponse(aiResult);
  const snapshotId = saveSnapshot(parsed, 'morning', 'scheduled', null, providerUsed, false);

  log('dashboard', 'success', `Morning dashboard saved — snapshot: ${snapshotId}`);
  return { snapshot_id: snapshotId, stale: false };
}

export async function runPostEventDashboard(eventId, delayLabel = '1min') {
  const db = getDb();
  const event = db.prepare('SELECT * FROM calendar_events WHERE id = ?').get(eventId);
  if (!event) throw new Error(`Event ${eventId} not found`);

  log('dashboard', 'start', `Post-event reassessment: ${event.event_name} (${delayLabel})`);

  const assets = db.prepare('SELECT * FROM assets WHERE enabled = 1 ORDER BY display_order').all();

  const [calendarResult, newsResult] = await Promise.allSettled([
    fetchCalendarEvents(6),
    fetchNewsHeadlines(),
  ]);

  const calendarEvents = calendarResult.status === 'fulfilled' ? calendarResult.value.events : [];
  const headlines      = newsResult.status === 'fulfilled'     ? newsResult.value.headlines  : [];

  const lastSnapshot = db.prepare('SELECT * FROM dashboard_snapshots ORDER BY created_at DESC LIMIT 1').get();
  const previousSignals = lastSnapshot
    ? db.prepare('SELECT * FROM asset_signals WHERE snapshot_id = ?').all(lastSnapshot.id)
    : [];

  const prompt = buildPostEventPrompt(assets, event, headlines, previousSignals);

  const { result, provider_id } = await callAI(prompt);
  const parsed     = parseAIResponse(result);
  const snapshotId = saveSnapshot(parsed, 'post_event', `event_${delayLabel}`, eventId, provider_id, false);

  const col = delayLabel === '1min' ? 'refresh_1min_done' : 'refresh_30min_done';
  db.prepare(`UPDATE calendar_events SET ${col} = 1 WHERE id = ?`).run(eventId);

  log('dashboard', 'success', `Post-event snapshot saved (${delayLabel}): ${snapshotId}`);
  return { snapshot_id: snapshotId };
}

function parseAIResponse(raw) {
  let text = raw.trim().replace(/^```json\n?/, '').replace(/```$/, '').trim();
  try {
    return JSON.parse(text);
  } catch {
    log('dashboard', 'error', 'Failed to parse AI JSON — returning empty shell');
    return { regime_summary: 'Analysis unavailable (parse error)', assets: [] };
  }
}

function saveSnapshot(parsed, type, trigger, eventId, providerUsed, isStale) {
  const db = getDb();
  const snapshotId = generateId();

  db.prepare(`
    INSERT INTO dashboard_snapshots
      (id, snapshot_type, trigger, event_id, regime_summary, asset_signals, ai_provider_used, is_stale)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    snapshotId, type, trigger, eventId || null,
    parsed.regime_summary || '',
    JSON.stringify(parsed.assets || []),
    providerUsed || null,
    isStale ? 1 : 0
  );

  const insertSignal = db.prepare(`
    INSERT INTO asset_signals
      (id, snapshot_id, symbol, bias, confirmed, drivers, what_changed, what_would_flip, next_event, analyst_note)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  for (const asset of (parsed.assets || [])) {
    insertSignal.run(
      generateId(), snapshotId,
      asset.symbol,
      asset.bias || 'neutral',
      asset.confirmed ? 1 : 0,
      JSON.stringify(asset.drivers || []),
      asset.what_changed    || '',
      asset.what_would_flip || '',
      asset.next_event      || '',
      asset.analyst_note    || ''
    );
  }

  return snapshotId;
}

function storeCalendarEvents(events) {
  const db = getDb();
  const insert = db.prepare(`
    INSERT OR IGNORE INTO calendar_events
      (id, source_id, event_time, currency, event_name, impact, forecast, previous, actual)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  for (const e of events) {
    insert.run(e.id, e.source_id || null, e.event_time, e.currency, e.event_name,
               e.impact || 'low', e.forecast || null, e.previous || null, e.actual || null);
  }
}

export function getLatestDashboard() {
  const db = getDb();
  const snapshot = db.prepare(
    'SELECT * FROM dashboard_snapshots ORDER BY created_at DESC LIMIT 1'
  ).get();

  if (!snapshot) return null;

  const signals = db.prepare('SELECT * FROM asset_signals WHERE snapshot_id = ?').all(snapshot.id);
  const assets  = db.prepare('SELECT * FROM assets WHERE enabled = 1 ORDER BY display_order').all();

  const signalMap = {};
  for (const s of signals) {
    signalMap[s.symbol] = { ...s, drivers: JSON.parse(s.drivers || '[]') };
  }

  return {
    snapshot_id:       snapshot.id,
    snapshot_type:     snapshot.snapshot_type,
    trigger:           snapshot.trigger,
    created_at:        snapshot.created_at,
    is_stale:          !!snapshot.is_stale,
    regime_summary:    snapshot.regime_summary,
    ai_provider_used:  snapshot.ai_provider_used,
    assets: assets.map(a => ({ ...a, signal: signalMap[a.symbol] || null })),
  };
}

export function getDashboardHistory(limit = 20) {
  const db = getDb();
  return db.prepare(`
    SELECT id, snapshot_type, trigger, event_id, regime_summary, ai_provider_used, is_stale, created_at
    FROM dashboard_snapshots ORDER BY created_at DESC LIMIT ?
  `).all(limit);
}
