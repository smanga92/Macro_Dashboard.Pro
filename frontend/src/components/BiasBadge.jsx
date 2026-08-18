import React from 'react';

const BIAS_CONFIG = {
  bullish:     { label: 'BULLISH',     color: 'var(--bullish)',     bg: 'var(--bullish-bg)',     border: 'var(--bullish-border)' },
  bearish:     { label: 'BEARISH',     color: 'var(--bearish)',     bg: 'var(--bearish-bg)',     border: 'var(--bearish-border)' },
  neutral:     { label: 'NEUTRAL',     color: 'var(--neutral)',     bg: 'var(--neutral-bg)',     border: 'var(--neutral-border)' },
  watch:       { label: 'WATCH',       color: 'var(--watch)',       bg: 'var(--watch-bg)',       border: 'var(--watch-border)' },
  unconfirmed: { label: 'UNCONFIRMED', color: 'var(--unconfirmed)', bg: 'var(--unconfirmed-bg)', border: 'var(--unconfirmed-border)' },
};

export default function BiasBadge({ bias, confirmed, size = 'sm' }) {
  const cfg = BIAS_CONFIG[bias?.toLowerCase()] || BIAS_CONFIG.neutral;
  const isSmall = size === 'sm';

  return (
    <span style={{
      display: 'inline-flex',
      alignItems: 'center',
      gap: '5px',
      fontFamily: 'var(--font-mono)',
      fontSize: isSmall ? '0.65rem' : '0.75rem',
      fontWeight: 500,
      letterSpacing: '0.08em',
      color: cfg.color,
      background: cfg.bg,
      border: `1px solid ${cfg.border}`,
      borderRadius: 'var(--radius-sm)',
      padding: isSmall ? '2px 7px' : '4px 10px',
      whiteSpace: 'nowrap',
    }}>
      {cfg.label}
      {!confirmed && (
        <span style={{
          fontFamily: 'var(--font-mono)',
          fontSize: '0.6rem',
          color: 'var(--text-muted)',
          marginLeft: '2px',
        }}>?</span>
      )}
    </span>
  );
}
