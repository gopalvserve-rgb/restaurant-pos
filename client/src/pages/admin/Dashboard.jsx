import React, { useEffect, useState } from 'react';
import { api } from '../../api.js';

export default function AdminDashboard() {
  const [stats, setStats] = useState({});
  const [dash, setDash] = useState({ revenue_chart: [], top_items: [] });
  const [loading, setLoading] = useState(true);

  async function load() {
    setLoading(true);
    try {
      const [s, d] = await Promise.all([api.stats(), api.dashboard()]);
      setStats(s); setDash(d);
    } finally { setLoading(false); }
  }
  useEffect(() => { load(); const t = setInterval(load, 30000); return () => clearInterval(t); }, []);

  const maxRev = Math.max(1, ...(dash.revenue_chart || []).map(r => Number(r.revenue)));

  return (
    <div className="admin-page">
      <h1>Dashboard</h1>
      <div className="kpi-grid">
        <div className="kpi"><div className="kpi-num">{stats.today_orders || 0}</div><div className="kpi-lbl">Today's Orders</div></div>
        <div className="kpi"><div className="kpi-num">₹{Number(stats.today_revenue || 0).toFixed(0)}</div><div className="kpi-lbl">Today's Revenue</div></div>
        <div className="kpi"><div className="kpi-num">{stats.open_orders || 0}</div><div className="kpi-lbl">Open Orders</div></div>
        <div className="kpi"><div className="kpi-num">{stats.total_customers || 0}</div><div className="kpi-lbl">Total Customers</div></div>
        <div className="kpi" style={{ borderColor: stats.low_stock_items > 0 ? 'var(--danger)' : 'var(--border)' }}>
          <div className="kpi-num" style={{ color: stats.low_stock_items > 0 ? 'var(--danger)' : 'inherit' }}>{stats.low_stock_items || 0}</div>
          <div className="kpi-lbl">Low Stock Items</div>
        </div>
      </div>

      <div className="grid2">
        <div className="card">
          <h3>Revenue · Last 7 Days</h3>
          {dash.revenue_chart.length === 0 ? (
            <div className="empty">No paid orders yet</div>
          ) : (
            <div className="bar-chart">
              {dash.revenue_chart.map(r => (
                <div key={r.day} className="bar-row">
                  <div className="bar-lbl">{r.day?.slice(5) || '—'}</div>
                  <div className="bar-track">
                    <div className="bar-fill" style={{ width: (Number(r.revenue) / maxRev * 100) + '%' }} />
                  </div>
                  <div className="bar-val">₹{Number(r.revenue).toFixed(0)}</div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="card">
          <h3>Top Items Today</h3>
          {dash.top_items.length === 0 ? (
            <div className="empty">No items sold today yet</div>
          ) : (
            <table className="data-table">
              <thead><tr><th>Item</th><th>Qty</th><th>Revenue</th></tr></thead>
              <tbody>
                {dash.top_items.map((it, i) => (
                  <tr key={i}>
                    <td>{it.name}</td>
                    <td>{Number(it.qty)}</td>
                    <td>₹{Number(it.revenue).toFixed(0)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}
