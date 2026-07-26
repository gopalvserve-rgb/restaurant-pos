import React, { useState } from 'react';
import { api } from '../api.js';
import { setStoredAuth } from '../auth.js';

export default function Login({ onLogin }) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [err, setErr] = useState('');
  const [loading, setLoading] = useState(false);

  async function submit(e) {
    e.preventDefault();
    setErr(''); setLoading(true);
    try {
      const r = await api.login({ username, password });
      setStoredAuth(r.user, r.token);
      onLogin?.(r.user);
    } catch (e) {
      setErr('Invalid credentials. Try admin / admin123');
    } finally { setLoading(false); }
  }

  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'linear-gradient(135deg, #d97706, #b45309)' }}>
      <div style={{ background: 'white', borderRadius: 12, padding: 32, width: 360, boxShadow: '0 20px 40px rgba(0,0,0,0.2)' }}>
        <div style={{ textAlign: 'center', marginBottom: 24 }}>
          <div style={{ width: 60, height: 60, background: '#d97706', borderRadius: 12, margin: '0 auto', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 28, color: 'white' }}>R</div>
          <h2 style={{ marginTop: 12 }}>Restaurant POS</h2>
          <div style={{ color: '#64748b', fontSize: 13 }}>Sign in to continue</div>
        </div>
        <form onSubmit={submit}>
          <label style={{ fontSize: 12, color: '#64748b' }}>Username</label>
          <input value={username} onChange={e => setUsername(e.target.value)} required style={{ width: '100%', marginBottom: 12 }} autoFocus />
          <label style={{ fontSize: 12, color: '#64748b' }}>Password</label>
          <input type="password" value={password} onChange={e => setPassword(e.target.value)} required style={{ width: '100%', marginBottom: 12 }} />
          {err && <div style={{ color: '#dc2626', fontSize: 12, marginBottom: 12 }}>{err}</div>}
          <button className="btn btn-primary" type="submit" disabled={loading} style={{ width: '100%' }}>
            {loading ? 'Signing in…' : 'Sign In'}
          </button>
        </form>
        <div style={{ marginTop: 16, padding: 10, background: '#f8fafc', borderRadius: 6, fontSize: 11, color: '#64748b' }}>
          <b>Default admin:</b> admin / admin123<br/>
          <span style={{ color: '#dc2626' }}>Change this password after first login (Admin → Users)</span>
        </div>
      </div>
    </div>
  );
}
