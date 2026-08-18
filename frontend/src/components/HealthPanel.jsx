import React, { useEffect, useState } from 'react';
import { api } from '../utils/api.js';

const STATUS_STYLE = {
  healthy:  { color: 'var(--bullish)',     dot: '●' },
  degraded: { color: 'var(--watch)',       dot: '◐' },
  unhealthy:{ color: 'var(--bearish)',     dot: '○' },
  unknown:  { color: 'var(--text-muted)', dot: '○' },
};

export default function HealthPanel() {
  const [health, setHealth] = useState(null);
  const token = localStorage.getItem('admin_token');

  useEffect(() => {
    if (!token) return;
    api.get('/admin/health').then(setHealth).catch(() => {});
  }, [token]);

  if (!token || !health) return null;

  return (
    <div style={panelStyle}>
      <PanelHeader>Source Status</PanelHeader>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
        {health.providers?.map(p => (
          <StatusRow key={p.id} name={p.name} status={p.health_status} label="AI" />
        ))}
        {health.sources?.filter(s => s.health_status !== 'unknown').map(s => (
          <StatusRow key={s.id} name={s.name} status={s.health_status} label={s.category?.replace('_', ' ')} />
        ))}
      </div>
    </div>
  );
}

function StatusRow({ name, status, label }) {
  const st = STATUS_STYLE[status] || STATUS_STYLE.unknown;
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
      <span style={{ color: st.color, fontSize: '0.65rem' }}>{st.dot}</span>
      <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', flex: 1 }}>{name}</span>
      <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.6rem', color: 'var(--text-muted)', letterSpacing: '0.05em' }}>
        {label}
      </span>
    </div>
  );
}

function PanelHeader({ children }) {
  return (
    <div style={{
      fontFamily: 'var(--font-mono)',
      fontSize: '0.62rem',
      letterSpacing: '0.1em',
      textTransform: 'uppercase',
      color: 'var(--text-muted)',
      marginBottom: '10px',
      paddingBottom: '8px',
      borderBottom: '1px solid var(--border)',
    }}>{children}</div>
  );
}

const panelStyle = {
  background: 'var(--bg-panel)',
  border: '1px solid var(--border)',
  borderRadius: 'var(--radius)',
  padding: '14px 16px',
};
