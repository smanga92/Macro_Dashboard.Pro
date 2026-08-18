import React from 'react';
import { Outlet, NavLink, useNavigate } from 'react-router-dom';

export default function App() {
  const navigate = useNavigate();
  const isLoggedIn = !!localStorage.getItem('admin_token');

  function logout() {
    localStorage.removeItem('admin_token');
    navigate('/');
  }

  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
      <nav style={{
        background: 'var(--bg-panel)',
        borderBottom: '1px solid var(--border)',
        padding: '0 24px',
        display: 'flex',
        alignItems: 'center',
        gap: '32px',
        height: '48px',
        position: 'sticky',
        top: 0,
        zIndex: 100,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span style={{
            fontFamily: 'var(--font-mono)',
            fontSize: '0.8rem',
            color: 'var(--accent)',
            letterSpacing: '0.05em',
          }}>▪</span>
          <span style={{
            fontFamily: 'var(--font-mono)',
            fontSize: '0.75rem',
            fontWeight: 500,
            color: 'var(--text-primary)',
            letterSpacing: '0.1em',
            textTransform: 'uppercase',
          }}>Macro Dashboard</span>
        </div>

        <div style={{ display: 'flex', gap: '4px', flex: 1 }}>
          <NavItem to="/">Dashboard</NavItem>
          {isLoggedIn && <NavItem to="/admin">Admin</NavItem>}
        </div>

        <div>
          {isLoggedIn ? (
            <button onClick={logout} style={{
              fontFamily: 'var(--font-mono)',
              fontSize: '0.7rem',
              color: 'var(--text-secondary)',
              padding: '4px 8px',
              border: '1px solid var(--border)',
              borderRadius: 'var(--radius-sm)',
            }}>Logout</button>
          ) : (
            <NavItem to="/login">Admin</NavItem>
          )}
        </div>
      </nav>

      <main style={{ flex: 1 }}>
        <Outlet />
      </main>
    </div>
  );
}

function NavItem({ to, children }) {
  return (
    <NavLink to={to} style={({ isActive }) => ({
      fontFamily: 'var(--font-mono)',
      fontSize: '0.72rem',
      letterSpacing: '0.06em',
      textTransform: 'uppercase',
      color: isActive ? 'var(--text-primary)' : 'var(--text-secondary)',
      padding: '6px 10px',
      borderRadius: 'var(--radius-sm)',
      background: isActive ? 'var(--bg-active)' : 'transparent',
      textDecoration: 'none',
      transition: 'color 0.15s, background 0.15s',
    })}>
      {children}
    </NavLink>
  );
}
