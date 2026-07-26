import React, { useEffect, useState } from 'react';
import { api } from '../../api.js';

export default function AdminProducts() {
  const [items, setItems] = useState([]);
  const [cats, setCats] = useState([]);
  const [editing, setEditing] = useState(null);
  const [showCats, setShowCats] = useState(false);
  const [optionsFor, setOptionsFor] = useState(null);

  async function load() {
    const [m, c] = await Promise.all([api.menuAll(), api.categories()]);
    setItems(m); setCats(c);
  }
  useEffect(() => { load(); }, []);

  function newItem() { setEditing({ name: '', category_id: cats[0]?.id || null, price: 0, tax_pct: 5, available: 1, description: '' }); }
  async function save() {
    if (!editing.name) return alert('Enter a name');
    if (editing.id) await api.updateMenu(editing.id, editing);
    else await api.createMenu(editing);
    setEditing(null); load();
  }
  async function remove(id) {
    if (!confirm('Mark this item unavailable?')) return;
    await api.deleteMenu(id); load();
  }

  return (
    <div className="admin-page">
      <div className="page-head">
        <h1>Products / Menu</h1>
        <div>
          <button className="btn btn-secondary" onClick={() => setShowCats(true)}>Manage Categories</button>{' '}
          <button className="btn btn-primary" onClick={newItem}>+ Add Product</button>
        </div>
      </div>

      <table className="data-table">
        <thead><tr><th>Name</th><th>Category</th><th>Price</th><th>Tax %</th><th>Status</th><th></th></tr></thead>
        <tbody>
          {items.map(m => (
            <tr key={m.id}>
              <td><b>{m.name}</b>{m.description && <div className="muted-sm">{m.description}</div>}</td>
              <td>{m.category_name || '—'}</td>
              <td>₹{Number(m.price).toFixed(2)}</td>
              <td>{Number(m.tax_pct)}%</td>
              <td><span className={'badge badge-' + (m.available ? 'paid' : 'pending')}>{m.available ? 'Active' : 'Hidden'}</span></td>
              <td>
                <button className="btn-link" onClick={() => setEditing(m)}>Edit</button>{' · '}
                <button className="btn-link" onClick={() => setOptionsFor(m)}>Variants/Mods</button>{' · '}
                <button className="btn-link" style={{ color: 'var(--danger)' }} onClick={() => remove(m.id)}>Hide</button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {editing && (
        <div className="modal-bg" onClick={(e) => e.target === e.currentTarget && setEditing(null)}>
          <div className="modal">
            <h3>{editing.id ? 'Edit Product' : 'Add Product'}</h3>
            <label>Name</label>
            <input value={editing.name} onChange={e => setEditing({ ...editing, name: e.target.value })} />
            <label>Category</label>
            <select value={editing.category_id || ''} onChange={e => setEditing({ ...editing, category_id: Number(e.target.value) || null })}>
              <option value="">— None —</option>
              {cats.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
            <div className="row2">
              <div><label>Price (₹)</label><input type="number" value={editing.price} onChange={e => setEditing({ ...editing, price: e.target.value })} /></div>
              <div><label>Tax %</label><input type="number" value={editing.tax_pct} onChange={e => setEditing({ ...editing, tax_pct: e.target.value })} /></div>
            </div>
            <label>Description</label>
            <textarea rows={2} value={editing.description || ''} onChange={e => setEditing({ ...editing, description: e.target.value })} />
            <label><input type="checkbox" checked={editing.available ? true : false} onChange={e => setEditing({ ...editing, available: e.target.checked ? 1 : 0 })} /> Available</label>
            <div className="modal-foot">
              <button className="btn btn-secondary" onClick={() => setEditing(null)}>Cancel</button>
              <button className="btn btn-primary" onClick={save}>Save</button>
            </div>
          </div>
        </div>
      )}

      {showCats && <CategoryModal cats={cats} onClose={() => { setShowCats(false); load(); }} />}
      {optionsFor && <OptionsModal item={optionsFor} onClose={() => { setOptionsFor(null); load(); }} />}
    </div>
  );
}

function CategoryModal({ cats, onClose }) {
  const [list, setList] = useState(cats);
  const [newName, setNewName] = useState('');
  async function addCat() {
    if (!newName) return;
    await api.createCategory({ name: newName, sort_order: list.length });
    setNewName(''); setList(await api.categories());
  }
  async function rename(id, name) {
    await api.updateCategory(id, { name, sort_order: list.find(c => c.id === id)?.sort_order || 0 });
    setList(await api.categories());
  }
  async function remove(id) {
    if (!confirm('Delete this category?')) return;
    await api.deleteCategory(id); setList(await api.categories());
  }
  return (
    <div className="modal-bg" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal">
        <h3>Categories</h3>
        {list.map(c => (
          <div key={c.id} className="row-flex">
            <input value={c.name} onChange={e => setList(list.map(x => x.id === c.id ? { ...x, name: e.target.value } : x))} onBlur={e => rename(c.id, e.target.value)} />
            <button className="btn-link" style={{ color: 'var(--danger)' }} onClick={() => remove(c.id)}>×</button>
          </div>
        ))}
        <div className="row-flex">
          <input placeholder="New category…" value={newName} onChange={e => setNewName(e.target.value)} />
          <button className="btn btn-primary" onClick={addCat}>Add</button>
        </div>
        <div className="modal-foot">
          <button className="btn btn-secondary" onClick={onClose}>Done</button>
        </div>
      </div>
    </div>
  );
}

function OptionsModal({ item, onClose }) {
  const [variants, setVariants] = useState([]);
  const [groups, setGroups] = useState([]);
  const [attached, setAttached] = useState([]);
  const [newV, setNewV] = useState({ name: '', price: '' });

  async function load() {
    const detail = await api.menuDetail(item.id);
    setVariants(detail.variants || []);
    setAttached((detail.modifier_groups || []).map(g => g.id));
    setGroups(await api.modifierGroups());
  }
  useEffect(() => { load(); }, [item.id]);

  async function addVariant() {
    if (!newV.name || !newV.price) return alert('Name and price required');
    await api.createVariant(item.id, { name: newV.name, price: Number(newV.price), sort_order: variants.length });
    setNewV({ name: '', price: '' }); load();
  }
  async function removeVariant(id) {
    if (!confirm('Delete variant?')) return;
    await api.deleteVariant(id); load();
  }
  async function toggleGroup(groupId) {
    if (attached.includes(groupId)) await api.detachGroup(item.id, groupId);
    else await api.attachGroup(item.id, groupId);
    load();
  }

  return (
    <div className="modal-bg" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal" style={{ maxWidth: 600 }}>
        <h3>Variants & Modifiers — {item.name}</h3>

        <h4 style={{ marginTop: 12 }}>Variants (sizes / types)</h4>
        <p className="muted-sm">When present, customer picks one. Base price gets replaced.</p>
        {variants.map(v => (
          <div key={v.id} className="row-flex">
            <span style={{ flex: 1 }}><b>{v.name}</b> — ₹{Number(v.price).toFixed(0)} {v.is_default ? '(default)' : ''}</span>
            <button className="btn-link" style={{ color: 'var(--danger)' }} onClick={() => removeVariant(v.id)}>×</button>
          </div>
        ))}
        <div className="row-flex">
          <input placeholder="Variant name (e.g. Small)" value={newV.name} onChange={e => setNewV({ ...newV, name: e.target.value })} />
          <input type="number" placeholder="Price" value={newV.price} onChange={e => setNewV({ ...newV, price: e.target.value })} style={{ width: 100 }} />
          <button className="btn btn-primary" onClick={addVariant}>Add</button>
        </div>

        <h4 style={{ marginTop: 20 }}>Modifier Groups</h4>
        <p className="muted-sm">Attach groups from the Modifiers page. Customer sees these as add-on options.</p>
        {groups.length === 0 && <div className="muted-sm">No modifier groups yet. Create them in the Modifiers section first.</div>}
        {groups.map(g => (
          <div key={g.id} className="row-flex">
            <label style={{ flex: 1, marginTop: 0 }}>
              <input type="checkbox" checked={attached.includes(g.id)} onChange={() => toggleGroup(g.id)} />
              {' '}<b>{g.name}</b> <span className="muted-sm">({g.selection_type}, {(g.modifiers || []).length} options)</span>
            </label>
          </div>
        ))}

        <div className="modal-foot">
          <button className="btn btn-primary" onClick={onClose}>Done</button>
        </div>
      </div>
    </div>
  );
}
