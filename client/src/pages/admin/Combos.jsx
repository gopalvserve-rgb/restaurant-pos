import React, { useEffect, useState } from 'react';
import { api } from '../../api.js';

export default function AdminCombos() {
  const [combos, setCombos] = useState([]);
  const [cats, setCats] = useState([]);
  const [menu, setMenu] = useState([]);
  const [editing, setEditing] = useState(null);
  const [pickItemFor, setPickItemFor] = useState(null);

  async function load() {
    const [c, cat, m] = await Promise.all([api.combos(), api.categories(), api.menuAll()]);
    setCombos(c); setCats(cat); setMenu(m);
  }
  useEffect(() => { load(); }, []);

  function newCombo() { setEditing({ name: '', description: '', price: 0, tax_pct: 5, category_id: cats[0]?.id || null, available: 1, image_url: '' }); }
  async function save() {
    if (!editing.name || !editing.price) return alert('Name and price required');
    if (editing.id) await api.updateCombo(editing.id, editing);
    else await api.createCombo(editing);
    setEditing(null); load();
  }
  async function remove(id) {
    if (!confirm('Delete combo?')) return;
    await api.deleteCombo(id); load();
  }
  async function addItem(comboId, menu_item_id) {
    await api.addComboItem(comboId, { menu_item_id, qty: 1 });
    setPickItemFor(null); load();
  }
  async function removeItem(comboId, itemId) {
    await api.removeComboItem(comboId, itemId); load();
  }

  return (
    <div className="admin-page">
      <div className="page-head">
        <h1>Combos / Meal Deals</h1>
        <button className="btn btn-primary" onClick={newCombo}>+ Add Combo</button>
      </div>
      <p className="muted-sm">Bundle items at a fixed price (e.g. "Family Pack: 1 Pizza + 2 Drinks = ₹699").</p>

      {combos.length === 0 && <div className="empty">No combos yet</div>}
      <div className="grid2">
      {combos.map(c => (
        <div key={c.id} className="card">
          <div className="page-head">
            <div>
              <h3>{c.name} {!c.available && <span className="badge badge-pending">Hidden</span>}</h3>
              <div className="muted-sm">{c.description}</div>
              <div style={{ fontSize: 20, fontWeight: 700, color: 'var(--primary-dark)', marginTop: 4 }}>₹{Number(c.price).toFixed(0)}</div>
            </div>
            <div>
              <button className="btn-link" onClick={() => setEditing(c)}>Edit</button>{' · '}
              <button className="btn-link" style={{ color: 'var(--danger)' }} onClick={() => remove(c.id)}>Delete</button>
            </div>
          </div>
          <div style={{ marginTop: 12 }}>
            <b style={{ fontSize: 12 }}>INCLUDES:</b>
            {(c.items || []).length === 0 && <div className="muted-sm" style={{ padding: 6 }}>No items yet — add some below</div>}
            {(c.items || []).map(it => (
              <div key={it.id} className="row-flex" style={{ padding: 4 }}>
                <span>· {it.item_name || ('Any ' + (it.category_name || 'item'))} × {it.qty}</span>
                <button className="btn-link" style={{ color: 'var(--danger)' }} onClick={() => removeItem(c.id, it.id)}>×</button>
              </div>
            ))}
            <button className="btn-link" onClick={() => setPickItemFor(c.id)}>+ Add Item</button>
          </div>
        </div>
      ))}
      </div>

      {editing && (
        <div className="modal-bg" onClick={e => e.target === e.currentTarget && setEditing(null)}>
          <div className="modal">
            <h3>{editing.id ? 'Edit Combo' : 'New Combo'}</h3>
            <label>Combo Name</label>
            <input value={editing.name} onChange={e => setEditing({ ...editing, name: e.target.value })} placeholder="e.g. Family Feast" />
            <label>Description</label>
            <textarea rows={2} value={editing.description} onChange={e => setEditing({ ...editing, description: e.target.value })} />
            <div className="row2">
              <div><label>Price (₹)</label><input type="number" value={editing.price} onChange={e => setEditing({ ...editing, price: e.target.value })} /></div>
              <div><label>Tax %</label><input type="number" value={editing.tax_pct} onChange={e => setEditing({ ...editing, tax_pct: e.target.value })} /></div>
            </div>
            <label>Category</label>
            <select value={editing.category_id || ''} onChange={e => setEditing({ ...editing, category_id: Number(e.target.value) || null })}>
              <option value="">— None —</option>
              {cats.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
            <label><input type="checkbox" checked={!!editing.available} onChange={e => setEditing({ ...editing, available: e.target.checked ? 1 : 0 })} /> Available</label>
            <div className="modal-foot">
              <button className="btn btn-secondary" onClick={() => setEditing(null)}>Cancel</button>
              <button className="btn btn-primary" onClick={save}>Save</button>
            </div>
          </div>
        </div>
      )}

      {pickItemFor && (
        <div className="modal-bg" onClick={e => e.target === e.currentTarget && setPickItemFor(null)}>
          <div className="modal">
            <h3>Pick item to add</h3>
            <div style={{ maxHeight: 400, overflowY: 'auto' }}>
              {menu.map(m => (
                <div key={m.id} className="row-flex" style={{ padding: 6, borderBottom: '1px solid var(--border)' }}>
                  <span>{m.name} <span className="muted-sm">({m.category_name})</span></span>
                  <button className="btn btn-secondary" style={{ padding: '4px 12px' }} onClick={() => addItem(pickItemFor, m.id)}>Add</button>
                </div>
              ))}
            </div>
            <div className="modal-foot">
              <button className="btn btn-secondary" onClick={() => setPickItemFor(null)}>Close</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
