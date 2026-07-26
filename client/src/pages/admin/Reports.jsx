import React, { useEffect, useState } from 'react';
import { api } from '../../api.js';

function todayISO(offset = 0) {
  const d = new Date(); d.setDate(d.getDate() + offset);
  return d.toISOString().slice(0, 10);
}

export default function AdminReports() {
  const [tab, setTab] = useState('summary');
  const [from, setFrom] = useState(todayISO(-30));
  const [to, setTo] = useState(todayISO());

  const qs = `?from=${from}&to=${to}`;
  const reports = {
    summary: <SummaryReport qs={qs} />,
    items: <ItemReport qs={qs} />,
    payment: <PaymentReport qs={qs} />,
    tax: <TaxReport qs={qs} />,
    hours: <PeakHoursReport qs={qs} />,
    customers: <TopCustomersReport qs={qs} />
  };

  function quickRange(days) {
    setFrom(todayISO(-days)); setTo(todayISO());
  }

  return (
    <div className="admin-page">
      <h1>Reports</h1>
      <div className="filter-bar">
        <div><label>From</label><input type="date" value={from} onChange={e => setFrom(e.target.value)} /></div>
        <div><label>To</label><input type="date" value={to} onChange={e => setTo(e.target.value)} /></div>
        <div style={{ flex: 1 }}>
          <button className="cat-chip" onClick={() => quickRange(0)}>Today</button>{' '}
          <button className="cat-chip" onClick={() => quickRange(7)}>Last 7 days</button>{' '}
          <button className="cat-chip" onClick={() => quickRange(30)}>Last 30 days</button>{' '}
          <button className="cat-chip" onClick={() => quickRange(90)}>Last 90 days</button>
        </div>
      </div>

      <div className="cat-bar">
        <button className={'cat-chip' + (tab === 'summary' ? ' active' : '')} onClick={() => setTab('summary')}>📊 Summary</button>
        <button className={'cat-chip' + (tab === 'items' ? ' active' : '')} onClick={() => setTab('items')}>🍽️ Item-wise Sales</button>
        <button className={'cat-chip' + (tab === 'payment' ? ' active' : '')} onClick={() => setTab('payment')}>💳 Payment Breakdown</button>
        <button className={'cat-chip' + (tab === 'tax' ? ' active' : '')} onClick={() => setTab('tax')}>🧾 Tax / GST</button>
        <button className={'cat-chip' + (tab === 'hours' ? ' active' : '')} onClick={() => setTab('hours')}>⏰ Peak Hours</button>
        <button className={'cat-chip' + (tab === 'customers' ? ' active' : '')} onClick={() => setTab('customers')}>👑 Top Customers</button>
      </div>

      {reports[tab]}
    </div>
  );
}

function downloadCSV(filename, rows) {
  if (!rows.length) return alert('Nothing to export');
  const headers = Object.keys(rows[0]);
  const csv = [headers, ...rows.map(r => headers.map(h => r[h]))]
    .map(r => r.map(v => `"${String(v ?? '').replace(/"/g, '""')}"`).join(','))
    .join('\n');
  const blob = new Blob([csv], { type: 'text/csv' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
}

function SummaryReport({ qs }) {
  const [s, setS] = useState({});
  useEffect(() => { api.reportSummary(qs).then(setS); }, [qs]);
  const fmt = (n) => '₹' + Number(n || 0).toFixed(2);
  return (
    <div className="kpi-grid">
      <div className="kpi"><div className="kpi-num">{s.orders || 0}</div><div className="kpi-lbl">Total Orders</div></div>
      <div className="kpi"><div className="kpi-num">{fmt(s.revenue)}</div><div className="kpi-lbl">Total Revenue</div></div>
      <div className="kpi"><div className="kpi-num">{fmt(s.net_sales)}</div><div className="kpi-lbl">Net Sales (pre-tax)</div></div>
      <div className="kpi"><div className="kpi-num">{fmt(s.total_tax)}</div><div className="kpi-lbl">Total Tax</div></div>
      <div className="kpi"><div className="kpi-num">{fmt(s.total_discount)}</div><div className="kpi-lbl">Total Discount</div></div>
      <div className="kpi"><div className="kpi-num">{fmt(s.avg_order_value)}</div><div className="kpi-lbl">Avg Order Value</div></div>
    </div>
  );
}

function ItemReport({ qs }) {
  const [rows, setRows] = useState([]);
  useEffect(() => { api.reportItems(qs).then(setRows); }, [qs]);
  const totalQty = rows.reduce((s, r) => s + Number(r.qty), 0);
  const totalRev = rows.reduce((s, r) => s + Number(r.revenue), 0);
  return (
    <div className="card">
      <div className="page-head">
        <h3>Item-wise Sales · {rows.length} items</h3>
        <button className="btn btn-secondary" onClick={() => downloadCSV('item-sales.csv', rows)}>Export CSV</button>
      </div>
      <table className="data-table">
        <thead><tr><th>Item</th><th>Qty Sold</th><th>Revenue</th><th>Tax</th></tr></thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i}>
              <td><b>{r.name}</b></td>
              <td>{Number(r.qty)}</td>
              <td>₹{Number(r.revenue).toFixed(2)}</td>
              <td>₹{Number(r.tax).toFixed(2)}</td>
            </tr>
          ))}
          {rows.length === 0 && <tr><td colSpan="4" className="empty">No sales in this period</td></tr>}
          {rows.length > 0 && <tr style={{ background: '#f8fafc', fontWeight: 700 }}><td>TOTAL</td><td>{totalQty}</td><td>₹{totalRev.toFixed(2)}</td><td></td></tr>}
        </tbody>
      </table>
    </div>
  );
}

function PaymentReport({ qs }) {
  const [rows, setRows] = useState([]);
  useEffect(() => { api.reportPayment(qs).then(setRows); }, [qs]);
  const total = rows.reduce((s, r) => s + Number(r.total), 0);
  return (
    <div className="card">
      <div className="page-head">
        <h3>Payment Breakdown</h3>
        <button className="btn btn-secondary" onClick={() => downloadCSV('payment-breakdown.csv', rows)}>Export CSV</button>
      </div>
      <table className="data-table">
        <thead><tr><th>Method</th><th>Orders</th><th>Total Collected</th><th>% Share</th></tr></thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i}>
              <td><b style={{ textTransform: 'uppercase' }}>{r.method}</b></td>
              <td>{r.orders}</td>
              <td>₹{Number(r.total).toFixed(2)}</td>
              <td>{total > 0 ? ((Number(r.total) / total) * 100).toFixed(1) : 0}%</td>
            </tr>
          ))}
          {rows.length === 0 && <tr><td colSpan="4" className="empty">No paid orders</td></tr>}
        </tbody>
      </table>
    </div>
  );
}

function TaxReport({ qs }) {
  const [rows, setRows] = useState([]);
  useEffect(() => { api.reportTax(qs).then(setRows); }, [qs]);
  return (
    <div className="card">
      <div className="page-head">
        <h3>Tax / GST Report</h3>
        <button className="btn btn-secondary" onClick={() => downloadCSV('tax-report.csv', rows)}>Export CSV</button>
      </div>
      <table className="data-table">
        <thead><tr><th>Tax Rate</th><th>Taxable Amount</th><th>Tax Amount</th></tr></thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i}>
              <td><b>{Number(r.rate)}%</b></td>
              <td>₹{Number(r.taxable_amount).toFixed(2)}</td>
              <td>₹{Number(r.tax_amount).toFixed(2)}</td>
            </tr>
          ))}
          {rows.length === 0 && <tr><td colSpan="3" className="empty">No sales</td></tr>}
        </tbody>
      </table>
    </div>
  );
}

function PeakHoursReport({ qs }) {
  const [rows, setRows] = useState([]);
  useEffect(() => { api.reportPeakHours(qs).then(setRows); }, [qs]);
  const maxOrders = Math.max(1, ...rows.map(r => Number(r.orders)));
  return (
    <div className="card">
      <h3>Orders by Hour</h3>
      <div className="bar-chart">
        {rows.map((r, i) => (
          <div key={i} className="bar-row">
            <div className="bar-lbl">{String(r.hour).padStart(2, '0')}:00</div>
            <div className="bar-track">
              <div className="bar-fill" style={{ width: (Number(r.orders) / maxOrders * 100) + '%' }} />
            </div>
            <div className="bar-val">{r.orders} · ₹{Number(r.revenue).toFixed(0)}</div>
          </div>
        ))}
        {rows.length === 0 && <div className="empty">No data</div>}
      </div>
    </div>
  );
}

function TopCustomersReport({ qs }) {
  const [rows, setRows] = useState([]);
  useEffect(() => { api.reportTopCustomers(qs).then(setRows); }, [qs]);
  return (
    <div className="card">
      <div className="page-head">
        <h3>Top Customers</h3>
        <button className="btn btn-secondary" onClick={() => downloadCSV('top-customers.csv', rows)}>Export CSV</button>
      </div>
      <table className="data-table">
        <thead><tr><th>#</th><th>Customer</th><th>Phone</th><th>Orders</th><th>Total Spend</th></tr></thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i}>
              <td>{i + 1}</td>
              <td><b>{r.name}</b></td>
              <td>{r.phone || '—'}</td>
              <td>{r.orders}</td>
              <td>₹{Number(r.total_spend).toFixed(2)}</td>
            </tr>
          ))}
          {rows.length === 0 && <tr><td colSpan="5" className="empty">No customer orders</td></tr>}
        </tbody>
      </table>
    </div>
  );
}
