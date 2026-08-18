import React, { useEffect, useState } from 'react';
import { api } from '../utils/api.js';

const IMPACT_STYLE = {
  high:   { color: '#ef4444', label: 'HIGH' },
  medium: { color: '#f59e0b', label: 'MED' },
  low:    { color: 'var(--text-muted)', label: 'LOW' },
};

export default function EventsPanel() {
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get('/events/upcoming?hours=24&impact=medium')
      .then(d => setEvents(d.events || []))
      .catch(() => setEvents([]))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div style={panelStyle}>
      <PanelHeader>Upcoming Events · 24h</PanelHeader>
      {loading ? (
        <div style={emptyStyle}>Loading calendar…</div>
      ) : events.length === 0 ? (
        <div style={emptyStyle}>No medium/high impact events in next 24h</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1px' }}>
          {events.slice(0, 12).map((e, i) => {
            const impact = IMPACT_STYLE[e.impact] || IMPACT_STYLE.low;
            const dt = new Date(e.event_time);
            return (
              <div key={i} style={{
                display: 'grid',
                gridTemplateColumns: '70px 36px 1fr 70px',
                gap: '10px',
                padding: '7px 0',
                borderBottom: i < events.length - 1 ? '1px solid var(--border)' : 'none',
                alignItems: 'start',
              }}>
                <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.68rem', color: 'var(--text-secondary)' }}>
                  {formatTime(dt)}
                </span>
                <span style={{
                  fontFamily: 'var(--font-mono)',
                  fontSize: '0.6rem',
                  fontWeight: 500,
                  color: impact.color,
                  letterSpacing: '0.06em',
                }}>{impact.label}</span>
                <div>
                  <div style={{ fontSize: '0.78rem', color: 'var(--text-primary)' }}>{e.event_name}</div>
                  {e.forecast && (
                    <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.6rem', color: 'var(--text-muted)', marginTop: '2px' }}>
                      f: {e.forecast} · p: {e.previous || 'n/a'}
                    </div>
                  )}
                </div>
                <span style={{
                  fontFamily: 'var(--font-mono)',
                  fontSize: '0.65rem',
                  color: 'var(--text-secondary)',
                  textAlign: 'right',
                }}>{e.currency}</span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function formatTime(dt) {
  const now = new Date();
  const sameDay = dt.toDateString() === now.toDateString();
  if (sameDay) {
    return dt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) + ' UTC';
  }
  return dt.toLocaleDateString([], { month: 'short', day: 'numeric' }) + ' ' +
    dt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function PanelHeader({ children }) {
  return (
    <div style={{
      fontFamily: 'var(--font-mono)',
      fontSize: '0.62rem',
      letterSpacing: '0.1em',
      textTransform: 'uppercase',
      color: 'var(--text-muted)',
      marginBottom: '12px',
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

const emptyStyle = {
  fontSize: '0.78rem',
  color: 'var(--text-muted)',
  fontStyle: 'italic',
};
