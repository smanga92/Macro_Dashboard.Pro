import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../utils/api.js';

export default function Login() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  async function submit(e) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const { token } = await api.post('/admin/login', { username, password });
      localStorage.setItem('admin_token', token);
      navigate('/admin');
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '80vh' }}>
      <div style={{
        background: 'var(--bg-panel)',
        border: '1px solid var(--border)',
        borderRadius: 'var(--radius-lg)',
        padding: '32px',
        width: '320px',
      }}>
        <div style={{
          fontFamily: 'var(--font-mono)',
          fontSize: '0.62rem',
          letterSpacing: '0.12em',
          textTransform: 'uppercase',
          color: 'var(--text-muted)',
          marginBottom: '24px',
        }}>Admin Login</div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          <div>
            <label style={labelStyle}>Username</label>
            <input
              type="text" value={username}
              onChange={e => setUsername(e.target.value)}
              style={{ width: '100%' }}
              autoFocus
            />
          </div>
          <div>
            <label style={labelStyle}>Password</label>
            <input
              type="password" value={password}
              onChange={e => setPassword(e.target.value)}
              style={{ width: '100%' }}
              onKeyDown={e => e.key === 'Enter' && submit(e)}
            />
          </div>
          {error && (
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.7rem', color: 'var(--bearish)' }}>
              {error}
            </div>
          )}
          <button onClick={submit} disabled={loading} style={{
            marginTop: '8px',
            fontFamily: 'var(--font-mono)',
            fontSize: '0.72rem',
            letterSpacing: '0.06em',
            color: 'var(--bg-base)',
            background: loading ? 'var(--text-muted)' : 'var(--accent)',
            border: 'none',
            borderRadius: 'var(--radius-sm)',
            padding: '10px',
            cursor: loading ? 'wait' : 'pointer',
          }}>
            {loading ? 'Logging in…' : 'Log In'}
          </button>
        </div>
        <p style={{ marginTop: '16px', fontSize: '0.72rem', color: 'var(--text-muted)', lineHeight: 1.5 }}>
          First login creates the admin account.
        </p>
      </div>
    </div>
  );
}

const labelStyle = {
  display: 'block',
  fontFamily: 'var(--font-mono)',
  fontSize: '0.6rem',
  letterSpacing: '0.08em',
  textTransform: 'uppercase',
  color: 'var(--text-muted)',
  marginBottom: '5px',
};
