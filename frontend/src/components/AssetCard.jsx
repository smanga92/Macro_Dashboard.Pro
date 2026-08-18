import React, { useState } from 'react';
import BiasBadge from './BiasBadge.jsx';

const TYPE_COLORS = {
  forex: '#60a5fa',
  commodity: '#fbbf24',
  index: '#a78bfa',
  crypto: '#34d399',
};

export default function AssetCard({ asset }) {
  const [expanded, setExpanded] = useState(false);
  const { symbol, name, asset_type, signal } = asset;

  if (!signal) {
    return (
      <div style={cardStyle}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <AssetLabel symbol={symbol} name={name} type={asset_type} />
          <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.65rem', color: 'var(--text-muted)' }}>
            awaiting analysis
          </span>
        </div>
      </div>
    );
  }

  const drivers = signal.drivers || [];

  return (
    <div
      style={{ ...cardStyle, cursor: 'pointer' }}
      onClick={() => setExpanded(!expanded)}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '12px' }}>
        <AssetLabel symbol={symbol} name={name} type={asset_type} />
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '4px' }}>
          <BiasBadge bias={signal.bias} confirmed={signal.confirmed} />
          {!signal.confirmed && (
            <span style={{
              fontFamily: 'var(--font-mono)',
              fontSize: '0.6rem',
              color: 'var(--unconfirmed)',
              letterSpacing: '0.05em',
            }}>not confirmed</span>
          )}
        </div>
      </div>

      <p style={{
        marginTop: '10px',
        fontSize: '0.8rem',
        color: 'var(--text-secondary)',
        lineHeight: 1.5,
        fontStyle: 'italic',
      }}>
        {signal.analyst_note}
      </p>

      {expanded && (
        <div style={{ marginTop: '14px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
          <Divider />

          {drivers.length > 0 && (
            <Section label="Key Drivers">
              <ul style={{ paddingLeft: '0', listStyle: 'none', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                {drivers.map((d, i) => (
                  <li key={i} style={{ display: 'flex', gap: '8px', fontSize: '0.78rem', color: 'var(--text-secondary)' }}>
                    <span style={{ color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', flexShrink: 0 }}>—</span>
                    {d}
                  </li>
                ))}
              </ul>
            </Section>
          )}

          {signal.what_changed && (
            <Section label="What Changed">
              <p style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', lineHeight: 1.55 }}>{signal.what_changed}</p>
            </Section>
          )}

          {signal.what_would_flip && (
            <Section label="What Would Flip the Bias">
              <p style={{ fontSize: '0.78rem', color: 'var(--watch)', lineHeight: 1.55 }}>{signal.what_would_flip}</p>
            </Section>
          )}

          {signal.next_event && (
            <Section label="Next Event to Watch">
              <p style={{ fontSize: '0.78rem', color: 'var(--accent)', fontFamily: 'var(--font-mono)' }}>{signal.next_event}</p>
            </Section>
          )}
        </div>
      )}

      <div style={{ marginTop: '10px', textAlign: 'right' }}>
        <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.6rem', color: 'var(--text-muted)' }}>
          {expanded ? '▲ collapse' : '▼ expand'}
        </span>
      </div>
    </div>
  );
}

function AssetLabel({ symbol, name, type }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
      <span style={{
        fontFamily: 'var(--font-mono)',
        fontSize: '0.95rem',
        fontWeight: 500,
        color: 'var(--text-primary)',
        minWidth: '52px',
      }}>{symbol}</span>
      <div>
        <div style={{ fontSize: '0.72rem', color: 'var(--text-secondary)' }}>{name}</div>
        <div style={{
          fontFamily: 'var(--font-mono)',
          fontSize: '0.58rem',
          color: TYPE_COLORS[type] || 'var(--text-muted)',
          letterSpacing: '0.06em',
          textTransform: 'uppercase',
        }}>{type}</div>
      </div>
    </div>
  );
}

function Section({ label, children }) {
  return (
    <div>
      <div style={{
        fontFamily: 'var(--font-mono)',
        fontSize: '0.6rem',
        color: 'var(--text-muted)',
        letterSpacing: '0.1em',
        textTransform: 'uppercase',
        marginBottom: '6px',
      }}>{label}</div>
      {children}
    </div>
  );
}

function Divider() {
  return <div style={{ height: '1px', background: 'var(--border)' }} />;
}

const cardStyle = {
  background: 'var(--bg-panel)',
  border: '1px solid var(--border)',
  borderRadius: 'var(--radius)',
  padding: '14px 16px',
  transition: 'border-color 0.15s',
};
