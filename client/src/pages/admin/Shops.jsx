import React, { useEffect, useState } from 'react';
import { api } from '../../api.js';

export default function AdminShops() {
  const [list, setList] = useState([]);
  const [editing, setEditing] = useState(null);

  async function load() { setList(await api.shops()); }
  useEffect(() => { load(); }, []);

  function add() { setEditing({ name: '', address: '', phone: '', gst_no: '', is_active: 1 }); }

  async function save() {
    if (!editing.name) return alert('Enter a name');
    if (editing.id) await api.updateShop(editing.id, editing);
    else await api.createShop(editing);
    setEditing(null); load();
  }
  async function remove(id) {
    if (!confirm('Delete this outlet?')) return;
    await api.deleteShop(id); load();
  }

  return (
    <div className="admin-page">
      <div className="page-head">
        <h1>Shops / Outlets</h1>
        <button className="btn btn-primary" onClick={add}>+ Add Outlet</button>
      </div>
      <p className="muted-sm">Each shop represents a physical outlet. (Multi-outlet inventory & menu coming soon — for now used for billing info.)</p>

      <div className="grid2">
        {list.map(s => (
          <div key={s.id} className="card">
            <div className="page-head">
              <h3>{s.name} {s.is_active ? '' : <span className="badge badge-pending">Inactive</span>}</h3>
              <div>
                <button className="btn-link" onClick={() => setEditing(s)}>Edit</button>{' · '}
                <button className="btn-link" style={{ color: 'var(--danger)' }} onClick={() => remove(s.id)}>Delete</button>
              </div>
            </div>
            <div>📍 {s.address || '—'}</div>
            <div>📞 {s.phone || '—'}</div>
            <div>🧾 GST: {s.gst_no || '—'}</div>
          </div>
        ))}
        {list.length === 0 && <div className="empty">No outlets yet</div>}
      </div>

      {editing && (
        <div className="modal-bg" onClick={e => e.target === e.currentTarget && setEditing(null)}>
          <div className="modal">
            <h3>{editing.id ? 'Edit Outlet' : 'Add Outlet'}</h3>
            <label>Name</label>
            <input value={editing.name} onChange={e => setEditing({ ...editing, name: e.target.value })} />
            <label>Address</label>
            <textarea rows={2} value={editing.address || ''} onChange={e => setEditing({ ...editing, address: e.target.value })} />
            <div className="row2">
              <div><label>Phone</label><input value={editing.phone || ''} onChange={e => setEditing({ ...editing, phone: e.target.value })} /></div>
              <div><label>GST No</label><input value={editing.gst_no || ''} onChange={e => setEditing({ ...editing, gst_no: e.target.value })} /></div>
            </div>
            <label><input type="checkbox" checked={editing.is_active ? true : false} onChange={e => setEditing({ ...editing, is_active: e.target.checked ? 1 : 0 })} /> Active</label>
            <div className="modal-foot">
              <button className="btn btn-secondary" onClick={() => setEditing(null)}>Cancel</button>
              <button className="btn btn-primary" onClick={save}>Save</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
