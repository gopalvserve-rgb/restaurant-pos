import React, { useEffect, useState } from 'react';
import { api } from '../../api.js';

export default function AdminCloudKitchen() {
  const [data, setData] = useState({ brands: [], total: 0 });
  useEffect(() => { api.cloudKitchenDash().then(setData).catch(() => {}); }, []);

  return (
    <div className="admin-page">
      <h1>☁️ Cloud Kitchen Dashboard</h1>
      <p className="muted-sm">Multi-brand view: each brand's outlets, menu, reviews, and rating in one place.</p>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: 16, marginTop: 18 }}>
        {data.brands.map(b => (
          <div key={b.id} className="card" style={{ borderTop: `5px solid ${b.primary_color || '#ff6b35'}`, padding: 16 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
              {b.logo_url ? <img src={b.logo_url} style={{ width: 56, height: 56, borderRadius: 10, objectFit: 'cover' }} /> :
                <div style={{ width: 56, height: 56, borderRadius: 10, background: b.primary_color || '#ff6b35', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white', fontSize: 26, fontWeight: 700 }}>{(b.name || '?')[0].toUpperCase()}</div>}
              <div style={{ flex: 1 }}>
                <h3 style={{ margin: 0, fontSize: 17 }}>{b.name}</h3>
                {!!b.is_cloud_kitchen && <span className="badge" style={{ background: '#dbeafe', color: '#1e40af', fontSize: 10 }}>☁️ Cloud Kitchen</span>}
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 8, fontSize: 13 }}>
              <div style={{ padding: 8, background: '#fff7ed', borderRadius: 6 }}>
                <div style={{ fontSize: 22, fontWeight: 700, color: '#ea580c' }}>{b.outlet_count}</div>
                <div style={{ fontSize: 11, color: '#666' }}>🏪 Outlets</div>
              </div>
              <div style={{ padding: 8, background: '#f0fdf4', borderRadius: 6 }}>
                <div style={{ fontSize: 22, fontWeight: 700, color: '#16a34a' }}>{b.menu_count}</div>
                <div style={{ fontSize: 11, color: '#666' }}>🍽️ Menu items</div>
              </div>
              <div style={{ padding: 8, background: '#eff6ff', borderRadius: 6 }}>
                <div style={{ fontSize: 22, fontWeight: 700, color: '#2563eb' }}>{b.review_count}</div>
                <div style={{ fontSize: 11, color: '#666' }}>💬 Reviews</div>
              </div>
              <div style={{ padding: 8, background: '#fef9c3', borderRadius: 6 }}>
                <div style={{ fontSize: 22, fontWeight: 700, color: '#ca8a04' }}>⭐ {Number(b.avg_rating || b.rating || 0).toFixed(1)}</div>
                <div style={{ fontSize: 11, color: '#666' }}>Avg rating</div>
              </div>
            </div>
          </div>
        ))}
        {data.brands.length === 0 && <div className="empty" style={{ gridColumn: '1 / -1' }}>No brands synced yet. Use v8 extension → Sync EVERYTHING.</div>}
      </div>
    </div>
  );
}
