import React, { useEffect, useState } from 'react';
import { api } from '../../api.js';

export default function AdminReviews() {
  const [reviews, setReviews] = useState([]);
  const [filter, setFilter] = useState({ brand_id: '', sentiment: '' });
  const [brands, setBrands] = useState([]);

  async function load() {
    let qs = '?limit=300';
    if (filter.brand_id) qs += `&brand_id=${filter.brand_id}`;
    setReviews(await api.reviews(qs));
  }
  useEffect(() => { load(); api.brands().then(setBrands); }, [filter.brand_id]);

  const filtered = filter.sentiment ? reviews.filter(r => r.sentiment === filter.sentiment) : reviews;
  const avg = reviews.length ? (reviews.reduce((a, r) => a + (Number(r.rating) || 0), 0) / reviews.length).toFixed(2) : '0.00';
  const counts = reviews.reduce((a, r) => { a[r.sentiment || 'neutral'] = (a[r.sentiment || 'neutral'] || 0) + 1; return a; }, {});

  return (
    <div className="admin-page">
      <h1>⭐ Reviews & Ratings ({reviews.length})</h1>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10, margin: '14px 0' }}>
        <div className="kpi-card" style={{ background: '#fef3c7' }}>
          <div style={{ fontSize: 26, fontWeight: 700 }}>⭐ {avg}</div>
          <div style={{ fontSize: 12 }}>Average rating</div>
        </div>
        <div className="kpi-card" style={{ background: '#dcfce7' }}>
          <div style={{ fontSize: 26, fontWeight: 700 }}>{counts.positive || 0}</div>
          <div style={{ fontSize: 12 }}>😊 Positive</div>
        </div>
        <div className="kpi-card" style={{ background: '#fef9c3' }}>
          <div style={{ fontSize: 26, fontWeight: 700 }}>{counts.neutral || 0}</div>
          <div style={{ fontSize: 12 }}>😐 Neutral</div>
        </div>
        <div className="kpi-card" style={{ background: '#fee2e2' }}>
          <div style={{ fontSize: 26, fontWeight: 700 }}>{counts.negative || 0}</div>
          <div style={{ fontSize: 12 }}>😞 Negative</div>
        </div>
      </div>

      <div style={{ display: 'flex', gap: 10, marginBottom: 14 }}>
        <select value={filter.brand_id} onChange={e => setFilter({ ...filter, brand_id: e.target.value })}>
          <option value="">All brands</option>
          {brands.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
        </select>
        <select value={filter.sentiment} onChange={e => setFilter({ ...filter, sentiment: e.target.value })}>
          <option value="">All sentiments</option>
          <option value="positive">😊 Positive</option>
          <option value="neutral">😐 Neutral</option>
          <option value="negative">😞 Negative</option>
        </select>
      </div>

      <div style={{ display: 'grid', gap: 10 }}>
        {filtered.map(r => (
          <div key={r.id} className="card" style={{ borderLeft: `4px solid ${r.sentiment === 'positive' ? '#22c55e' : r.sentiment === 'negative' ? '#ef4444' : '#fbbf24'}` }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <div>
                <strong>{r.customer_name || 'Anonymous'}</strong>
                <span style={{ marginLeft: 10, fontSize: 14, color: '#f59e0b' }}>
                  {'⭐'.repeat(Math.round(Number(r.rating) || 0))}
                  <small style={{ color: '#666', marginLeft: 4 }}>{Number(r.rating).toFixed(1)}</small>
                </span>
              </div>
              <small className="muted-sm">{new Date(r.created_at).toLocaleString()}</small>
            </div>
            <p style={{ margin: '8px 0', fontSize: 13 }}>{r.review_text || <em>(no comment)</em>}</p>
            <div style={{ display: 'flex', gap: 8, fontSize: 11 }}>
              <span className="badge" style={{ background: '#e0e7ff', color: '#3730a3' }}>{r.source}</span>
              {r.order_id && <span style={{ color: '#666' }}>Order: {r.order_id}</span>}
              {r.is_replied ? <span style={{ color: '#15803d' }}>✓ Replied</span> : <span style={{ color: '#ca8a04' }}>⌛ Awaiting reply</span>}
            </div>
            {r.reply_text && <div style={{ marginTop: 8, padding: 8, background: '#f0fdf4', borderRadius: 4, fontSize: 12 }}>↳ <em>{r.reply_text}</em></div>}
          </div>
        ))}
        {filtered.length === 0 && <div className="empty">No reviews. Click Sync Reviews in the v8 extension.</div>}
      </div>
    </div>
  );
}
