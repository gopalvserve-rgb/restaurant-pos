import React, { useEffect, useState } from 'react';
import POS from './pages/POS.jsx';
import Orders from './pages/Orders.jsx';
import KOT from './pages/KOT.jsx';
import Admin from './pages/Admin.jsx';
import Login from './pages/Login.jsx';
import { api } from './api.js';
import { useAuth, can, clearAuth } from './auth.js';

export default function App() {
  const user = useAuth();
  const [tab, setTab] = useState('pos');
  const [stats, setStats] = useState({ today_orders: 0, today_revenue: 0, open_orders: 0 });

  async function refreshStats() { try { setStats(await api.stats()); } catch (e) {} }
  useEffect(() => {
    if (!user) return;
    refreshStats();
    const t = setInterval(refreshStats, 15000);
    return () => clearInterval(t);
  }, [user]);

  if (!user) return <Login onLogin={() => window.location.reload()} />;

  // Default tab based on role
  useEffect(() => {
    if (can(user, 'pos')) setTab('pos');
    else if (can(user, 'kot')) setTab('kot');
    else if (can(user, 'admin')) setTab('admin');
  }, []);

  function logout() {
    if (!confirm('Sign out?')) return;
    clearAuth();
    window.location.reload();
  }

  return (
    <div className="app">
      <div className="topnav">
        <h1>Restaurant POS</h1>
        <div className="stats">
          <div className="stat">Orders <b>{stats.today_orders}</b></div>
          <div className="stat">Revenue <b>Rs.{Number(stats.today_revenue).toFixed(0)}</b></div>
          <div className="stat">Open <b>{stats.open_orders}</b></div>
        </div>
        <div className="tabs">
          {can(user, 'pos') && <button className={tab === 'pos' ? 'active' : ''} onClick={() => setTab('pos')}>POS</button>}
          {can(user, 'orders') && <button className={tab === 'orders' ? 'active' : ''} onClick={() => setTab('orders')}>Orders</button>}
          {can(user, 'kot') && <button className={tab === 'kot' ? 'active' : ''} onClick={() => setTab('kot')}>KOT</button>}
          {can(user, 'admin') && <button className={tab === 'admin' ? 'active' : ''} onClick={() => setTab('admin')}>Admin</button>}
        </div>
        <div style={{ marginLeft: 12, color: 'white', fontSize: 12, textAlign: 'right' }}>
          <div><b>{user.full_name || user.username}</b></div>
          <div style={{ opacity: 0.8, fontSize: 11 }}>{user.role}</div>
        </div>
        <button onClick={logout} style={{ marginLeft: 8, background: 'rgba(255,255,255,0.2)', color: 'white', padding: '6px 10px', borderRadius: 6, fontSize: 12 }}>Sign out</button>
      </div>
      {tab === 'pos' && can(user, 'pos') && <POS onAction={refreshStats} />}
      {tab === 'orders' && can(user, 'orders') && <Orders onAction={refreshStats} />}
      {tab === 'kot' && can(user, 'kot') && <KOT />}
      {tab === 'admin' && can(user, 'admin') && <Admin user={user} />}
    </div>
  );
}
