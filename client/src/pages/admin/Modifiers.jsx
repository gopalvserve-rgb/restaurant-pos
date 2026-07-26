import React, { useEffect, useState } from 'react';
import { api } from '../../api.js';

export default function AdminModifiers() {
  const [groups, setGroups] = useState([]);
  const [editGroup, setEditGroup] = useState(null);
  const [editMod, setEditMod] = useState(null);

  async function load() { setGroups(await api.modifierGroups()); }
  useEffect(() => { load(); }, []);

  function newGroup() { setEditGroup({ name: '', selection_type: 'multiple', is_required: 0, min_select: 0, max_select: 99 }); }
  async function saveGroup() {
    if (!editGroup.name) return alert('Name required');
    if (editGroup.id) await api.updateModifierGroup(editGroup.id, editGroup);
    else await api.createModifierGroup(editGroup);
    setEditGroup(null); load();
  }
  async function removeGroup(id) {
    if (!confirm('Delete group and all its modifiers?')) return;
    await api.deleteModifierGroup(id); load();
  }

  function newMod(groupId) { setEditMod({ group_id: groupId, name: '', price: 0, sort_order: 0 }); }
  async function saveMod() {
    if (!editMod.name) return alert('Name required');
    if (editMod.id) await api.updateModifier(editMod.id, editMod);
    else await api.createModifier(editMod.group_id, editMod);
    setEditMod(null); load();
  }
  async function removeMod(id) {
    if (!confirm('Delete this modifier?')) return;
    await api.deleteModifier(id); load();
  }

  return (
    <div className="admin-page">
      <div className="page-head">
        <h1>Modifiers</h1>
        <button className="btn btn-primary" onClick={newGroup}>+ Add Modifier Group</button>
      </div>
      <p className="muted-sm">Groups bundle related options (e.g. "Spice Level" → Mild/Medium/Spicy). Attach groups to menu items from Products page.</p>

      {groups.length === 0 && <div className="empty">No modifier groups yet. Create one like "Add-ons" or "Spice level".</div>}

      {groups.map(g => (
        <div key={g.id} className="card">
          <div className="page-head">
            <div>
              <h3 style={{ display: 'inline' }}>{g.name}</h3>
              {' '}
              <span className="badge badge-pending">{g.selection_type === 'single' ? 'Single choice' : 'Multiple choice'}</span>
              {g.is_required ? ' ' : ''}{g.is_required ? <span className="badge badge-open">Required</span> : null}
              <div className="muted-sm">Min {g.min_select} · Max {g.max_select}</div>
            </div>
            <div>
              <button className="btn-link" onClick={() => setEditGroup(g)}>Edit</button>{' · '}
              <button className="btn-link" style={{ color: 'var(--danger)' }} onClick={() => removeGroup(g.id)}>Delete</button>
            </div>
          </div>
          <table className="data-table">
            <thead><tr><th>Option</th><th>Extra Price</th><th></th></tr></thead>
            <tbody>
              {(g.modifiers || []).map(m => (
                <tr key={m.id}>
                  <td><b>{m.name}</b></td>
                  <td>+ ₹{Number(m.price).toFixed(2)}</td>
                  <td>
                    <button className="btn-link" onClick={() => setEditMod(m)}>Edit</button>{' · '}
                    <button className="btn-link" style={{ color: 'var(--danger)' }} onClick={() => removeMod(m.id)}>×</button>
                  </td>
                </tr>
              ))}
              {(g.modifiers || []).length === 0 && <tr><td colSpan="3" className="muted-sm" style={{ padding: 8 }}>No options yet</td></tr>}
            </tbody>
          </table>
          <button className="btn-link" onClick={() => newMod(g.id)}>+ Add Option</button>
        </div>
      ))}

      {editGroup && (
        <div className="modal-bg" onClick={e => e.target === e.currentTarget && setEditGroup(null)}>
          <div className="modal">
            <h3>{editGroup.id ? 'Edit Group' : 'New Modifier Group'}</h3>
            <label>Group Name</label>
            <input value={editGroup.name} onChange={e => setEditGroup({ ...editGroup, name: e.target.value })} placeholder="e.g. Spice Level, Add-ons, Size" />
            <label>Selection Type</label>
            <select value={editGroup.selection_type} onChange={e => setEditGroup({ ...editGroup, selection_type: e.target.value })}>
              <option value="single">Single (radio - pick one)</option>
              <option value="multiple">Multiple (checkboxes)</option>
            </select>
            <label><input type="checkbox" checked={!!editGroup.is_required} onChange={e => setEditGroup({ ...editGroup, is_required: e.target.checked ? 1 : 0 })} /> Required (customer must choose)</label>
            <div className="row2">
              <div><label>Min Select</label><input type="number" value={editGroup.min_select} onChange={e => setEditGroup({ ...editGroup, min_select: Number(e.target.value) })} /></div>
              <div><label>Max Select</label><input type="number" value={editGroup.max_select} onChange={e => setEditGroup({ ...editGroup, max_select: Number(e.target.value) })} /></div>
            </div>
            <div className="modal-foot">
              <button className="btn btn-secondary" onClick={() => setEditGroup(null)}>Cancel</button>
              <button className="btn btn-primary" onClick={saveGroup}>Save</button>
            </div>
          </div>
        </div>
      )}

      {editMod && (
        <div className="modal-bg" onClick={e => e.target === e.currentTarget && setEditMod(null)}>
          <div className="modal">
            <h3>{editMod.id ? 'Edit Option' : 'New Option'}</h3>
            <label>Name</label>
            <input value={editMod.name} onChange={e => setEditMod({ ...editMod, name: e.target.value })} placeholder="e.g. Extra Cheese, Spicy, Large" />
            <label>Extra Price (₹) — 0 if no charge</label>
            <input type="number" value={editMod.price} onChange={e => setEditMod({ ...editMod, price: e.target.value })} />
            <label>Sort Order</label>
            <input type="number" value={editMod.sort_order} onChange={e => setEditMod({ ...editMod, sort_order: Number(e.target.value) })} />
            <div className="modal-foot">
              <button className="btn btn-secondary" onClick={() => setEditMod(null)}>Cancel</button>
              <button className="btn btn-primary" onClick={saveMod}>Save</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
