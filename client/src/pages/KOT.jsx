import React, { useEffect, useState } from 'react';
import { api } from '../api.js';

export default function KOT() {
  const [list, setList] = useState([]);

  async function load() {
    setList(await api.kotList());
  }
  useEffect(() => {
    load();
    const t = setInterval(load, 8000);
    return () => clearInterval(t);
  }, []);

  async function mark(id, status) {
    await api.kotStatus(id, status);
    load();
  }

  return (
    <div className="page">
      <h2>Kitchen Order Tickets (KOT)</h2>
      {list.length === 0 && <div className="empty">No active KOTs<br/><small>New orders will appear here</small></div>}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 16 }}>
        {list.map(k => (
          <div key={k.id} className="kot-ticket">
            <h4>{k.kot_no}</h4>
            <div className="meta">
              {k.type === 'dine-in' ? `Table ${k.table_name || '?'}` : 'Takeaway'} · {k.order_no}<br/>
              {new Date(k.created_at).toLocaleTimeString()}
            </div>
            <div>
              {k.items.map(it => (
                <div key={it.id} className="kitem">
                  <span>{it.name} {it.notes && <em>({it.notes})</em>}</span>
                  <b>× {it.qty}</b>
                </div>
              ))}
            </div>
            <div style={{ marginTop: 12, display: 'flex', gap: 6 }}>
              <span className={'badge badge-' + (k.status === 'served' ? 'served' : 'pending')}>{k.status}</span>
              <div style={{ marginLeft: 'auto', display: 'flex', gap: 6 }}>
                <button className="btn btn-secondary" style={{ padding: '4px 10px', fontSize: 12 }} onClick={() => window.print()}>Print</button>
                {k.status !== 'served' && (
                  <button className="btn btn-success" style={{ padding: '4px 10px', fontSize: 12 }} onClick={() => mark(k.id, 'served')}>Mark Served</button>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
