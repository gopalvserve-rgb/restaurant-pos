import React, { useEffect, useState } from 'react';
import { api } from '../../api.js';

// Channel lifecycle stages (Zomato/Swiggy) — this is what the monitor tracks live
const STAGE_LABEL = { placed: 'Placed', accepted: 'Accepted', preparing: 'Preparing', ready: 'Ready', picked_up: 'Picked up', delivered: 'Delivered', cancelled: 'Cancelled' };
const STAGE_COLOR = { placed: '#3b82f6', accepted: '#0ea5e9', preparing: '#f59e0b', ready: '#8b5cf6', picked_up: '#0d9488', delivered: '#16a34a', cancelled: '#dc2626' };
const POS_COLOR = { open: '#f59e0b', paid: '#16a34a', hold: '#64748b' };

function parseMeta(s) { try { return typeof s === 'string' ? JSON.parse(s) : (s || {}); } catch (e) { return {}; } }
function timeStr(iso) { try { return new Date(iso).toLocaleTimeString(); } catch (e) { return iso; } }

function Stage({ stage, status }) {
  if (stage) return <span className="badge" style={{ background: (STAGE_COLOR[stage] || '#888') + '22', color: STAGE_COLOR[stage] || '#888', padding: '2px 8px', borderRadius: 4, fontWeight: 600 }}>{STAGE_LABEL[stage] || stage}</span>;
  return <span className="badge" style={{ background: (POS_COLOR[status] || '#888') + '22', color: POS_COLOR[status] || '#888', padding: '2px 8px', borderRadius: 4 }}>{status}</span>;
}

export default function AdminTracking() {
  const [list, setList] = useState([]);
  const [active, setActive] = useState(null);
  const [sourceFilter, setSourceFilter] = useState('');

  async function load() { try { setList(await api.tracking()); } catch (e) {} }
  useEffect(() => { load(); const t = setInterval(load, 10000); return () => clearInterval(t); }, []);
  async function open(id) { try { setActive(await api.order(id)); } catch (e) {} }

  const shown = sourceFilter ? list.filter(o => o.source === sourceFilter) : list;

  return (
    <div className="admin-page">
      <h1>Order Tracking</h1>
      <p className="muted-sm">Live view of today's orders — auto-refreshes every 10s. The stage updates automatically as Zomato/Swiggy move the order (Preparing → Ready → Picked up).</p>

      <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
        <button className="cat-chip" style={{ fontWeight: sourceFilter === '' ? 700 : 400 }} onClick={() => setSourceFilter('')}>All ({list.length})</button>
        <button className="cat-chip" style={{ fontWeight: sourceFilter === 'zomato' ? 700 : 400 }} onClick={() => setSourceFilter('zomato')}>Zomato</button>
        <button className="cat-chip" style={{ fontWeight: sourceFilter === 'swiggy' ? 700 : 400 }} onClick={() => setSourceFilter('swiggy')}>Swiggy</button>
      </div>

      <div className="grid2">
        <div>
          <table className="data-table">
            <thead><tr><th>Order #</th><th>Source</th><th>Stage</th><th>Customer</th><th>Total</th><th>Time</th></tr></thead>
            <tbody>
              {shown.map(o => {
                const m = parseMeta(o.source_meta);
                return (
                  <tr key={o.id} onClick={() => open(o.id)} style={{ cursor: 'pointer', background: active?.id === o.id ? '#fef3c7' : '' }}>
                    <td><b>{o.order_no}</b>{m.display_id ? <div className="muted-sm">#{m.display_id}</div> : null}</td>
                    <td>{o.source ? <span className="badge" style={{ background: o.source === 'swiggy' ? '#fed7aa' : '#fecaca', color: o.source === 'swiggy' ? '#9a3412' : '#991b1b', padding: '2px 8px', borderRadius: 4 }}>{o.source}</span> : (o.type || '—')}</td>
                    <td><Stage stage={o.channel_state} status={o.status} /></td>
                    <td>{o.customer_name || '—'}</td>
                    <td>₹{Number(o.total).toFixed(2)}</td>
                    <td>{timeStr(o.created_at)}</td>
                  </tr>
                );
              })}
              {shown.length === 0 && <tr><td colSpan="6" className="empty">No orders today yet</td></tr>}
            </tbody>
          </table>
        </div>

        <div>
          {active ? (() => {
            const m = parseMeta(active.source_meta);
            const rider = m.rider || null;
            return (
              <div className="card">
                <div className="page-head">
                  <h3>{active.order_no} {m.display_id ? <small className="muted-sm">#{m.display_id}</small> : null}</h3>
                  <button className="btn-link" onClick={() => setActive(null)}>Close</button>
                </div>
                <div className="muted-sm">
                  {(active.source ? active.source.toUpperCase() : active.type)}{active.customer_name ? ' · ' + active.customer_name : ''}{m.order_count ? ' · ' + m.order_count : ''}
                </div>
                {active.customer_phone ? <div className="muted-sm">📞 {active.customer_phone}</div> : null}
                {m.customer_address ? <div className="muted-sm">📍 {m.customer_address}</div> : null}
                {m.address_instructions ? <div className="muted-sm">📝 {m.address_instructions}</div> : null}
                {active.channel_state && <div style={{ marginTop: 8 }}><Stage stage={active.channel_state} status={active.status} /></div>}

                {rider && rider.name && (
                  <div className="card" style={{ marginTop: 12, background: '#f0fdfa', border: '1px solid #99f6e4' }}>
                    <b>🛵 {rider.name}</b> {rider.status ? <span className="muted-sm">({String(rider.status).replace('_', ' ').toLowerCase()})</span> : null}
                    {m.otp ? <div className="muted-sm">Handover OTP: <b>{m.otp}</b></div> : null}
                    {rider.drop ? <div className="muted-sm">Rider ETA: {timeStr(rider.drop)}</div> : null}
                    {m.expected_handover ? <div className="muted-sm">Expected handover: {timeStr(m.expected_handover)}</div> : null}
                    {rider.tracking ? <div className="muted-sm">Live tracking available on Zomato</div> : null}
                  </div>
                )}

                <h4 style={{ marginTop: 16 }}>Items</h4>
                <table className="data-table">
                  <tbody>
                    {(active.items || []).map(it => (
                      <tr key={it.id}>
                        <td>{it.name}{it.notes && it.notes !== 'UNMATCHED ITEM' ? <div className="muted-sm">{it.notes}</div> : null}</td>
                        <td>×{it.qty}</td>
                        <td>₹{(Number(it.price) * Number(it.qty)).toFixed(0)}</td>
                      </tr>
                    ))}
                    {(active.items || []).length === 0 && <tr><td className="empty">No items</td></tr>}
                  </tbody>
                </table>

                <div style={{ marginTop: 12, fontSize: 14 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}><span className="muted-sm">Item total</span><span>₹{Number(active.subtotal || 0).toFixed(2)}</span></div>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}><span className="muted-sm">Taxes</span><span>₹{Number(active.tax || 0).toFixed(2)}</span></div>
                  {Number(active.discount) > 0 && <div style={{ display: 'flex', justifyContent: 'space-between', color: '#16a34a' }}><span>Discount</span><span>−₹{Number(active.discount).toFixed(2)}</span></div>}
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 700, marginTop: 4, borderTop: '1px solid #e5e7eb', paddingTop: 4 }}>
                    <span>Total Bill {m.payment_type ? <span className="badge" style={{ background: '#dcfce7', color: '#166534', padding: '1px 6px', borderRadius: 4, fontSize: 11 }}>{m.payment_type}</span> : null}</span>
                    <span>₹{Number(active.total).toFixed(2)}</span>
                  </div>
                </div>

                <h4 style={{ marginTop: 16 }}>Timeline</h4>
                <div className="timeline">
                  {(active.tracking || []).map(t => (
                    <div key={t.id} className="tl-item">
                      <div className="tl-dot" style={{ background: STAGE_COLOR[t.status] || '#888' }} />
                      <div>
                        <div><b>{STAGE_LABEL[t.status] || t.status}</b></div>
                        {t.note && <div className="muted-sm">{t.note}</div>}
                        <div className="muted-sm">{timeStr(t.created_at)}</div>
                      </div>
                    </div>
                  ))}
                  {(active.tracking || []).length === 0 && <div className="empty">No tracking events yet</div>}
                </div>
              </div>
            );
          })() : (
            <div className="empty">Click an order to view rider, customer, address, bill breakdown and live stage</div>
          )}
        </div>
      </div>
    </div>
  );
}
