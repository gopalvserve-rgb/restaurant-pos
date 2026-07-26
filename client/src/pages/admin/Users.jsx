import React, { useEffect, useState } from 'react';
import { api } from '../../api.js';

const ROLES = [
  { v: 'owner', label: 'Owner — full access' },
  { v: 'manager', label: 'Manager — full access' },
  { v: 'cashier', label: 'Cashier — POS + Orders' },
  { v: 'waiter', label: 'Waiter — POS + Orders' },
  { v: 'kitchen', label: 'Kitchen — KOT only' }
];

export default function AdminUsers() {
  const [list, setList] = useState([]);
  const [editing, setEditing] = useState(null);
  async function load() { setList(await api.users()); }
  useEffect(() => { load(); }, []);

  function newUser() { setEditing({ username: '', password: '', full_name: '', role: 'cashier', is_active: 1 }); }

  async function save() {
    if (!editing.username) return alert('Username required');
    if (!editing.id && !editing.password) return alert('Password required for new user');
    try {
      if (editing.id) await api.updateUser(editing.id, editing);
      else await api.createUser(editing);
      setEditing(null); load();
    } catch (e) { alert('Error: ' + e.message); }
  }
  async function remove(id) {
    if (!confirm('Deactivate this user?')) return;
    await api.deleteUser(id); load();
  }

  return (
    <div className="admin-page">
      <div className="page-head">
        <h1>Users & Roles</h1>
        <button className="btn btn-primary" onClick={newUser}>+ Add User</button>
      </div>
      <p className="muted-sm">Define staff accounts. Roles control what they can access in the app.</p>
      <table className="data-table">
        <thead><tr><th>Username</th><th>Name</th><th>Role</th><th>Status</th><th></th></tr></thead>
        <tbody>
          {list.map(u => (
            <tr key={u.id}>
              <td><b>{u.username}</b></td>
              <td>{u.full_name || '—'}</td>
              <td><span className="badge badge-paid">{u.role}</span></td>
              <td><span className={'badge badge-' + (u.is_active ? 'paid' : 'pending')}>{u.is_active ? 'Active' : 'Disabled'}</span></td>
              <td>
                <button className="btn-link" onClick={() => setEditing({ ...u, password: '' })}>Edit</button>{' · '}
                <button className="btn-link" style={{ color: 'var(--danger)' }} onClick={() => remove(u.id)}>Disable</button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {editing && (
        <div className="modal-bg" onClick={e => e.target === e.currentTarget && setEditing(null)}>
          <div className="modal">
            <h3>{editing.id ? 'Edit User' : 'New User'}</h3>
            <label>Username</label>
            <input value={editing.username} disabled={!!editing.id} onChange={e => setEditing({ ...editing, username: e.target.value })} />
            <label>Full Name</label>
            <input value={editing.full_name || ''} onChange={e => setEditing({ ...editing, full_name: e.target.value })} />
            <label>Password {editing.id && '(leave blank to keep current)'}</label>
            <input type="password" value={editing.password || ''} onChange={e => setEditing({ ...editing, password: e.target.value })} />
            <label>Role</label>
            <select value={editing.role} onChange={e => setEditing({ ...editing, role: e.target.value })}>
              {ROLES.map(r => <option key={r.v} value={r.v}>{r.label}</option>)}
            </select>
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
