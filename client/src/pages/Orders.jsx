import React, { useEffect, useState } from 'react';
import { api } from '../api.js';
import Bill from '../components/Bill.jsx';

export default function Orders({ onAction }) {
  const [orders, setOrders] = useState([]);
  const [filter, setFilter] = useState('open');
  const [billOrder, setBillOrder] = useState(null);
  const [loading, setLoading] = useState(false);

  async function load() {
    setLoading(true);
    try {
      setOrders(await api.orders(filter === 'all' ? null : filter));
    } finally { setLoading(false); }
  }
  useEffect(() => { load(); }, [filter]);

  async function settle(id) {
    if (!confirm('Settle this order with cash?')) return;
    await api.settle(id, { payment_method: 'cash', discount: 0 });
    const full = await api.order(id);
    setBillOrder(full);
    onAction?.();
    load();
  }

  async function viewBill(id) {
    setBillOrder(await api.order(id));
  }

  if (billOrder) {
    return (
      <div className="page">
        <div className="no-print" style={{ marginBottom: 12 }}>
          <button className="btn btn-primary" onClick={() => window.print()}>Print Bill</button>{' '}
          <button className="btn btn-secondary" onClick={() => setBillOrder(null)}>Back</button>
        </div>
        <Bill order={billOrder} />
      </div>
    );
  }

  return (
    <div className="page">
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 16 }}>
        <h2>Orders</h2>
        <div>
          <button className={'cat-chip' + (filter === 'open' ? ' active' : '')} onClick={() => setFilter('open')}>Open</button>{' '}
          <button className={'cat-chip' + (filter === 'paid' ? ' active' : '')} onClick={() => setFilter('paid')}>Paid</button>{' '}
          <button className={'cat-chip' + (filter === 'all' ? ' active' : '')} onClick={() => setFilter('all')}>All</button>
        </div>
      </div>

      {loading && <div className="empty">Loading…</div>}
      {!loading && orders.length === 0 && <div className="empty">No orders</div>}

      {orders.map(o => (
        <div key={o.id} className="card">
          <div className="card-head">
            <div>
              <b>{o.order_no}</b>{' '}
              <span className={'badge badge-' + o.status}>{o.status}</span>{' '}
              <span style={{ color: 'var(--muted)' }}>
                {o.type === 'dine-in' ? `Dine-In · ${o.table_name || '—'}` : 'Takeaway'}
              </span>
            </div>
            <div>
              <span style={{ fontSize: 18, fontWeight: 700 }}>₹{Number(o.total).toFixed(2)}</span>
            </div>
          </div>
          <div style={{ color: 'var(--muted)', fontSize: 12 }}>
            {o.customer_name && <>👤 {o.customer_name} · </>}
            {o.customer_phone && <>📞 {o.customer_phone} · </>}
            {new Date(o.created_at).toLocaleString()}
          </div>
          <div style={{ marginTop: 10, display: 'flex', gap: 8 }}>
            <button className="btn btn-secondary" onClick={() => viewBill(o.id)}>View Bill</button>
            {o.status === 'open' && (
              <button className="btn btn-success" onClick={() => settle(o.id)}>Settle</button>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}
