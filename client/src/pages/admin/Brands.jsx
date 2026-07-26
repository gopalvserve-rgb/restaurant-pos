import React, { useEffect, useState } from 'react';
import { api } from '../../api.js';

export default function AdminBrands() {
  const [brands, setBrands] = useState([]);
  const [edit, setEdit] = useState(null);
  const blank = { name: '', slug: '', logo_url: '', cuisine: '', primary_color: '#ff6b35', description: '', is_cloud_kitchen: false };

  async function load() { setBrands(await api.brands()); }
  useEffect(() => { load(); }, []);

  async function save() {
    if (edit.id) await api.updateBrand(edit.id, edit);
    else await api.createBrand(edit);
    setEdit(null);
    load();
  }
  async function del(id) {
    if (!confirm('Delete this brand?')) return;
    await api.deleteBrand(id);
    load();
  }

  return (
    <div className="admin-page">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h1>🏷️ Brands ({brands.length})</h1>
        <button className="btn btn-primary" onClick={() => setEdit({ ...blank })}>+ New Brand</button>
      </div>
      <p className="muted-sm">Cloud-kitchen friendly. One physical kitchen can host multiple brands (e.g. "Biryani House" + "Pizza Corner" from same location).</p>

      {edit && (
        <div className="card" style={{ marginBottom: 16, background: '#fff7ed', border: '2px solid #ff6b35' }}>
          <h3>{edit.id ? 'Edit Brand' : 'New Brand'}</h3>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <label>Name<input value={edit.name} onChange={e => setEdit({ ...edit, name: e.target.value })} /></label>
            <label>Slug<input value={edit.slug} onChange={e => setEdit({ ...edit, slug: e.target.value })} placeholder="biryani-house" /></label>
            <label>Logo URL<input value={edit.logo_url} onChange={e => setEdit({ ...edit, logo_url: e.target.value })} /></label>
            <label>Cuisine<input value={edit.cuisine} onChange={e => setEdit({ ...edit, cuisine: e.target.value })} placeholder="Biryani, North Indian" /></label>
            <label>Primary color<input type="color" value={edit.primary_color} onChange={e => setEdit({ ...edit, primary_color: e.target.value })} /></label>
            <label style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <input type="checkbox" checked={!!edit.is_cloud_kitchen} onChange={e => setEdit({ ...edit, is_cloud_kitchen: e.target.checked })} />
              Cloud kitchen brand
            </label>
            <label style={{ gridColumn: 'span 2' }}>Description
              <textarea value={edit.description} onChange={e => setEdit({ ...edit, description: e.target.value })} rows={2} />
            </label>
          </div>
          <div style={{ marginTop: 10, display: 'flex', gap: 8 }}>
            <button className="btn btn-primary" onClick={save}>Save</button>
            <button className="btn" onClick={() => setEdit(null)}>Cancel</button>
          </div>
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 14 }}>
        {brands.map(b => (
          <div key={b.id} className="card" style={{ borderTop: `4px solid ${b.primary_color || '#ff6b35'}` }}>
            <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
              {b.logo_url ? <img src={b.logo_url} alt="" style={{ width: 48, height: 48, borderRadius: 8, objectFit: 'cover' }} /> :
                <div style={{ width: 48, height: 48, borderRadius: 8, background: b.primary_color || '#ff6b35', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white', fontSize: 22, fontWeight: 700 }}>{(b.name || '?')[0].toUpperCase()}</div>}
              <div style={{ flex: 1 }}>
                <h4 style={{ margin: 0 }}>{b.name}</h4>
                <small className="muted-sm">{b.cuisine || '—'}</small>
              </div>
              {!!b.is_cloud_kitchen && <span className="badge" style={{ background: '#dbeafe', color: '#1e40af' }}>☁️ CK</span>}
            </div>
            {b.description && <p style={{ fontSize: 12, color: '#666', marginTop: 8 }}>{b.description}</p>}
            <div style={{ display: 'flex', gap: 12, fontSize: 11, marginTop: 8, color: '#555' }}>
              <span>⭐ {Number(b.rating || 0).toFixed(1)}</span>
              <span>💬 {b.total_reviews || 0} reviews</span>
              {b.source && <span style={{ marginLeft: 'auto', background: '#f0f0f0', padding: '2px 6px', borderRadius: 4 }}>{b.source}</span>}
            </div>
            <div style={{ marginTop: 10, display: 'flex', gap: 6 }}>
              <button className="btn" onClick={() => setEdit({ ...b })}>Edit</button>
              <button className="btn" onClick={() => del(b.id)} style={{ background: '#fee2e2', color: '#991b1b' }}>Delete</button>
            </div>
          </div>
        ))}
        {brands.length === 0 && <div className="empty" style={{ gridColumn: '1 / -1' }}>No brands yet. Run the v8 extension Sync EVERYTHING button, or click + New Brand.</div>}
      </div>
    </div>
  );
}
