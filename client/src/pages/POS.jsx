import React, { useEffect, useMemo, useState } from 'react';
import { api } from '../api.js';
import Bill from '../components/Bill.jsx';

export default function POS({ onAction }) {
  const [cats, setCats] = useState([]);
  const [menu, setMenu] = useState([]);
  const [combos, setCombos] = useState([]);
  const [tables, setTables] = useState([]);
  const [activeCat, setActiveCat] = useState(null);
  const [type, setType] = useState('dine-in');
  const [tableId, setTableId] = useState('');
  const [customerName, setCustomerName] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [cart, setCart] = useState([]);
  const [busy, setBusy] = useState(false);
  const [lastBill, setLastBill] = useState(null);
  const [picker, setPicker] = useState(null); // { item, detail }

  async function loadAll() {
    const [c, m, t, cb] = await Promise.all([api.categories(), api.menu(), api.tables(), api.combos().catch(() => [])]);
    setCats(c); setMenu(m); setTables(t); setCombos(cb.filter(x => x.available));
    if (!activeCat && c.length) setActiveCat(c[0].id);
  }
  useEffect(() => { loadAll(); }, []);

  const filtered = useMemo(() => {
    if (activeCat === 'combos') return [];
    return menu.filter(m => !activeCat || m.category_id === activeCat);
  }, [menu, activeCat]);

  async function clickItem(item) {
    // Fetch detail to check for variants/modifiers
    try {
      const detail = await api.menuDetail(item.id);
      if ((detail.variants || []).length > 0 || (detail.modifier_groups || []).length > 0) {
        setPicker({ item, detail });
      } else {
        addToCart({ menu_item_id: item.id, name: item.name, price: Number(item.price), tax_pct: Number(item.tax_pct), qty: 1 });
      }
    } catch (e) {
      addToCart({ menu_item_id: item.id, name: item.name, price: Number(item.price), tax_pct: Number(item.tax_pct), qty: 1 });
    }
  }

  function addComboToCart(c) {
    addToCart({ combo_id: c.id, name: 'Combo: ' + c.name, price: Number(c.price), tax_pct: Number(c.tax_pct), qty: 1 });
  }

  function addToCart(line) {
    setCart(prev => {
      // Match by signature (id + variant + modifiers)
      const sig = JSON.stringify({ m: line.menu_item_id, c: line.combo_id, v: line.variant_id, mods: line.modifiers });
      const ex = prev.find(p => p._sig === sig);
      if (ex) return prev.map(p => p._sig === sig ? { ...p, qty: p.qty + (line.qty || 1) } : p);
      return [...prev, { ...line, _sig: sig, qty: line.qty || 1 }];
    });
  }

  function changeQty(sig, delta) {
    setCart(prev => prev.map(p => p._sig === sig ? { ...p, qty: p.qty + delta } : p).filter(p => p.qty > 0));
  }
  function removeLine(sig) { setCart(prev => prev.filter(p => p._sig !== sig)); }

  const subtotal = cart.reduce((s, c) => s + c.price * c.qty, 0);
  const tax = cart.reduce((s, c) => s + c.price * c.qty * c.tax_pct / 100, 0);
  const total = subtotal + tax;

  async function sendKot() {
    if (cart.length === 0) return;
    setBusy(true);
    try {
      const order = await api.createOrder({ type, table_id: type === 'dine-in' && tableId ? Number(tableId) : null, customer_name: customerName, customer_phone: customerPhone });
      await api.addItems(order.id, cart.map(c => ({ menu_item_id: c.menu_item_id, combo_id: c.combo_id, variant_id: c.variant_id, modifiers: c.modifiers, qty: c.qty })));
      const kot = await api.sendKot(order.id);
      alert(`KOT ${kot.kot_no} sent to kitchen for order ${order.order_no}`);
      setCart([]); onAction?.(); loadAll();
    } catch (e) { alert('Error: ' + e.message); } finally { setBusy(false); }
  }

  const [showSettle, setShowSettle] = useState(false);
  const [heldOrders, setHeldOrders] = useState([]);

  async function loadHeld() {
    try { setHeldOrders(await api.heldOrders()); } catch(e) {}
  }
  useEffect(() => { loadHeld(); }, []);

  function openSettle() {
    if (cart.length === 0) return;
    setShowSettle(true);
  }

  async function doSettle({ payment_method, discount }) {
    setShowSettle(false); setBusy(true);
    try {
      const order = await api.createOrder({ type, table_id: type === 'dine-in' && tableId ? Number(tableId) : null, customer_name: customerName, customer_phone: customerPhone });
      await api.addItems(order.id, cart.map(c => ({ menu_item_id: c.menu_item_id, combo_id: c.combo_id, variant_id: c.variant_id, modifiers: c.modifiers, qty: c.qty })));
      await api.sendKot(order.id).catch(() => {});
      await api.settle(order.id, { payment_method, discount });
      const full = await api.order(order.id);
      setLastBill(full);
      setCart([]); setCustomerName(''); setCustomerPhone(''); setTableId('');
      onAction?.(); loadAll(); loadHeld();
    } catch (e) { alert('Error: ' + e.message); } finally { setBusy(false); }
  }

  async function holdCurrent() {
    if (cart.length === 0) return;
    setBusy(true);
    try {
      const order = await api.createOrder({ type, table_id: type === 'dine-in' && tableId ? Number(tableId) : null, customer_name: customerName, customer_phone: customerPhone });
      await api.addItems(order.id, cart.map(c => ({ menu_item_id: c.menu_item_id, combo_id: c.combo_id, variant_id: c.variant_id, modifiers: c.modifiers, qty: c.qty })));
      await api.holdOrder(order.id);
      alert('Order held: ' + order.order_no);
      setCart([]); setCustomerName(''); setCustomerPhone(''); setTableId('');
      loadHeld();
    } catch (e) { alert('Error: ' + e.message); } finally { setBusy(false); }
  }

  async function resumeHeld(o) {
    if (cart.length > 0 && !confirm('Replace current cart with held order?')) return;
    const full = await api.order(o.id);
    setType(full.type); setTableId(full.table_id || ''); setCustomerName(full.customer_name || ''); setCustomerPhone(full.customer_phone || '');
    setCart(full.items.map(it => ({
      menu_item_id: it.menu_item_id, name: it.name, price: Number(it.price), tax_pct: Number(it.tax_pct),
      qty: it.qty, _sig: 'held-' + it.id
    })));
    await api.resumeOrder(o.id);
    loadHeld();
  }

  if (lastBill) {
    return (
      <div className="page">
        <div className="no-print" style={{ marginBottom: 12 }}>
          <button className="btn btn-primary" onClick={() => window.print()}>Print Bill</button>{' '}
          <button className="btn btn-secondary" onClick={() => setLastBill(null)}>New Order</button>
        </div>
        <Bill order={lastBill} />
      </div>
    );
  }

  return (
    <div className="pos-screen">
      <div className="menu-panel">
        {heldOrders.length > 0 && (
          <div style={{ background: '#fef3c7', border: '1px solid #f59e0b', borderRadius: 6, padding: 8, marginBottom: 12 }}>
            <b style={{ fontSize: 12 }}>📌 HELD ORDERS:</b>{' '}
            {heldOrders.map(o => (
              <button key={o.id} className="cat-chip" style={{ marginLeft: 6 }} onClick={() => resumeHeld(o)} title={"Resume " + o.order_no}>
                {o.order_no} {o.table_name && '· ' + o.table_name} {o.customer_name && '· ' + o.customer_name} (₹{Number(o.total).toFixed(0)})
              </button>
            ))}
          </div>
        )}
        <div className="cat-bar">
          {cats.map(c => (
            <button key={c.id} className={'cat-chip' + (activeCat === c.id ? ' active' : '')} onClick={() => setActiveCat(c.id)}>{c.name}</button>
          ))}
          {combos.length > 0 && (
            <button className={'cat-chip' + (activeCat === 'combos' ? ' active' : '')} onClick={() => setActiveCat('combos')} style={{ background: activeCat === 'combos' ? 'var(--success)' : '#dcfce7', color: activeCat === 'combos' ? 'white' : '#166534', borderColor: 'var(--success)' }}>🎁 Combos</button>
          )}
        </div>
        <div className="menu-grid">
          {activeCat === 'combos' ? (
            combos.map(c => (
              <button key={c.id} className="menu-card" onClick={() => addComboToCart(c)} style={{ borderColor: 'var(--success)' }}>
                <div className="name">🎁 {c.name}</div>
                <div className="price">₹{Number(c.price).toFixed(0)}</div>
                {c.description && <div className="muted-sm" style={{ fontSize: 11 }}>{c.description.slice(0, 50)}</div>}
              </button>
            ))
          ) : (
            filtered.map(m => (
              <button key={m.id} className="menu-card" onClick={() => clickItem(m)}>
                <div className="name">{m.name}</div>
                <div className="price">₹{Number(m.price).toFixed(0)}</div>
              </button>
            ))
          )}
          {(activeCat === 'combos' ? combos : filtered).length === 0 && <div className="empty">No items</div>}
        </div>
      </div>

      <div className="cart-panel">
        <div className="cart-head">
          <div className="order-type">
            <button className={type === 'dine-in' ? 'active' : ''} onClick={() => setType('dine-in')}>Dine-In</button>
            <button className={type === 'takeaway' ? 'active' : ''} onClick={() => setType('takeaway')}>Takeaway</button>
          </div>
        </div>

        <div className="cart-meta">
          {type === 'dine-in' && (
            <select value={tableId} onChange={e => setTableId(e.target.value)}>
              <option value="">Select Table…</option>
              {tables.map(t => <option key={t.id} value={t.id} disabled={t.status === 'occupied'}>{t.name}{t.status === 'occupied' ? ' (occupied)' : ''}</option>)}
            </select>
          )}
          <input placeholder="Customer name (optional)" value={customerName} onChange={e => setCustomerName(e.target.value)} />
          <input placeholder="Phone (optional)" value={customerPhone} onChange={e => setCustomerPhone(e.target.value)} />
        </div>

        <div className="cart-items">
          {cart.length === 0 && <div className="empty">Cart is empty<br /><small>Click items to add</small></div>}
          {cart.map(c => (
            <div key={c._sig} className="cart-row">
              <div>
                <div className="name">{c.name}</div>
                <div className="price">₹{c.price.toFixed(0)} × {c.qty}</div>
              </div>
              <div className="qty-ctrl">
                <button onClick={() => changeQty(c._sig, -1)}>−</button>
                <span style={{ minWidth: 20, textAlign: 'center' }}>{c.qty}</span>
                <button onClick={() => changeQty(c._sig, 1)}>+</button>
              </div>
              <div className="line-total">
                ₹{(c.price * c.qty).toFixed(0)}
                <button className="remove-btn" onClick={() => removeLine(c._sig)} title="Remove">×</button>
              </div>
            </div>
          ))}
        </div>

        <div className="cart-foot">
          <div className="totals">
            <div className="row"><span>Subtotal</span><span>₹{subtotal.toFixed(2)}</span></div>
            <div className="row"><span>Tax</span><span>₹{tax.toFixed(2)}</span></div>
            <div className="row grand"><span>Total</span><span>₹{total.toFixed(2)}</span></div>
          </div>
          <div className="btn-row">
            <button className="btn btn-secondary" onClick={sendKot} disabled={busy || cart.length === 0}>Send KOT</button>
            <button className="btn btn-success" onClick={openSettle} disabled={busy || cart.length === 0}>Settle & Print</button>
          </div>
          <div style={{ marginTop: 6 }}>
            <button className="btn btn-secondary btn-block" style={{ width: '100%' }} onClick={holdCurrent} disabled={busy || cart.length === 0}>Hold Order</button>
          </div>
        </div>
      </div>

      {picker && <ModifierPicker {...picker} onClose={() => setPicker(null)} onAdd={(line) => { addToCart(line); setPicker(null); }} />}
      {showSettle && <SettleDialog subtotal={subtotal} tax={tax} onClose={() => setShowSettle(false)} onSettle={doSettle} />}
    </div>
  );
}

function SettleDialog({ subtotal, tax, onClose, onSettle }) {
  const [discount, setDiscount] = useState(0);
  const [discountType, setDiscountType] = useState('amt'); // 'amt' or 'pct'
  const [payment, setPayment] = useState('cash');
  const [split, setSplit] = useState({ cash: 0, card: 0, upi: 0 });
  const [useSplit, setUseSplit] = useState(false);

  const discAmt = discountType === 'pct' ? (subtotal * Number(discount) / 100) : Number(discount);
  const total = Math.max(0, subtotal + tax - discAmt);
  const splitTotal = Number(split.cash || 0) + Number(split.card || 0) + Number(split.upi || 0);
  const splitOk = useSplit ? Math.abs(splitTotal - total) < 0.01 : true;

  function submit() {
    if (useSplit && !splitOk) return alert('Split amounts must equal total');
    const method = useSplit ? `split: cash ₹${split.cash}, card ₹${split.card}, upi ₹${split.upi}` : payment;
    onSettle({ payment_method: method, discount: discAmt });
  }

  return (
    <div className="modal-bg" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal" style={{ maxWidth: 460 }}>
        <h3>Settle Order</h3>

        <div className="totals" style={{ background: '#f8fafc', padding: 12, borderRadius: 6, marginBottom: 12 }}>
          <div className="row"><span>Subtotal</span><span>₹{subtotal.toFixed(2)}</span></div>
          <div className="row"><span>Tax</span><span>₹{tax.toFixed(2)}</span></div>
          {discAmt > 0 && <div className="row"><span>Discount</span><span style={{ color: 'var(--danger)' }}>−₹{discAmt.toFixed(2)}</span></div>}
          <div className="row grand"><span>Total</span><span>₹{total.toFixed(2)}</span></div>
        </div>

        <h4>Discount</h4>
        <div className="row-flex">
          <select value={discountType} onChange={e => setDiscountType(e.target.value)} style={{ width: 100 }}>
            <option value="amt">₹ Amount</option>
            <option value="pct">% Percent</option>
          </select>
          <input type="number" value={discount} onChange={e => setDiscount(e.target.value)} placeholder="0" />
        </div>

        <h4 style={{ marginTop: 14 }}>Payment Method</h4>
        <div className="row2">
          <button className={'cat-chip' + (!useSplit && payment === 'cash' ? ' active' : '')} onClick={() => { setUseSplit(false); setPayment('cash'); }}>💵 Cash</button>
          <button className={'cat-chip' + (!useSplit && payment === 'card' ? ' active' : '')} onClick={() => { setUseSplit(false); setPayment('card'); }}>💳 Card</button>
          <button className={'cat-chip' + (!useSplit && payment === 'upi' ? ' active' : '')} onClick={() => { setUseSplit(false); setPayment('upi'); }}>📱 UPI</button>
          <button className={'cat-chip' + (useSplit ? ' active' : '')} onClick={() => setUseSplit(true)}>🪙 Split</button>
        </div>

        {useSplit && (
          <div style={{ marginTop: 12 }}>
            <div className="row2">
              <div><label className="muted-sm">Cash (₹)</label><input type="number" value={split.cash} onChange={e => setSplit({ ...split, cash: e.target.value })} /></div>
              <div><label className="muted-sm">Card (₹)</label><input type="number" value={split.card} onChange={e => setSplit({ ...split, card: e.target.value })} /></div>
            </div>
            <div><label className="muted-sm">UPI (₹)</label><input type="number" value={split.upi} onChange={e => setSplit({ ...split, upi: e.target.value })} /></div>
            <div className="muted-sm" style={{ marginTop: 6 }}>
              Split sum: <b>₹{splitTotal.toFixed(2)}</b> / Total: <b>₹{total.toFixed(2)}</b>
              {!splitOk && <span style={{ color: 'var(--danger)' }}> — must match</span>}
            </div>
          </div>
        )}

        <div className="modal-foot">
          <button className="btn btn-secondary" onClick={onClose}>Cancel</button>
          <button className="btn btn-success" onClick={submit} disabled={!splitOk}>Confirm & Print Bill</button>
        </div>
      </div>
    </div>
  );
}

function ModifierPicker({ item, detail, onClose, onAdd }) {
  const variants = detail.variants || [];
  const groups = detail.modifier_groups || [];
  const [variantId, setVariantId] = useState(variants.find(v => v.is_default)?.id || variants[0]?.id || null);
  const [selected, setSelected] = useState({}); // { groupId: [modifierId, ...] }
  const [notes, setNotes] = useState('');
  const [qty, setQty] = useState(1);

  const variant = variants.find(v => v.id === variantId);
  let total = variant ? Number(variant.price) : Number(item.price);
  const modList = [];
  for (const g of groups) {
    const sel = selected[g.id] || [];
    for (const modId of sel) {
      const m = (g.modifiers || []).find(x => x.id === modId);
      if (m) { total += Number(m.price); modList.push({ id: m.id, name: m.name, price: Number(m.price) }); }
    }
  }

  function toggleMod(g, modId) {
    setSelected(prev => {
      const cur = prev[g.id] || [];
      if (g.selection_type === 'single') {
        return { ...prev, [g.id]: cur.includes(modId) ? [] : [modId] };
      }
      return { ...prev, [g.id]: cur.includes(modId) ? cur.filter(x => x !== modId) : [...cur, modId] };
    });
  }

  function add() {
    // Validate required
    for (const g of groups) {
      const sel = selected[g.id] || [];
      if (g.is_required && sel.length < (g.min_select || 1)) {
        return alert(`Please choose for "${g.name}"`);
      }
    }
    let displayName = item.name;
    if (variant) displayName += ' (' + variant.name + ')';
    if (modList.length) displayName += ' [' + modList.map(m => m.name).join(', ') + ']';
    onAdd({
      menu_item_id: item.id,
      name: displayName,
      price: total,
      tax_pct: Number(item.tax_pct),
      qty,
      variant_id: variantId || null,
      modifiers: modList,
      notes
    });
  }

  return (
    <div className="modal-bg" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal" style={{ maxWidth: 520 }}>
        <h3>{item.name}</h3>

        {variants.length > 0 && (
          <>
            <h4 style={{ marginTop: 12 }}>Choose size *</h4>
            {variants.map(v => (
              <label key={v.id} className="row-flex" style={{ padding: 6 }}>
                <input type="radio" checked={variantId === v.id} onChange={() => setVariantId(v.id)} />
                <span style={{ flex: 1 }}><b>{v.name}</b></span>
                <span>₹{Number(v.price).toFixed(0)}</span>
              </label>
            ))}
          </>
        )}

        {groups.map(g => (
          <div key={g.id} style={{ marginTop: 16 }}>
            <h4>{g.name} {g.is_required && <span className="badge badge-open">Required</span>}</h4>
            {(g.modifiers || []).map(m => (
              <label key={m.id} className="row-flex" style={{ padding: 6 }}>
                <input type={g.selection_type === 'single' ? 'radio' : 'checkbox'} checked={(selected[g.id] || []).includes(m.id)} onChange={() => toggleMod(g, m.id)} />
                <span style={{ flex: 1 }}>{m.name}</span>
                {Number(m.price) > 0 && <span>+ ₹{Number(m.price).toFixed(0)}</span>}
              </label>
            ))}
          </div>
        ))}

        <h4 style={{ marginTop: 16 }}>Notes (optional)</h4>
        <input value={notes} onChange={e => setNotes(e.target.value)} placeholder="e.g. less spicy, no onion" />

        <div className="row2" style={{ marginTop: 12 }}>
          <div>
            <label>Quantity</label>
            <div className="qty-ctrl">
              <button onClick={() => setQty(Math.max(1, qty - 1))}>−</button>
              <span style={{ minWidth: 40, textAlign: 'center', fontSize: 18 }}>{qty}</span>
              <button onClick={() => setQty(qty + 1)}>+</button>
            </div>
          </div>
          <div style={{ textAlign: 'right' }}>
            <div className="muted-sm">Item total</div>
            <div style={{ fontSize: 22, fontWeight: 700, color: 'var(--primary-dark)' }}>₹{(total * qty).toFixed(0)}</div>
          </div>
        </div>

        <div className="modal-foot">
          <button className="btn btn-secondary" onClick={onClose}>Cancel</button>
          <button className="btn btn-success" onClick={add}>Add to Cart</button>
        </div>
      </div>
    </div>
  );
}
