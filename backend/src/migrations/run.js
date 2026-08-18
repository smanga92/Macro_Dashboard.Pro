import { getDb, generateId } from '../utils/db.js';

export function runMigrations() {
  console.log('Running migrations...');
  const db = getDb();

  db.exec(`
    CREATE TABLE IF NOT EXISTS admin_settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS ai_providers (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      provider_type TEXT NOT NULL,
      api_key_encrypted TEXT,
      base_url TEXT,
      model TEXT,
      priority INTEGER DEFAULT 99,
      enabled INTEGER DEFAULT 0,
      health_status TEXT DEFAULT 'unknown',
      last_used_at DATETIME,
      failure_count INTEGER DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS data_sources (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      source_type TEXT NOT NULL,
      category TEXT NOT NULL,
      endpoint_url TEXT,
      api_key_encrypted TEXT,
      config TEXT DEFAULT '{}',
      priority INTEGER DEFAULT 99,
      enabled INTEGER DEFAULT 1,
      is_default INTEGER DEFAULT 0,
      health_status TEXT DEFAULT 'unknown',
      failure_count INTEGER DEFAULT 0,
      last_checked_at DATETIME,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS assets (
      id TEXT PRIMARY KEY,
      symbol TEXT NOT NULL UNIQUE,
      name TEXT NOT NULL,
      asset_type TEXT NOT NULL,
      enabled INTEGER DEFAULT 1,
      display_order INTEGER DEFAULT 99
    );

    CREATE TABLE IF NOT EXISTS dashboard_snapshots (
      id TEXT PRIMARY KEY,
      snapshot_type TEXT NOT NULL,
      trigger TEXT,
      event_id TEXT,
      regime_summary TEXT,
      asset_signals TEXT NOT NULL DEFAULT '[]',
      macro_context TEXT,
      ai_provider_used TEXT,
      source_health TEXT,
      is_stale INTEGER DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS asset_signals (
      id TEXT PRIMARY KEY,
      snapshot_id TEXT NOT NULL,
      symbol TEXT NOT NULL,
      bias TEXT NOT NULL,
      confirmed INTEGER DEFAULT 0,
      drivers TEXT DEFAULT '[]',
      what_changed TEXT,
      what_would_flip TEXT,
      next_event TEXT,
      analyst_note TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (snapshot_id) REFERENCES dashboard_snapshots(id)
    );

    CREATE TABLE IF NOT EXISTS calendar_events (
      id TEXT PRIMARY KEY,
      source_id TEXT,
      event_time DATETIME NOT NULL,
      currency TEXT,
      event_name TEXT NOT NULL,
      impact TEXT,
      forecast TEXT,
      previous TEXT,
      actual TEXT,
      is_processed INTEGER DEFAULT 0,
      refresh_1min_done INTEGER DEFAULT 0,
      refresh_30min_done INTEGER DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS provider_logs (
      id TEXT PRIMARY KEY,
      log_type TEXT NOT NULL,
      provider_id TEXT,
      source_id TEXT,
      status TEXT NOT NULL,
      message TEXT,
      duration_ms INTEGER,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS admin_users (
      id TEXT PRIMARY KEY,
      username TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE INDEX IF NOT EXISTS idx_snapshots_created ON dashboard_snapshots(created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_events_time ON calendar_events(event_time);
    CREATE INDEX IF NOT EXISTS idx_logs_created ON provider_logs(created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_signals_snapshot ON asset_signals(snapshot_id);
  `);

  // Seed default assets
  const assetCount = db.prepare('SELECT COUNT(*) as c FROM assets').get().c;
  if (assetCount === 0) {
    const insertAsset = db.prepare(`
      INSERT OR IGNORE INTO assets (id, symbol, name, asset_type, display_order)
      VALUES (?, ?, ?, ?, ?)
    `);
    const assets = [
      ['usd',   'USD',   'US Dollar',            'forex',     1],
      ['eur',   'EUR',   'Euro',                 'forex',     2],
      ['gbp',   'GBP',   'British Pound',        'forex',     3],
      ['jpy',   'JPY',   'Japanese Yen',         'forex',     4],
      ['chf',   'CHF',   'Swiss Franc',          'forex',     5],
      ['cad',   'CAD',   'Canadian Dollar',      'forex',     6],
      ['aud',   'AUD',   'Australian Dollar',    'forex',     7],
      ['nzd',   'NZD',   'New Zealand Dollar',   'forex',     8],
      ['gold',  'Gold',  'Gold (XAU)',            'commodity', 9],
      ['us30',  'US30',  'Dow Jones Industrial', 'index',     10],
      ['us100', 'US100', 'NASDAQ 100',           'index',     11],
      ['btc',   'BTC',   'Bitcoin',              'crypto',    12],
      ['ger40', 'GER40', 'DAX 40',               'index',     13],
    ];
    for (const a of assets) insertAsset.run(...a);
  }

  // Seed default data sources
  const srcCount = db.prepare('SELECT COUNT(*) as c FROM data_sources').get().c;
  if (srcCount === 0) {
    const insertSrc = db.prepare(`
      INSERT OR IGNORE INTO data_sources
        (id, name, source_type, category, endpoint_url, config, priority, enabled, is_default, health_status)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    const sources = [
      ['tv-calendar',       'TradingView Calendar',        'calendar', 'economic_calendar', 'https://economic-calendar.tradingview.com/events', '{}',                                   1, 1, 1, 'unknown'],
      ['forexfactory',      'Forex Factory Calendar',      'calendar', 'economic_calendar', 'https://nfs.faireconomy.media/ff_calendar_thisweek.json', '{}',                            2, 1, 1, 'unknown'],
      ['fmp-news',          'Financial Modeling Prep News','news',     'market_news',        'https://financialmodelingprep.com/api/v3/fmp/articles', '{}',                             1, 1, 1, 'unknown'],
      ['newsapi',           'NewsAPI',                     'news',     'market_news',        'https://newsapi.org/v2/everything', '{"q":"forex macro economy central bank"}',           2, 0, 1, 'unknown'],
      ['fred',              'FRED Economic Data',          'data',     'economic_data',      'https://api.stlouisfed.org/fred', '{}',                                                   1, 1, 1, 'unknown'],
    ];
    for (const s of sources) insertSrc.run(...s);
  }

  // Seed default admin settings
  const insertSetting = db.prepare('INSERT OR IGNORE INTO admin_settings (key, value) VALUES (?, ?)');
  const defaults = [
    ['morning_refresh_time', '07:00'],
    ['post_event_delay_1',   '1'],
    ['post_event_delay_2',   '30'],
    ['min_event_impact',     'medium'],
    ['admin_jwt_secret',     generateId() + generateId() + generateId()],
  ];
  for (const [k, v] of defaults) insertSetting.run(k, v);

  console.log('✅ Migrations complete');
  db.close();
}
