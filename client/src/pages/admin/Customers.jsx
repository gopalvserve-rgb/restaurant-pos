import React, { useEffect, useState } from 'react';
import { api } from '../../api.js';

export default function AdminCustomers() {
  const [list, setList] = useState([]);
  const [search, setSearch] = useState('');
  const [editing, setEditing] = useState(null);
  const [detail, setDetail] = useState(null);

  async function load() { setList(await api.customers()); }
  useEffect(() => { load(); }, []);

  const filtered = list.filter(c =>
    !search ||
    (c.name || '').toLowerCase().includes(search.toLowerCase()) ||
    (c.phone || '').includes(search) ||
    (c.email || '').toLowerCase().includes(search.toLowerCase())
  );

  function newCustomer() {
    setEditing({ name: '', phone: '', email: '', address: '', notes: '' });
  }

  async function save() {
    if (!editing.name) return alert('Enter a name');
    if (editing.id) await api.updateCustomer(editing.id, editing);
    else await api.createCustomer(editing);
    setEditing(null); load();
  }

  async function remove(id) {
    if (!confirm('Delete this customer?')) return;
    await api.deleteCustomer(id); load();
  }

  async function showDetail(id) {
    setDetail(await api.customer(id));
  }

  return (
    <div className="admin-page">
      <div className="page-head">
        <h1>Customers <small className="muted-sm">({filtered.length})</small></h1>
        <div>
          <input placeholder="Search by name / phone / email" value={search} onChange={e => setSearch(e.target.value)} style={{ width: 280 }} />{' '}
          <button className="btn btn-primary" onClick={newCustomer}>+ Add Customer</button>
        </div>
      </div>

      <table className="data-table">
        <thead><tr><th>Name</th><th>Phone</th><th>Email</th><th>Orders</th><th>Total Spend</th><th>Loyalty</th><th>Last Visit</th><th></th></tr></thead>
        <tbody>
          {filtered.map(c => (
            <tr key={c.id}>
              <td><b>{c.name}</b></td>
              <td>{c.phone || '—'}</td>
              <td>{c.email || '—'}</td>
              <td>{c.total_orders || 0}</td>
              <td>₹{Number(c.total_spend || 0).toFixed(0)}</td>
              <td>{c.loyalty_points || 0}</td>
              <td>{c.last_visit_at ? new Date(c.last_visit_at).toLocaleDateString() : '—'}</td>
              <td>
                <button className="btn-link" onClick={() => showDetail(c.id)}>View</button>{' · '}
                <button className="btn-link" onClick={() => setEditing(c)}>Edit</button>{' · '}
                <button className="btn-link" style={{ color: 'var(--danger)' }} onClick={() => remove(c.id)}>Delete</button>
              </td>
            </tr>
          ))}
          {filtered.length === 0 && <tr><td colSpan="8" className="empty">No customers yet</td></tr>}
        </tbody>
      </table>

      {editing && (
        <div className="modal-bg" onClick={e => e.target === e.currentTarget && setEditing(null)}>
          <div className="modal">
            <h3>{editing.id ? 'Edit Customer' : 'Add Customer'}</h3>
            <label>Name</label>
            <input value={editing.name} onChange={e => setEditing({ ...editing, name: e.target.value })} />
            <div className="row2">
              <div><label>Phone</label><input value={editing.phone || ''} onChange={e => setEditing({ ...editing, phone: e.target.value })} /></div>
              <div><label>Email</label><input value={editing.email || ''} onChange={e => setEditing({ ...editing, email: e.target.value })} /></div>
            </div>
            <label>Address</label>
            <textarea rows={2} value={editing.address || ''} onChange={e => setEditing({ ...editing, address: e.target.value })} />
            <label>Notes</label>
            <textarea rows={2} value={editing.notes || ''} onChange={e => setEditing({ ...editing, notes: e.target.value })} />
            {editing.id && <>
              <label>Loyalty Points</label>
              <input type="number" value={editing.loyalty_points || 0} onChange={e => setEditing({ ...editing, loyalty_points: Number(e.target.value) })} />
            </>}
            <div className="modal-foot">
              <button className="btn btn-secondary" onClick={() => setEditing(null)}>Cancel</button>
              <button className="btn btn-primary" onClick={save}>Save</button>
            </div>
          </div>
        </div>
      )}

      {detail && (
        <div className="modal-bg" onClick={e => e.target === e.currentTarget && setDetail(null)}>
          <div className="modal" style={{ maxWidth: 600 }}>
            <h3>{detail.name}</h3>
            <div className="muted-sm">{detail.phone} · {detail.email || '—'}</div>
            <div style={{ marginTop: 8 }}>{detail.address}</div>
            <div className="row-flex" style={{ marginTop: 16 }}>
              <div><b>{detail.total_orders || 0}</b> orders</div>
              <div>·</div>
              <div>₹<b>{Number(detail.total_spend || 0).toFixed(0)}</b> spent</div>
              <div>·</div>
              <div><b>{detail.loyalty_points || 0}</b> points</div>
            </div>
            <h4 style={{ marginTop: 16 }}>Recent Orders</h4>
            <table className="data-table">
              <thead><tr><th>Order #</th><th>Type</th><th>Total</th><th>Status</th><th>Date</th></tr></thead>
              <tbody>
                {(detail.orders || []).map(o => (
                  <tr key={o.id}>
                    <td>{o.order_no}</td>
                    <td>{o.type}</td>
                    <td>₹{Number(o.total).toFixed(0)}</td>
                    <td><span className={'badge badge-' + o.status}>{o.status}</span></td>
                    <td>{new Date(o.created_at).toLocaleDateString()}</td>
                  </tr>
                ))}
                {(detail.orders || []).length === 0 && <tr><td colSpan="5" className="empty">No orders yet</td></tr>}
              </tbody>
            </table>
            <div className="modal-foot">
              <button className="btn btn-secondary" onClick={() => setDetail(null)}>Close</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
