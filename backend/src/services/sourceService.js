import axios from 'axios';
import { getDb } from '../utils/db.js';
import { decrypt } from '../utils/crypto.js';
import { logSource } from '../utils/logger.js';

export async function fetchCalendarEvents(hoursAhead = 24) {
  const db = getDb();
  const sources = db.prepare(
    "SELECT * FROM data_sources WHERE category = 'economic_calendar' AND enabled = 1 ORDER BY priority ASC"
  ).all();

  for (const source of sources) {
    const start = Date.now();
    try {
      const events = await fetchCalendarFromSource(source, hoursAhead);
      logSource(source.id, 'success', `Fetched ${events.length} events`, Date.now() - start);
      db.prepare(
        "UPDATE data_sources SET health_status='healthy', failure_count=0, last_checked_at=CURRENT_TIMESTAMP WHERE id=?"
      ).run(source.id);
      return { events, source_id: source.id };
    } catch (err) {
      logSource(source.id, 'error', `Calendar fetch failed: ${err.message}`, Date.now() - start);
      db.prepare(
        "UPDATE data_sources SET failure_count=failure_count+1, health_status=CASE WHEN failure_count>=3 THEN 'unhealthy' ELSE 'degraded' END, last_checked_at=CURRENT_TIMESTAMP WHERE id=?"
      ).run(source.id);
    }
  }

  // All sources failed — return from DB cache
  const cached = db.prepare(`
    SELECT * FROM calendar_events
    WHERE event_time >= datetime('now', '-1 hour')
      AND event_time <= datetime('now', '+${hoursAhead} hours')
    ORDER BY event_time ASC
  `).all();

  return { events: cached, source_id: 'cache', stale: true };
}

async function fetchCalendarFromSource(source, hoursAhead) {
  switch (source.id) {
    case 'tv-calendar':     return fetchTradingViewCalendar(source, hoursAhead);
    case 'forexfactory':    return fetchForexFactoryCalendar(source, hoursAhead);
    default:                return fetchGenericCalendar(source, hoursAhead);
  }
}

async function fetchTradingViewCalendar(source, hoursAhead) {
  const now = new Date();
  const end = new Date(now.getTime() + hoursAhead * 3600000);
  const response = await axios.get('https://economic-calendar.tradingview.com/events', {
    params: { from: now.toISOString(), to: end.toISOString(), countries: 'US,EU,GB,JP,CH,CA,AU,NZ,DE' },
    timeout: 10000,
  });
  return (response.data?.result || []).map(e => ({
    id:         `tv-${e.id || Math.random().toString(36).slice(2)}`,
    event_time: e.date,
    currency:   e.country,
    event_name: e.title,
    impact:     mapImpact(e.importance),
    forecast:   e.forecast  || null,
    previous:   e.previous  || null,
    actual:     e.actual    || null,
    source_id:  source.id,
  }));
}

async function fetchForexFactoryCalendar(source, hoursAhead) {
  const response = await axios.get('https://nfs.faireconomy.media/ff_calendar_thisweek.json', { timeout: 10000 });
  const now = new Date();
  const end = new Date(now.getTime() + hoursAhead * 3600000);
  return (response.data || [])
    .filter(e => { const t = new Date(e.date); return t >= now && t <= end; })
    .map(e => ({
      id:         `ff-${e.date}-${(e.title || '').replace(/\s/g, '')}`,
      event_time: e.date,
      currency:   e.country,
      event_name: e.title,
      impact:     mapImpact(e.impact),
      forecast:   e.forecast || null,
      previous:   e.previous || null,
      actual:     e.actual   || null,
      source_id:  source.id,
    }));
}

async function fetchGenericCalendar(source, hoursAhead) {
  if (!source.endpoint_url) throw new Error('No endpoint configured');
  const apiKey = decrypt(source.api_key_encrypted);
  const headers = apiKey ? { Authorization: `Bearer ${apiKey}` } : {};
  const response = await axios.get(source.endpoint_url, { headers, timeout: 10000 });
  return Array.isArray(response.data) ? response.data : (response.data?.data || []);
}

function mapImpact(raw) {
  if (!raw) return 'low';
  const v = String(raw).toLowerCase();
  if (v.includes('high') || v === '3' || v === 'red')    return 'high';
  if (v.includes('medium') || v === '2' || v === 'orange') return 'medium';
  return 'low';
}

// ── News ──────────────────────────────────────────────────────────

export async function fetchNewsHeadlines() {
  const db = getDb();
  const sources = db.prepare(
    "SELECT * FROM data_sources WHERE category = 'market_news' AND enabled = 1 ORDER BY priority ASC"
  ).all();

  for (const source of sources) {
    const start = Date.now();
    try {
      const headlines = await fetchNewsFromSource(source);
      logSource(source.id, 'success', `Fetched ${headlines.length} headlines`, Date.now() - start);
      db.prepare(
        "UPDATE data_sources SET health_status='healthy', failure_count=0, last_checked_at=CURRENT_TIMESTAMP WHERE id=?"
      ).run(source.id);
      return { headlines, source_id: source.id };
    } catch (err) {
      logSource(source.id, 'error', `News fetch failed: ${err.message}`, Date.now() - start);
      db.prepare(
        "UPDATE data_sources SET failure_count=failure_count+1, health_status=CASE WHEN failure_count>=3 THEN 'unhealthy' ELSE 'degraded' END, last_checked_at=CURRENT_TIMESTAMP WHERE id=?"
      ).run(source.id);
    }
  }

  return { headlines: [], stale: true };
}

async function fetchNewsFromSource(source) {
  const apiKey = decrypt(source.api_key_encrypted);
  switch (source.id) {
    case 'fmp-news': return fetchFMPNews(apiKey);
    case 'newsapi':  return fetchNewsAPI(source, apiKey);
    default:         return fetchGenericNews(source, apiKey);
  }
}

async function fetchFMPNews(apiKey) {
  if (!apiKey) throw new Error('FMP API key required');
  const response = await axios.get('https://financialmodelingprep.com/api/v3/fmp/articles', {
    params: { apikey: apiKey, page: 0, size: 20 },
    timeout: 10000,
  });
  return (response.data?.content || []).map(a => `${a.title} (${a.site})`);
}

async function fetchNewsAPI(source, apiKey) {
  if (!apiKey) throw new Error('NewsAPI key required');
  const config = JSON.parse(source.config || '{}');
  const response = await axios.get('https://newsapi.org/v2/everything', {
    params: { q: config.q || 'central bank inflation forex economy', sortBy: 'publishedAt', pageSize: 20, apiKey },
    timeout: 10000,
  });
  return (response.data?.articles || []).map(a => a.title);
}

async function fetchGenericNews(source, apiKey) {
  if (!source.endpoint_url) throw new Error('No endpoint configured');
  const headers = apiKey ? { Authorization: `Bearer ${apiKey}` } : {};
  const response = await axios.get(source.endpoint_url, { headers, timeout: 10000 });
  const items = Array.isArray(response.data) ? response.data : (response.data?.articles || response.data?.data || []);
  return items.slice(0, 20).map(i => i.title || i.headline || '');
}

// ── Health check ──────────────────────────────────────────────────

export async function checkSourceHealth(sourceId) {
  const db = getDb();
  const source = db.prepare('SELECT * FROM data_sources WHERE id = ?').get(sourceId);
  if (!source) throw new Error('Source not found');

  const start = Date.now();
  try {
    if (source.category === 'economic_calendar') {
      await fetchCalendarFromSource(source, 2);
    } else if (source.category === 'market_news') {
      await fetchNewsFromSource(source);
    } else if (source.endpoint_url) {
      await axios.get(source.endpoint_url, { timeout: 5000 });
    }
    const duration = Date.now() - start;
    db.prepare(
      "UPDATE data_sources SET health_status='healthy', failure_count=0, last_checked_at=CURRENT_TIMESTAMP WHERE id=?"
    ).run(source.id);
    return { status: 'healthy', duration_ms: duration };
  } catch (err) {
    const duration = Date.now() - start;
    db.prepare(
      "UPDATE data_sources SET failure_count=failure_count+1, health_status='degraded', last_checked_at=CURRENT_TIMESTAMP WHERE id=?"
    ).run(source.id);
    return { status: 'error', error: err.message, duration_ms: duration };
  }
}
