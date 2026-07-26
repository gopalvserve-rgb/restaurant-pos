import React, { useEffect, useState } from 'react';
import { api } from '../../api.js';

const PAGE_SIZE = 25;
const EMPTY_FILTERS = { source: '', channel_state: '', status: '', search: '', from: '', to: '' };

export default function AdminIntegrations() {
  const [orders, setOrders] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(0);
  const [filters, setFilters] = useState(EMPTY_FILTERS);
  const [loading, setLoading] = useState(false);
  const [rawView, setRawView] = useState(null); // { order, logs, loading }
  const origin = window.location.origin;

  // Open a viewer for one order. mode = 'details' (full payload/raw) or 'status' (status log).
  const openRaw = (o, mode) => {
    setRawView({ order: o, logs: [], loading: true, mode: mode || 'details' });
    api.integrationLogs('?external_id=' + encodeURIComponent(o.external_id) + '&full=1&limit=100')
      .then(logs => setRawView({ order: o, logs: Array.isArray(logs) ? logs : [], loading: false, mode: mode || 'details' }))
      .catch(() => setRawView({ order: o, logs: [], loading: false, mode: mode || 'details' }));
  };
  const copyRaw = () => {
    if (!rawView) return;
    try { navigator.clipboard.writeText(JSON.stringify(rawView.logs, null, 2)); } catch (e) {}
  };

  useEffect(() => {
    const qp = new URLSearchParams();
    Object.entries(filters).forEach(([k, v]) => { if (v) qp.set(k, v); });
    qp.set('limit', PAGE_SIZE);
    qp.set('offset', page * PAGE_SIZE);
    setLoading(true);
    const t = setTimeout(() => {
      api.externalOrders('?' + qp.toString())
        .then(r => {
          // Back-compat: old API returned a plain array
          const rows = Array.isArray(r) ? r : (r.orders || []);
          setOrders(rows);
          setTotal(Array.isArray(r) ? rows.length : (r.total || 0));
        })
        .catch(() => { setOrders([]); setTotal(0); })
        .finally(() => setLoading(false));
    }, 250);
    return () => clearTimeout(t);
  }, [filters, page]);

  const setFilter = (k, v) => { setPage(0); setFilters(prev => ({ ...prev, [k]: v })); };
  const clearFilters = () => { setPage(0); setFilters(EMPTY_FILTERS); };
  const hasFilters = Object.values(filters).some(Boolean);
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const from = total === 0 ? 0 : page * PAGE_SIZE + 1;
  const to = Math.min((page + 1) * PAGE_SIZE, total);
  const selStyle = { padding: '6px 8px', borderRadius: 6, border: '1px solid #d1d5db', fontSize: 13 };

  return (
    <div className="admin-page">
      <h1>Integrations</h1>
      <p className="muted-sm">Connect external platforms (Swiggy, Zomato, etc.) to auto-capture orders into your POS.</p>

      <div className="card" style={{ background: 'linear-gradient(135deg, #fff7ed, #fed7aa)', border: '2px solid #ff6b35', marginBottom: 20 }}>
        <h3>🆕 v8.1 — Full Order Detail Extension</h3>
        <p className="muted-sm" style={{ margin: '0 0 8px', fontWeight: 600 }}>Version 8.1.0 · Last updated 2026-07-26</p>
        <p><b>The big one.</b> One-click pull of <b>Brands → Outlets → Categories → Items → Variants → Reviews → Orders</b> from Zomato/Swiggy partner dashboards. Cloud-kitchen ready.</p>
        <ul style={{ fontSize: 13, marginLeft: 18, lineHeight: 1.6 }}>
          <li>🧾 <b>NEW:</b> pulls full live order detail — customer, items, price & status (Preparing / Ready / Picked up)</li>
          <li>📦 Hierarchical menu (category → subcategory → item → variants)</li>
          <li>🏷️ Auto-detects brands across outlets (cloud kitchens)</li>
          <li>⭐ Pulls reviews + ratings with auto-sentiment tagging</li>
          <li>🔄 Background auto-pull every 60 seconds</li>
        </ul>
        <p style={{ fontSize: 12, color: '#9a3412', margin: '4px 0 10px' }}>⚠️ After downloading, remove the old extension in <code>chrome://extensions</code> and load this one, or click the reload icon — then run <b>Sync Orders</b>.</p>
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginTop: 10 }}>
          <a className="btn btn-primary" href="/downloads/v8-chrome.zip" download style={{ background: '#ff6b35', padding: '10px 18px', textDecoration: 'none', borderRadius: 6, color: 'white', fontWeight: 600 }}>⬇ Chrome v8.1</a>
          <a className="btn btn-primary" href="/downloads/v8-firefox.zip" download style={{ background: '#e63946', padding: '10px 18px', textDecoration: 'none', borderRadius: 6, color: 'white', fontWeight: 600 }}>⬇ Firefox v8</a>
          <a className="btn" href="/downloads/v7-chrome.zip" download style={{ padding: '10px 14px', textDecoration: 'none', borderRadius: 6, fontSize: 12 }}>v7 Chrome (legacy)</a>
        </div>
      </div>

      <div className="grid2">
        <div className="card">
          <h3>🌐 Chrome / Brave / Edge Extension (v1 legacy)</h3>
          <p>Captures orders from Swiggy Partner &amp; Zomato for Business dashboards (works on any Chromium browser).</p>
          <a className="btn btn-primary" href="/downloads/restaurant-pos-extension-chrome.zip" download style={{ display: 'inline-block', padding: '10px 18px', textDecoration: 'none' }}>⬇ Download Chrome Extension</a>
          <details style={{ marginTop: 14 }}>
            <summary style={{ cursor: 'pointer', fontWeight: 600 }}>Install instructions</summary>
            <ol style={{ marginLeft: 18, fontSize: 13, lineHeight: 1.7 }}>
              <li>Download &amp; unzip the file</li>
              <li>Open <code>chrome://extensions</code></li>
              <li>Enable <b>Developer mode</b> (top-right)</li>
              <li>Click <b>Load unpacked</b> → pick the extracted folder</li>
              <li>Click the orange icon → POS URL pre-filled with this server → Save</li>
              <li>Open Swiggy Partner / Zomato dashboard → new orders sync automatically</li>
            </ol>
          </details>
        </div>

        <div className="card">
          <h3>🦊 Firefox Extension</h3>
          <p>Same functionality for Firefox users.</p>
          <a className="btn btn-primary" href="/downloads/restaurant-pos-extension-firefox.zip" download style={{ display: 'inline-block', padding: '10px 18px', textDecoration: 'none' }}>⬇ Download Firefox Extension</a>
        </div>

        <div className="card">
          <h3>📡 Webhook API (build your own integration)</h3>
          <p>Any platform can POST orders to this endpoint:</p>
          <code style={{ display: 'block', padding: 8, background: '#1e293b', color: '#86efac', borderRadius: 4, fontSize: 12, overflowX: 'auto' }}>
            POST {origin}/api/external-order
          </code>
          <small className="muted-sm">Dedup automatic. Fuzzy menu matching. KOT auto-created. Recipes auto-deducted.</small>
        </div>

        <div className="card">
          <h3>💬 WhatsApp Receipts</h3>
          <p>Send bills via WhatsApp — uses <code>wa.me</code> (free, no API keys).</p>
        </div>
      </div>

      <h3 style={{ marginTop: 32, marginBottom: 8 }}>
        Recent channel orders {loading ? <small className="muted-sm">(loading…)</small> : <span className="muted-sm">({total.toLocaleString()} total)</span>}
      </h3>

      {/* Filter bar */}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', marginBottom: 12 }}>
        <input
          style={{ ...selStyle, minWidth: 200, flex: '1 1 220px' }}
          placeholder="Search order #, ID, customer, phone…"
          value={filters.search}
          onChange={e => setFilter('search', e.target.value)}
        />
        <select style={selStyle} value={filters.source} onChange={e => setFilter('source', e.target.value)}>
          <option value="">All sources</option>
          <option value="zomato">Zomato</option>
          <option value="swiggy">Swiggy</option>
        </select>
        <select style={selStyle} value={filters.channel_state} onChange={e => setFilter('channel_state', e.target.value)}>
          <option value="">All stages</option>
          <option value="placed">Placed</option>
          <option value="accepted">Accepted</option>
          <option value="preparing">Preparing</option>
          <option value="ready">Ready</option>
          <option value="picked_up">Picked up</option>
          <option value="delivered">Delivered</option>
          <option value="cancelled">Cancelled</option>
        </select>
        <select style={selStyle} value={filters.status} onChange={e => setFilter('status', e.target.value)}>
          <option value="">All payment states</option>
          <option value="open">Open</option>
          <option value="paid">Paid</option>
          <option value="hold">Hold</option>
        </select>
        <label className="muted-sm" style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          From <input type="date" style={selStyle} value={filters.from} onChange={e => setFilter('from', e.target.value)} />
        </label>
        <label className="muted-sm" style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          To <input type="date" style={selStyle} value={filters.to} onChange={e => setFilter('to', e.target.value)} />
        </label>
        {hasFilters && (
          <button className="btn" style={{ ...selStyle, cursor: 'pointer' }} onClick={clearFilters}>✕ Clear</button>
        )}
      </div>

      <table className="data-table">
        <thead>
          <tr><th>Source</th><th>Order #</th><th>External ID</th><th>Customer</th><th>Total</th><th>Stage</th><th>Payment</th><th>When</th><th>Details / Status</th></tr>
        </thead>
        <tbody>
          {orders.map(o => (
            <tr key={o.id}>
              <td><span className="badge" style={{ background: o.source === 'swiggy' ? '#fed7aa' : '#fecaca', color: o.source === 'swiggy' ? '#9a3412' : '#991b1b', padding: '2px 8px', borderRadius: 4 }}>{o.source}</span></td>
              <td><code>{o.order_no}</code></td>
              <td><code>{o.external_id}</code></td>
              <td>{o.customer_name || '—'} <small className="muted-sm">{o.customer_phone}</small></td>
              <td>₹{Number(o.total).toFixed(2)}</td>
              <td>{o.channel_state ? <span className="badge" style={{ background: '#e0f2fe', color: '#075985', padding: '2px 8px', borderRadius: 4 }}>{String(o.channel_state).replace('_', ' ')}</span> : '—'}</td>
              <td><span className={'badge badge-' + o.status}>{o.status}</span></td>
              <td>{new Date(o.created_at).toLocaleString()}</td>
              <td style={{ whiteSpace: 'nowrap' }}>
                <button className="btn" style={{ padding: '2px 8px', fontSize: 12, cursor: 'pointer', borderRadius: 6, border: '1px solid #d1d5db', marginRight: 4 }} onClick={() => openRaw(o, 'details')}>📄 Details</button>
                <button className="btn" style={{ padding: '2px 8px', fontSize: 12, cursor: 'pointer', borderRadius: 6, border: '1px solid #d1d5db' }} onClick={() => openRaw(o, 'status')}>📊 Status log</button>
              </td>
            </tr>
          ))}
          {orders.length === 0 && !loading && (
            <tr><td colSpan="9" className="empty">{hasFilters ? 'No orders match these filters.' : 'No external orders yet. Install the extension and open Swiggy/Zomato.'}</td></tr>
          )}
        </tbody>
      </table>

      {/* Pagination */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginTop: 12, flexWrap: 'wrap' }}>
        <span className="muted-sm">{total === 0 ? 'No results' : `Showing ${from}–${to} of ${total.toLocaleString()}`}</span>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <button className="btn" style={{ ...selStyle, cursor: page === 0 ? 'not-allowed' : 'pointer', opacity: page === 0 ? 0.5 : 1 }} disabled={page === 0} onClick={() => setPage(0)}>« First</button>
          <button className="btn" style={{ ...selStyle, cursor: page === 0 ? 'not-allowed' : 'pointer', opacity: page === 0 ? 0.5 : 1 }} disabled={page === 0} onClick={() => setPage(p => Math.max(0, p - 1))}>‹ Prev</button>
          <span className="muted-sm">Page {page + 1} of {totalPages}</span>
          <button className="btn" style={{ ...selStyle, cursor: page + 1 >= totalPages ? 'not-allowed' : 'pointer', opacity: page + 1 >= totalPages ? 0.5 : 1 }} disabled={page + 1 >= totalPages} onClick={() => setPage(p => p + 1)}>Next ›</button>
          <button className="btn" style={{ ...selStyle, cursor: page + 1 >= totalPages ? 'not-allowed' : 'pointer', opacity: page + 1 >= totalPages ? 0.5 : 1 }} disabled={page + 1 >= totalPages} onClick={() => setPage(totalPages - 1)}>Last »</button>
        </div>
      </div>

      {/* Viewer modal — two modes: Details (full payload/raw) and Status log (state history) */}
      {rawView && (() => {
        const isStatus = rawView.mode === 'status';
        // newest-first for details; oldest-first (chronological) for the status log
        const logs = rawView.logs.slice();
        const statusLogs = logs.slice().sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
        const latest = logs[0];
        const stateOf = (l) => (l && l.payload && l.payload.meta && (l.payload.meta.state)) || '—';
        return (
        <div onClick={() => setRawView(null)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
          <div onClick={e => e.stopPropagation()} style={{ background: '#fff', borderRadius: 10, width: 'min(900px, 96vw)', maxHeight: '88vh', display: 'flex', flexDirection: 'column', boxShadow: '0 10px 40px rgba(0,0,0,0.3)' }}>
            <div style={{ padding: '14px 18px', borderBottom: '1px solid #e5e7eb', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
              <div>
                <strong>{isStatus ? '📊 Status log' : '📄 Order details'} — {rawView.order.source} #{rawView.order.external_id}</strong>
                <div className="muted-sm">Order {rawView.order.order_no} · {rawView.order.customer_name || 'no customer'}</div>
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <button className="btn" style={{ padding: '6px 12px', cursor: 'pointer', borderRadius: 6, border: '1px solid ' + (isStatus ? '#d1d5db' : '#ff6b35'), background: isStatus ? '#fff' : '#fff7ed', fontWeight: isStatus ? 400 : 700 }} onClick={() => setRawView(v => ({ ...v, mode: 'details' }))}>Details</button>
                <button className="btn" style={{ padding: '6px 12px', cursor: 'pointer', borderRadius: 6, border: '1px solid ' + (isStatus ? '#ff6b35' : '#d1d5db'), background: isStatus ? '#fff7ed' : '#fff', fontWeight: isStatus ? 700 : 400 }} onClick={() => setRawView(v => ({ ...v, mode: 'status' }))}>Status log</button>
                {!isStatus && <button className="btn" style={{ padding: '6px 12px', cursor: 'pointer', borderRadius: 6, border: '1px solid #d1d5db' }} onClick={copyRaw}>📋 Copy</button>}
                <button className="btn" style={{ padding: '6px 12px', cursor: 'pointer', borderRadius: 6, border: '1px solid #d1d5db' }} onClick={() => setRawView(null)}>✕ Close</button>
              </div>
            </div>
            <div style={{ padding: 16, overflow: 'auto' }}>
              {rawView.loading && <p className="muted-sm">Loading…</p>}
              {!rawView.loading && logs.length === 0 && (
                <p className="muted-sm">No log captured for this order yet. Once the passive-capture extension (v8.2) runs and the dashboard loads this order, its details and status history appear here.</p>
              )}

              {/* STATUS LOG — chronological state changes */}
              {!rawView.loading && isStatus && logs.length > 0 && (
                <table className="data-table">
                  <thead><tr><th>Time</th><th>State</th><th>Outcome</th><th>Items</th><th>Total</th><th>Via</th></tr></thead>
                  <tbody>
                    {statusLogs.map((l, i) => (
                      <tr key={l.id || i}>
                        <td>{new Date(l.created_at).toLocaleString()}</td>
                        <td><span className="badge" style={{ background: '#e0f2fe', color: '#075985', padding: '2px 8px', borderRadius: 4 }}>{stateOf(l)}</span></td>
                        <td className="muted-sm">{l.outcome}</td>
                        <td>{l.items_count}</td>
                        <td>₹{l.total}</td>
                        <td className="muted-sm">{l.payload && l.payload.meta && l.payload.meta.captured_via ? l.payload.meta.captured_via : '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}

              {/* DETAILS — full payload + raw platform JSON (latest capture) */}
              {!rawView.loading && !isStatus && latest && (
                <div>
                  <div className="muted-sm" style={{ marginBottom: 6 }}>
                    Latest capture: {new Date(latest.created_at).toLocaleString()} · outcome: <strong>{latest.outcome}</strong> · items: {latest.items_count} · total: ₹{latest.total}
                  </div>
                  <div style={{ fontSize: 12, fontWeight: 600, margin: '8px 0 4px', color: '#374151' }}>Payload sent to POS</div>
                  <pre style={{ background: '#0b1021', color: '#d1e7ff', padding: 12, borderRadius: 6, overflow: 'auto', fontSize: 12, maxHeight: 260, margin: 0 }}>{JSON.stringify(latest.payload, null, 2)}</pre>
                  <div style={{ fontSize: 12, fontWeight: 600, margin: '10px 0 4px', color: '#374151' }}>Complete raw order-details JSON (from the platform)</div>
                  <pre style={{ background: '#0b1021', color: '#c7f9cc', padding: 12, borderRadius: 6, overflow: 'auto', fontSize: 12, maxHeight: 380, margin: 0 }}>{latest.raw_platform ? JSON.stringify(latest.raw_platform, null, 2) : '(no order-details captured yet — the passive-capture extension logs it once the dashboard loads this order)'}</pre>
                </div>
              )}
            </div>
          </div>
        </div>
        );
      })()}
    </div>
  );
}
