import React, { useEffect, useState } from 'react';
import { api } from '../../api.js';
import Bill from '../../components/Bill.jsx';

export default function AdminOrders() {
  const [orders, setOrders] = useState([]);
  const [status, setStatus] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [bill, setBill] = useState(null);

  async function load() {
    const qs = [];
    if (status) qs.push('status=' + status);
    if (from) qs.push('from=' + from);
    if (to) qs.push('to=' + to);
    setOrders(await api.orders(qs.length ? '?' + qs.join('&') : ''));
  }
  useEffect(() => { load(); }, [status, from, to]);

  async function viewBill(id) { setBill(await api.order(id)); }
  async function settle(id) {
    if (!confirm('Settle this order with cash?')) return;
    await api.settle(id, { payment_method: 'cash', discount: 0 });
    load();
  }

  function exportCsv() {
    const headers = ['Order No','Type','Table','Customer','Phone','Status','Subtotal','Tax','Discount','Total','Payment','Created','Closed'];
    const rows = orders.map(o => [
      o.order_no, o.type, o.table_name || '', o.customer_name || '', o.customer_phone || '',
      o.status, o.subtotal, o.tax, o.discount, o.total, o.payment_method || '',
      o.created_at, o.closed_at || ''
    ]);
    const csv = [headers, ...rows].map(r => r.map(v => `"${String(v).replace(/"/g, '""')}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `orders-${new Date().toISOString().slice(0,10)}.csv`;
    a.click(); URL.revokeObjectURL(url);
  }

  if (bill) {
    return (
      <div className="admin-page">
        <div className="no-print" style={{ marginBottom: 12 }}>
          <button className="btn btn-primary" onClick={() => window.print()}>Print Bill</button>{' '}
          <button className="btn btn-secondary" onClick={() => setBill(null)}>Back</button>
        </div>
        <Bill order={bill} />
      </div>
    );
  }

  return (
    <div className="admin-page">
      <div className="page-head">
        <h1>Orders</h1>
        <div>
          <button className="btn btn-secondary" onClick={exportCsv}>Export CSV</button>
        </div>
      </div>

      <div className="filter-bar">
        <div>
          <label>Status</label>
          <select value={status} onChange={e => setStatus(e.target.value)}>
            <option value="">All</option><option value="open">Open</option><option value="paid">Paid</option>
          </select>
        </div>
        <div><label>From</label><input type="date" value={from} onChange={e => setFrom(e.target.value)} /></div>
        <div><label>To</label><input type="date" value={to} onChange={e => setTo(e.target.value)} /></div>
        <div className="muted-sm">{orders.length} orders</div>
      </div>

      <table className="data-table">
        <thead><tr><th>Order #</th><th>Type</th><th>Table</th><th>Customer</th><th>Total</th><th>Status</th><th>Date</th><th></th></tr></thead>
        <tbody>
          {orders.map(o => (
            <tr key={o.id}>
              <td><b>{o.order_no}</b></td>
              <td>{o.type}</td>
              <td>{o.table_name || '—'}</td>
              <td>{o.customer_name || '—'}<br/><span className="muted-sm">{o.customer_phone}</span></td>
              <td>₹{Number(o.total).toFixed(2)}</td>
              <td><span className={'badge badge-' + o.status}>{o.status}</span></td>
              <td>{new Date(o.created_at).toLocaleString()}</td>
              <td>
                <button className="btn-link" onClick={() => viewBill(o.id)}>View</button>
                {o.status === 'open' && <>{' · '}<button className="btn-link" onClick={() => settle(o.id)}>Settle</button></>}
              </td>
            </tr>
          ))}
          {orders.length === 0 && <tr><td colSpan="8" className="empty">No orders</td></tr>}
        </tbody>
      </table>
    </div>
  );
}
