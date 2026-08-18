import React, { useEffect, useState, useCallback } from 'react';
import { api } from '../utils/api.js';
import AssetCard from '../components/AssetCard.jsx';
import EventsPanel from '../components/EventsPanel.jsx';
import HealthPanel from '../components/HealthPanel.jsx';
import BiasBadge from '../components/BiasBadge.jsx';

const GROUP_ORDER = ['forex', 'commodity', 'index', 'crypto'];
const GROUP_LABELS = { forex: 'Currencies', commodity: 'Commodities', index: 'Indices', crypto: 'Crypto' };

export default function Dashboard() {
  const [dashboard, setDashboard] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [running, setRunning] = useState(false);
  const isAdmin = !!localStorage.getItem('admin_token');

  const load = useCallback(() => {
    setLoading(true);
    api.get('/dashboard/latest')
      .then(setDashboard)
      .catch(e => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    load();
    const interval = setInterval(load, 5 * 60 * 1000); // refresh every 5 min
    return () => clearInterval(interval);
  }, [load]);

  async function triggerRun() {
    setRunning(true);
    try {
      await api.post('/dashboard/run', {});
      await load();
    } catch (e) {
      alert('Run failed: ' + e.message);
    } finally {
      setRunning(false);
    }
  }

  if (loading) return <LoadingScreen />;
  if (error) return <ErrorScreen message={error} />;
  if (!dashboard?.available) return <EmptyScreen onRun={isAdmin ? triggerRun : null} running={running} />;

  const grouped = {};
  for (const asset of dashboard.assets || []) {
    if (!grouped[asset.asset_type]) grouped[asset.asset_type] = [];
    grouped[asset.asset_type].push(asset);
  }

  const staleAge = dashboard.created_at
    ? Math.round((Date.now() - new Date(dashboard.created_at).getTime()) / 60000)
    : null;

  return (
    <div style={{ maxWidth: '1200px', margin: '0 auto', padding: '24px 20px' }}>

      {/* Header strip */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '20px' }}>
        <div>
          <div style={{
            fontFamily: 'var(--font-mono)',
            fontSize: '0.6rem',
            letterSpacing: '0.12em',
            textTransform: 'uppercase',
            color: 'var(--text-muted)',
            marginBottom: '6px',
          }}>
            {dashboard.snapshot_type === 'morning' ? 'Morning Brief' : 'Post-Event Update'}
            {dashboard.is_stale && <span style={{ color: 'var(--bearish)', marginLeft: '8px' }}>· stale</span>}
          </div>
          <div style={{
            fontFamily: 'var(--font-mono)',
            fontSize: '0.68rem',
            color: 'var(--text-secondary)',
          }}>
            {dashboard.created_at
              ? `Updated ${staleAge < 1 ? 'just now' : staleAge + ' min ago'} · ${new Date(dashboard.created_at).toUTCString()}`
              : 'No timestamp'}
          </div>
        </div>
        {isAdmin && (
          <button onClick={triggerRun} disabled={running} style={{
            fontFamily: 'var(--font-mono)',
            fontSize: '0.68rem',
            letterSpacing: '0.06em',
            color: running ? 'var(--text-muted)' : 'var(--accent)',
            border: '1px solid',
            borderColor: running ? 'var(--border)' : 'var(--accent)',
            borderRadius: 'var(--radius-sm)',
            padding: '6px 14px',
            background: 'transparent',
            transition: 'all 0.15s',
          }}>
            {running ? 'Running…' : '↻ Run Now'}
          </button>
        )}
      </div>

      {/* Regime summary */}
      {dashboard.regime_summary && (
        <div style={{
          background: 'var(--bg-panel)',
          border: '1px solid var(--border)',
          borderRadius: 'var(--radius)',
          padding: '16px 20px',
          marginBottom: '20px',
        }}>
          <div style={{
            fontFamily: 'var(--font-mono)',
            fontSize: '0.6rem',
            letterSpacing: '0.12em',
            textTransform: 'uppercase',
            color: 'var(--text-muted)',
            marginBottom: '10px',
          }}>Macro Regime</div>
          <p style={{
            fontSize: '0.85rem',
            color: 'var(--text-secondary)',
            lineHeight: 1.65,
          }}>{dashboard.regime_summary}</p>
        </div>
      )}

      {/* Main content grid */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: '1fr 300px',
        gap: '20px',
        alignItems: 'start',
      }}>

        {/* Asset groups */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
          {GROUP_ORDER.map(type => {
            const assets = grouped[type];
            if (!assets?.length) return null;
            return (
              <section key={type}>
                <div style={{
                  fontFamily: 'var(--font-mono)',
                  fontSize: '0.62rem',
                  letterSpacing: '0.1em',
                  textTransform: 'uppercase',
                  color: 'var(--text-muted)',
                  marginBottom: '10px',
                  paddingBottom: '6px',
                  borderBottom: '1px solid var(--border)',
                }}>{GROUP_LABELS[type]}</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  {assets.map(asset => <AssetCard key={asset.id} asset={asset} />)}
                </div>
              </section>
            );
          })}
        </div>

        {/* Sidebar */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', position: 'sticky', top: '64px' }}>
          <UnconfirmedSummary assets={dashboard.assets} />
          <EventsPanel />
          <HealthPanel />
        </div>
      </div>
    </div>
  );
}

function UnconfirmedSummary({ assets }) {
  const unconfirmed = (assets || []).filter(a => a.signal && !a.signal.confirmed);
  if (unconfirmed.length === 0) return null;

  return (
    <div style={{
      background: 'var(--unconfirmed-bg)',
      border: '1px solid var(--unconfirmed-border)',
      borderRadius: 'var(--radius)',
      padding: '12px 14px',
    }}>
      <div style={{
        fontFamily: 'var(--font-mono)',
        fontSize: '0.6rem',
        letterSpacing: '0.1em',
        textTransform: 'uppercase',
        color: 'var(--unconfirmed)',
        marginBottom: '8px',
      }}>Unconfirmed Signals</div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '5px' }}>
        {unconfirmed.map(a => (
          <span key={a.id} style={{
            fontFamily: 'var(--font-mono)',
            fontSize: '0.68rem',
            color: 'var(--text-secondary)',
            background: 'var(--bg-raised)',
            border: '1px solid var(--border)',
            borderRadius: 'var(--radius-sm)',
            padding: '2px 7px',
          }}>{a.symbol}</span>
        ))}
      </div>
      <p style={{ fontSize: '0.73rem', color: 'var(--text-muted)', marginTop: '8px', lineHeight: 1.5 }}>
        Supporting macro factors have not yet aligned for these assets.
      </p>
    </div>
  );
}

function LoadingScreen() {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '60vh' }}>
      <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.75rem', color: 'var(--text-muted)', letterSpacing: '0.1em' }}>
        Loading dashboard…
      </div>
    </div>
  );
}

function ErrorScreen({ message }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '60vh' }}>
      <div style={{ textAlign: 'center' }}>
        <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.7rem', color: 'var(--bearish)', marginBottom: '8px' }}>
          Error loading dashboard
        </div>
        <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>{message}</div>
      </div>
    </div>
  );
}

function EmptyScreen({ onRun, running }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '60vh' }}>
      <div style={{ textAlign: 'center', maxWidth: '360px' }}>
        <div style={{
          fontFamily: 'var(--font-mono)',
          fontSize: '0.65rem',
          letterSpacing: '0.12em',
          textTransform: 'uppercase',
          color: 'var(--text-muted)',
          marginBottom: '12px',
        }}>No Analysis Yet</div>
        <p style={{ fontSize: '0.83rem', color: 'var(--text-secondary)', lineHeight: 1.65, marginBottom: '20px' }}>
          The dashboard has not run yet. Configure your AI provider in admin settings, then run the first analysis.
        </p>
        {onRun && (
          <button onClick={onRun} disabled={running} style={{
            fontFamily: 'var(--font-mono)',
            fontSize: '0.72rem',
            letterSpacing: '0.06em',
            color: 'var(--bg-base)',
            background: 'var(--accent)',
            border: 'none',
            borderRadius: 'var(--radius-sm)',
            padding: '10px 24px',
            cursor: 'pointer',
          }}>
            {running ? 'Running…' : 'Run First Analysis'}
          </button>
        )}
        {!onRun && (
          <p style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
            Log in as admin to trigger the first run.
          </p>
        )}
      </div>
    </div>
  );
}
