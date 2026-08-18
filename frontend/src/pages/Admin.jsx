import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../utils/api.js';

export default function Admin() {
  const [tab, setTab] = useState('providers');
  const navigate = useNavigate();

  useEffect(() => {
    if (!localStorage.getItem('admin_token')) navigate('/login');
  }, [navigate]);

  return (
    <div style={{ maxWidth: '900px', margin: '0 auto', padding: '24px 20px' }}>
      <div style={{
        fontFamily: 'var(--font-mono)',
        fontSize: '0.62rem',
        letterSpacing: '0.12em',
        textTransform: 'uppercase',
        color: 'var(--text-muted)',
        marginBottom: '20px',
      }}>Admin Panel</div>

      <div style={{ display: 'flex', gap: '4px', marginBottom: '24px', borderBottom: '1px solid var(--border)', paddingBottom: '0' }}>
        {[
          ['providers', 'AI Providers'],
          ['sources', 'Data Sources'],
          ['settings', 'Settings'],
          ['logs', 'Logs'],
        ].map(([key, label]) => (
          <button key={key} onClick={() => setTab(key)} style={{
            fontFamily: 'var(--font-mono)',
            fontSize: '0.68rem',
            letterSpacing: '0.06em',
            color: tab === key ? 'var(--text-primary)' : 'var(--text-secondary)',
            background: tab === key ? 'var(--bg-active)' : 'transparent',
            border: 'none',
            borderBottom: tab === key ? '2px solid var(--accent)' : '2px solid transparent',
            padding: '8px 14px',
            cursor: 'pointer',
            marginBottom: '-1px',
          }}>{label}</button>
        ))}
      </div>

      {tab === 'providers' && <ProvidersTab />}
      {tab === 'sources' && <SourcesTab />}
      {tab === 'settings' && <SettingsTab />}
      {tab === 'logs' && <LogsTab />}
    </div>
  );
}

// ── AI Providers ──────────────────────────────────────────────────

function ProvidersTab() {
  const [providers, setProviders] = useState([]);
  const [form, setForm] = useState({ name: '', provider_type: 'openai', api_key: '', model: '', base_url: '', priority: 1 });
  const [testing, setTesting] = useState(null);
  const [testResult, setTestResult] = useState({});

  useEffect(() => {
    api.get('/admin/providers').then(setProviders).catch(() => {});
  }, []);

  async function save() {
    try {
      await api.post('/admin/providers', form);
      const updated = await api.get('/admin/providers');
      setProviders(updated);
      setForm({ name: '', provider_type: 'openai', api_key: '', model: '', base_url: '', priority: 99 });
    } catch (e) { alert(e.message); }
  }

  async function toggle(p) {
    await api.patch(`/admin/providers/${p.id}`, { enabled: !p.enabled });
    setProviders(providers.map(x => x.id === p.id ? { ...x, enabled: !x.enabled } : x));
  }

  async function test(p) {
    setTesting(p.id);
    try {
      const r = await api.post(`/admin/providers/${p.id}/test`, {});
      setTestResult(prev => ({ ...prev, [p.id]: r }));
    } catch (e) {
      setTestResult(prev => ({ ...prev, [p.id]: { success: false, error: e.message } }));
    } finally {
      setTesting(null);
    }
  }

  async function remove(id) {
    if (!confirm('Remove this provider?')) return;
    await api.delete(`/admin/providers/${id}`);
    setProviders(providers.filter(p => p.id !== id));
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
      <Section title="Add AI Provider">
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
          <Field label="Name">
            <input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} placeholder="e.g. OpenAI GPT-4o" style={{ width: '100%' }} />
          </Field>
          <Field label="Provider Type">
            <select value={form.provider_type} onChange={e => setForm({ ...form, provider_type: e.target.value })} style={{ width: '100%' }}>
              <option value="openai">OpenAI</option>
              <option value="openai_compatible">OpenAI Compatible</option>
              <option value="anthropic">Anthropic</option>
              <option value="google">Google Gemini</option>
            </select>
          </Field>
          <Field label="API Key">
            <input type="password" value={form.api_key} onChange={e => setForm({ ...form, api_key: e.target.value })} placeholder="sk-…" style={{ width: '100%' }} />
          </Field>
          <Field label="Model">
            <input value={form.model} onChange={e => setForm({ ...form, model: e.target.value })} placeholder="gpt-4o / claude-sonnet-4-6" style={{ width: '100%' }} />
          </Field>
          <Field label="Base URL (optional, for compatible APIs)">
            <input value={form.base_url} onChange={e => setForm({ ...form, base_url: e.target.value })} placeholder="https://api.example.com/v1" style={{ width: '100%' }} />
          </Field>
          <Field label="Priority (lower = first)">
            <input type="number" value={form.priority} onChange={e => setForm({ ...form, priority: parseInt(e.target.value) })} min={1} style={{ width: '100%' }} />
          </Field>
        </div>
        <Btn onClick={save} style={{ marginTop: '12px' }}>Save Provider</Btn>
      </Section>

      <Section title="Configured Providers">
        {providers.length === 0 ? (
          <p style={mutedText}>No providers configured. Add one above.</p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {providers.map(p => (
              <div key={p.id} style={itemRow}>
                <div style={{ flex: 1 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span style={{ fontSize: '0.85rem', fontWeight: 500 }}>{p.name}</span>
                    <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.6rem', color: 'var(--text-muted)' }}>{p.provider_type}</span>
                    <HealthDot status={p.health_status} />
                  </div>
                  <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.65rem', color: 'var(--text-muted)', marginTop: '3px' }}>
                    priority {p.priority} · {p.model || 'default model'} · {p.api_key_encrypted === '***' ? 'key set' : 'no key'}
                  </div>
                  {testResult[p.id] && (
                    <div style={{
                      fontFamily: 'var(--font-mono)',
                      fontSize: '0.65rem',
                      color: testResult[p.id].success ? 'var(--bullish)' : 'var(--bearish)',
                      marginTop: '4px',
                    }}>
                      {testResult[p.id].success
                        ? `✓ OK (${testResult[p.id].duration_ms}ms)`
                        : `✗ ${testResult[p.id].error}`}
                    </div>
                  )}
                </div>
                <div style={{ display: 'flex', gap: '6px', flexShrink: 0 }}>
                  <SmBtn onClick={() => test(p)} disabled={testing === p.id}>
                    {testing === p.id ? '…' : 'Test'}
                  </SmBtn>
                  <SmBtn onClick={() => toggle(p)} variant={p.enabled ? 'warn' : 'ok'}>
                    {p.enabled ? 'Disable' : 'Enable'}
                  </SmBtn>
                  <SmBtn onClick={() => remove(p.id)} variant="danger">Remove</SmBtn>
                </div>
              </div>
            ))}
          </div>
        )}
      </Section>
    </div>
  );
}

// ── Data Sources ──────────────────────────────────────────────────

function SourcesTab() {
  const [sources, setSources] = useState([]);
  const [form, setForm] = useState({ name: '', source_type: 'calendar', category: 'economic_calendar', endpoint_url: '', api_key: '', config: '{}', priority: 99 });
  const [testing, setTesting] = useState(null);
  const [testResult, setTestResult] = useState({});

  useEffect(() => {
    api.get('/admin/sources').then(setSources).catch(() => {});
  }, []);

  async function save() {
    try {
      await api.post('/admin/sources', form);
      const updated = await api.get('/admin/sources');
      setSources(updated);
      setForm({ name: '', source_type: 'calendar', category: 'economic_calendar', endpoint_url: '', api_key: '', config: '{}', priority: 99 });
    } catch (e) { alert(e.message); }
  }

  async function toggle(s) {
    await api.patch(`/admin/sources/${s.id}`, { enabled: !s.enabled });
    setSources(sources.map(x => x.id === s.id ? { ...x, enabled: !x.enabled } : x));
  }

  async function testSource(s) {
    setTesting(s.id);
    try {
      const r = await api.post('/admin/test-source', { source_id: s.id });
      setTestResult(prev => ({ ...prev, [s.id]: r }));
    } catch (e) {
      setTestResult(prev => ({ ...prev, [s.id]: { status: 'error', error: e.message } }));
    } finally {
      setTesting(null);
    }
  }

  async function remove(s) {
    if (s.is_default) { alert('Default sources cannot be deleted. Disable them instead.'); return; }
    if (!confirm('Remove this source?')) return;
    await api.delete(`/admin/sources/${s.id}`);
    setSources(sources.filter(x => x.id !== s.id));
  }

  const grouped = {};
  for (const s of sources) {
    if (!grouped[s.category]) grouped[s.category] = [];
    grouped[s.category].push(s);
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
      <Section title="Add Custom Source">
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
          <Field label="Name">
            <input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} placeholder="Source name" style={{ width: '100%' }} />
          </Field>
          <Field label="Category">
            <select value={form.category} onChange={e => setForm({ ...form, category: e.target.value })} style={{ width: '100%' }}>
              <option value="economic_calendar">Economic Calendar</option>
              <option value="market_news">Market News</option>
              <option value="economic_data">Economic Data</option>
            </select>
          </Field>
          <Field label="Endpoint URL" style={{ gridColumn: '1/-1' }}>
            <input value={form.endpoint_url} onChange={e => setForm({ ...form, endpoint_url: e.target.value })} placeholder="https://api.example.com/calendar" style={{ width: '100%' }} />
          </Field>
          <Field label="API Key (optional)">
            <input type="password" value={form.api_key} onChange={e => setForm({ ...form, api_key: e.target.value })} placeholder="Optional" style={{ width: '100%' }} />
          </Field>
          <Field label="Priority (lower = first)">
            <input type="number" value={form.priority} onChange={e => setForm({ ...form, priority: parseInt(e.target.value) })} min={1} style={{ width: '100%' }} />
          </Field>
        </div>
        <Btn onClick={save} style={{ marginTop: '12px' }}>Save Source</Btn>
      </Section>

      {Object.entries(grouped).map(([cat, items]) => (
        <Section key={cat} title={cat.replace('_', ' ').replace(/\b\w/g, c => c.toUpperCase())}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {items.map(s => (
              <div key={s.id} style={itemRow}>
                <div style={{ flex: 1 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span style={{ fontSize: '0.85rem', fontWeight: 500 }}>{s.name}</span>
                    {s.is_default && <Tag>default</Tag>}
                    <HealthDot status={s.health_status} />
                  </div>
                  <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.65rem', color: 'var(--text-muted)', marginTop: '3px' }}>
                    priority {s.priority} · {s.endpoint_url || 'built-in'}
                  </div>
                  {testResult[s.id] && (
                    <div style={{
                      fontFamily: 'var(--font-mono)',
                      fontSize: '0.65rem',
                      color: testResult[s.id].status === 'healthy' ? 'var(--bullish)' : 'var(--bearish)',
                      marginTop: '4px',
                    }}>
                      {testResult[s.id].status === 'healthy'
                        ? `✓ OK (${testResult[s.id].duration_ms}ms)`
                        : `✗ ${testResult[s.id].error || 'Error'}`}
                    </div>
                  )}
                </div>
                <div style={{ display: 'flex', gap: '6px', flexShrink: 0 }}>
                  <SmBtn onClick={() => testSource(s)} disabled={testing === s.id}>
                    {testing === s.id ? '…' : 'Test'}
                  </SmBtn>
                  <SmBtn onClick={() => toggle(s)} variant={s.enabled ? 'warn' : 'ok'}>
                    {s.enabled ? 'Disable' : 'Enable'}
                  </SmBtn>
                  {!s.is_default && <SmBtn onClick={() => remove(s)} variant="danger">Remove</SmBtn>}
                </div>
              </div>
            ))}
          </div>
        </Section>
      ))}
    </div>
  );
}

// ── Settings ──────────────────────────────────────────────────────

function SettingsTab() {
  const [settings, setSettings] = useState(null);

  useEffect(() => {
    api.get('/admin/settings').then(setSettings).catch(() => {});
  }, []);

  async function save() {
    try {
      await api.patch('/admin/settings', settings);
      alert('Settings saved');
    } catch (e) { alert(e.message); }
  }

  if (!settings) return <p style={mutedText}>Loading…</p>;

  return (
    <Section title="Schedule & Thresholds">
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', maxWidth: '500px' }}>
        <Field label="Morning Refresh Time (UTC)">
          <input value={settings.morning_refresh_time || ''} onChange={e => setSettings({ ...settings, morning_refresh_time: e.target.value })} placeholder="07:00" style={{ width: '100%' }} />
        </Field>
        <Field label="Post-Event Delay 1 (minutes)">
          <input type="number" value={settings.post_event_delay_1 || ''} onChange={e => setSettings({ ...settings, post_event_delay_1: e.target.value })} style={{ width: '100%' }} />
        </Field>
        <Field label="Post-Event Delay 2 (minutes)">
          <input type="number" value={settings.post_event_delay_2 || ''} onChange={e => setSettings({ ...settings, post_event_delay_2: e.target.value })} style={{ width: '100%' }} />
        </Field>
        <Field label="Min Event Impact to Track">
          <select value={settings.min_event_impact || 'medium'} onChange={e => setSettings({ ...settings, min_event_impact: e.target.value })} style={{ width: '100%' }}>
            <option value="low">Low (all events)</option>
            <option value="medium">Medium and High only</option>
            <option value="high">High impact only</option>
          </select>
        </Field>
      </div>
      <Btn onClick={save} style={{ marginTop: '14px' }}>Save Settings</Btn>
    </Section>
  );
}

// ── Logs ─────────────────────────────────────────────────────────

function LogsTab() {
  const [logs, setLogs] = useState([]);

  useEffect(() => {
    api.get('/admin/history?limit=60').then(setLogs).catch(() => {});
  }, []);

  return (
    <Section title="Recent Activity Log">
      {logs.length === 0 ? (
        <p style={mutedText}>No logs yet.</p>
      ) : (
        <div style={{
          fontFamily: 'var(--font-mono)',
          fontSize: '0.68rem',
          display: 'flex',
          flexDirection: 'column',
          gap: '2px',
        }}>
          {logs.map(l => (
            <div key={l.id} style={{
              display: 'grid',
              gridTemplateColumns: '160px 80px 80px 1fr',
              gap: '10px',
              padding: '5px 0',
              borderBottom: '1px solid var(--border)',
              color: l.status === 'error' ? 'var(--bearish)' : l.status === 'success' ? 'var(--bullish)' : 'var(--text-muted)',
            }}>
              <span style={{ color: 'var(--text-muted)' }}>{new Date(l.created_at).toLocaleTimeString()}</span>
              <span>{l.log_type}</span>
              <span>{l.status}</span>
              <span style={{ color: 'var(--text-secondary)' }}>{l.message}</span>
            </div>
          ))}
        </div>
      )}
    </Section>
  );
}

// ── Shared components ─────────────────────────────────────────────

function Section({ title, children }) {
  return (
    <div>
      <div style={{
        fontFamily: 'var(--font-mono)',
        fontSize: '0.62rem',
        letterSpacing: '0.1em',
        textTransform: 'uppercase',
        color: 'var(--text-muted)',
        marginBottom: '12px',
        paddingBottom: '8px',
        borderBottom: '1px solid var(--border)',
      }}>{title}</div>
      {children}
    </div>
  );
}

function Field({ label, children, style = {} }) {
  return (
    <div style={style}>
      <label style={{
        display: 'block',
        fontFamily: 'var(--font-mono)',
        fontSize: '0.6rem',
        letterSpacing: '0.08em',
        textTransform: 'uppercase',
        color: 'var(--text-muted)',
        marginBottom: '5px',
      }}>{label}</label>
      {children}
    </div>
  );
}

function Btn({ children, onClick, style = {} }) {
  return (
    <button onClick={onClick} style={{
      fontFamily: 'var(--font-mono)',
      fontSize: '0.7rem',
      letterSpacing: '0.06em',
      color: 'var(--bg-base)',
      background: 'var(--accent)',
      border: 'none',
      borderRadius: 'var(--radius-sm)',
      padding: '8px 20px',
      cursor: 'pointer',
      ...style,
    }}>{children}</button>
  );
}

function SmBtn({ children, onClick, variant = 'default', disabled = false }) {
  const colors = {
    default: { color: 'var(--text-secondary)', border: 'var(--border)' },
    ok: { color: 'var(--bullish)', border: 'var(--bullish-border)' },
    warn: { color: 'var(--watch)', border: 'var(--watch-border)' },
    danger: { color: 'var(--bearish)', border: 'var(--bearish-border)' },
  };
  const c = colors[variant] || colors.default;
  return (
    <button onClick={onClick} disabled={disabled} style={{
      fontFamily: 'var(--font-mono)',
      fontSize: '0.65rem',
      letterSpacing: '0.04em',
      color: disabled ? 'var(--text-muted)' : c.color,
      border: `1px solid ${disabled ? 'var(--border)' : c.border}`,
      borderRadius: 'var(--radius-sm)',
      padding: '4px 10px',
      background: 'transparent',
      cursor: disabled ? 'wait' : 'pointer',
    }}>{children}</button>
  );
}

function HealthDot({ status }) {
  const colors = { healthy: 'var(--bullish)', degraded: 'var(--watch)', unhealthy: 'var(--bearish)', unknown: 'var(--text-muted)' };
  return <span style={{ color: colors[status] || colors.unknown, fontSize: '0.55rem' }}>●</span>;
}

function Tag({ children }) {
  return (
    <span style={{
      fontFamily: 'var(--font-mono)',
      fontSize: '0.58rem',
      color: 'var(--text-muted)',
      border: '1px solid var(--border)',
      borderRadius: 'var(--radius-sm)',
      padding: '1px 5px',
      letterSpacing: '0.05em',
    }}>{children}</span>
  );
}

const mutedText = { fontSize: '0.78rem', color: 'var(--text-muted)', fontStyle: 'italic' };
const itemRow = {
  display: 'flex',
  alignItems: 'center',
  gap: '12px',
  background: 'var(--bg-raised)',
  border: '1px solid var(--border)',
  borderRadius: 'var(--radius)',
  padding: '10px 14px',
};
