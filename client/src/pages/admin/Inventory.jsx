import React, { useEffect, useState } from 'react';
import { api } from '../../api.js';

export default function AdminInventory() {
  const [items, setItems] = useState([]);
  const [editing, setEditing] = useState(null);
  const [txItem, setTxItem] = useState(null);
  const [filter, setFilter] = useState('all');

  async function load() { setItems(await api.inventory()); }
  useEffect(() => { load(); }, []);

  const filtered = filter === 'low'
    ? items.filter(i => Number(i.current_stock) <= Number(i.low_stock_threshold))
    : items;

  function newItem() {
    setEditing({ name: '', sku: '', unit: 'kg', category: 'raw', current_stock: 0, low_stock_threshold: 5, last_purchase_price: 0, supplier: '' });
  }

  async function save() {
    if (!editing.name) return alert('Enter a name');
    if (editing.id) await api.updateInventory(editing.id, editing);
    else await api.createInventory(editing);
    setEditing(null); load();
  }

  async function remove(id) {
    if (!confirm('Delete this item?')) return;
    await api.deleteInventory(id); load();
  }

  return (
    <div className="admin-page">
      <div className="page-head">
        <h1>Inventory</h1>
        <div>
          <button className={'cat-chip' + (filter === 'all' ? ' active' : '')} onClick={() => setFilter('all')}>All</button>{' '}
          <button className={'cat-chip' + (filter === 'low' ? ' active' : '')} onClick={() => setFilter('low')}>Low Stock</button>{' '}
          <button className="btn btn-primary" onClick={newItem}>+ Add Item</button>
        </div>
      </div>

      <table className="data-table">
        <thead><tr><th>Item</th><th>SKU</th><th>Unit</th><th>Category</th><th>Stock</th><th>Threshold</th><th>Last Price</th><th>Supplier</th><th></th></tr></thead>
        <tbody>
          {filtered.map(i => {
            const low = Number(i.current_stock) <= Number(i.low_stock_threshold);
            return (
              <tr key={i.id} style={low ? { background: '#fff7ed' } : {}}>
                <td><b>{i.name}</b></td>
                <td><code>{i.sku || '—'}</code></td>
                <td>{i.unit}</td>
                <td>{i.category}</td>
                <td><b style={{ color: low ? 'var(--danger)' : 'inherit' }}>{Number(i.current_stock)} {i.unit}</b></td>
                <td>{Number(i.low_stock_threshold)}</td>
                <td>₹{Number(i.last_purchase_price).toFixed(2)}</td>
                <td>{i.supplier || '—'}</td>
                <td>
                  <button className="btn-link" onClick={() => setTxItem(i)}>+/- Stock</button>{' · '}
                  <button className="btn-link" onClick={() => setEditing(i)}>Edit</button>{' · '}
                  <button className="btn-link" style={{ color: 'var(--danger)' }} onClick={() => remove(i.id)}>Delete</button>
                </td>
              </tr>
            );
          })}
          {filtered.length === 0 && <tr><td colSpan="9" className="empty">No items</td></tr>}
        </tbody>
      </table>

      {editing && (
        <div className="modal-bg" onClick={e => e.target === e.currentTarget && setEditing(null)}>
          <div className="modal">
            <h3>{editing.id ? 'Edit Inventory Item' : 'Add Inventory Item'}</h3>
            <label>Name</label>
            <input value={editing.name} onChange={e => setEditing({ ...editing, name: e.target.value })} />
            <div className="row2">
              <div><label>SKU</label><input value={editing.sku || ''} onChange={e => setEditing({ ...editing, sku: e.target.value })} /></div>
              <div><label>Unit</label>
                <select value={editing.unit} onChange={e => setEditing({ ...editing, unit: e.target.value })}>
                  {['kg','g','L','ml','unit','bottle','box','pack','plate'].map(u => <option key={u}>{u}</option>)}
                </select>
              </div>
            </div>
            <div className="row2">
              <div><label>Category</label>
                <select value={editing.category} onChange={e => setEditing({ ...editing, category: e.target.value })}>
                  <option>raw</option><option>finished</option><option>general</option><option>packaging</option>
                </select>
              </div>
              <div><label>Supplier</label><input value={editing.supplier || ''} onChange={e => setEditing({ ...editing, supplier: e.target.value })} /></div>
            </div>
            <div className="row2">
              {!editing.id && <div><label>Opening Stock</label><input type="number" value={editing.current_stock} onChange={e => setEditing({ ...editing, current_stock: e.target.value })} /></div>}
              <div><label>Low Stock Threshold</label><input type="number" value={editing.low_stock_threshold} onChange={e => setEditing({ ...editing, low_stock_threshold: e.target.value })} /></div>
              <div><label>Last Purchase Price (₹)</label><input type="number" value={editing.last_purchase_price} onChange={e => setEditing({ ...editing, last_purchase_price: e.target.value })} /></div>
            </div>
            <div className="modal-foot">
              <button className="btn btn-secondary" onClick={() => setEditing(null)}>Cancel</button>
              <button className="btn btn-primary" onClick={save}>Save</button>
            </div>
          </div>
        </div>
      )}

      {txItem && <TxModal item={txItem} onClose={() => { setTxItem(null); load(); }} />}
    </div>
  );
}

function TxModal({ item, onClose }) {
  const [type, setType] = useState('in');
  const [qty, setQty] = useState('');
  const [price, setPrice] = useState('');
  const [reason, setReason] = useState('');
  const [refNo, setRefNo] = useState('');
  const [tx, setTx] = useState([]);

  useEffect(() => { api.invTransactions(item.id).then(setTx); }, [item.id]);

  async function save() {
    if (!qty) return alert('Enter qty');
    await api.invTransaction(item.id, {
      type, qty: Number(qty), unit_price: Number(price) || 0, reason, reference_no: refNo
    });
    onClose();
  }
  return (
    <div className="modal-bg" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal" style={{ maxWidth: 520 }}>
        <h3>Stock Movement · {item.name}</h3>
        <div className="muted-sm">Current: <b>{Number(item.current_stock)} {item.unit}</b></div>
        <label>Type</label>
        <div className="order-type">
          <button className={type === 'in' ? 'active' : ''} onClick={() => setType('in')}>Stock In (Purchase)</button>
          <button className={type === 'out' ? 'active' : ''} onClick={() => setType('out')}>Stock Out (Used / Wastage)</button>
        </div>
        <div className="row2">
          <div><label>Quantity ({item.unit})</label><input type="number" value={qty} onChange={e => setQty(e.target.value)} /></div>
          {type === 'in' && <div><label>Unit Price (₹)</label><input type="number" value={price} onChange={e => setPrice(e.target.value)} /></div>}
        </div>
        <label>Reason / Note</label>
        <input value={reason} onChange={e => setReason(e.target.value)} placeholder="e.g. Daily purchase / Wastage / Used in cooking" />
        <label>Reference No (optional)</label>
        <input value={refNo} onChange={e => setRefNo(e.target.value)} placeholder="Invoice / GRN no." />

        <h4 style={{ marginTop: 16 }}>Recent Transactions</h4>
        <table className="data-table" style={{ fontSize: 12 }}>
          <thead><tr><th>When</th><th>Type</th><th>Qty</th><th>Price</th><th>Reason</th></tr></thead>
          <tbody>
            {tx.slice(0, 10).map(t => (
              <tr key={t.id}>
                <td>{new Date(t.created_at).toLocaleString()}</td>
                <td>{t.type}</td>
                <td>{Number(t.qty)}</td>
                <td>{Number(t.unit_price) > 0 ? '₹' + Number(t.unit_price).toFixed(2) : '—'}</td>
                <td>{t.reason}</td>
              </tr>
            ))}
            {tx.length === 0 && <tr><td colSpan="5" className="empty">No transactions yet</td></tr>}
          </tbody>
        </table>

        <div className="modal-foot">
          <button className="btn btn-secondary" onClick={onClose}>Close</button>
          <button className="btn btn-primary" onClick={save}>Record Movement</button>
        </div>
      </div>
    </div>
  );
}
