require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { db, initSchema, seedData, seedDefaultUser, usePostgres } = require('./db');
const JWT_SECRET = process.env.JWT_SECRET || 'restaurant-pos-default-secret-change-me';

const app = express();
app.use(cors());
app.use(express.json({ limit: '2mb' }));

// ============= TIMEZONE HELPERS (IST / Asia-Kolkata, UTC+5:30) =============
// Timestamps are stored in UTC (CURRENT_TIMESTAMP). The restaurant operates in
// IST, so "today" and per-day grouping must be computed in IST, not UTC —
// otherwise orders placed after ~6:30pm UTC (midnight IST) fall onto the wrong day.
const IST_OFFSET_MIN = 330;
function istToday() {
  return new Date(Date.now() + IST_OFFSET_MIN * 60000).toISOString().slice(0, 10);
}
// Returns a SQL expression that yields the IST calendar date (YYYY-MM-DD) for a column.
function istDate(col) {
  return usePostgres
    ? `TO_CHAR(${col} + INTERVAL '${IST_OFFSET_MIN} minutes', 'YYYY-MM-DD')`
    : `date(${col}, '+${IST_OFFSET_MIN} minutes')`;
}

// ============= HEALTH / STATS =============
app.get('/api/health', (req, res) => {
  res.json({ ok: true, db: usePostgres ? 'postgres' : 'sqlite', time: new Date().toISOString() });
});

app.get('/api/stats', async (req, res) => {
  const today = istToday();
  const orders = await db.query(
    `SELECT COUNT(*) AS c, COALESCE(SUM(total),0) AS rev FROM orders WHERE status='paid' AND ${istDate('closed_at')} = ?`,
    [today]
  );
  const open = await db.query("SELECT COUNT(*) AS c FROM orders WHERE status='open'");
  const cust = await db.query("SELECT COUNT(*) AS c FROM customers");
  const inv = await db.query("SELECT COUNT(*) AS c FROM inventory_items WHERE current_stock <= low_stock_threshold");
  res.json({
    today_orders: Number(orders[0]?.c || 0),
    today_revenue: Number(orders[0]?.rev || 0),
    open_orders: Number(open[0]?.c || 0),
    total_customers: Number(cust[0]?.c || 0),
    low_stock_items: Number(inv[0]?.c || 0)
  });
});

app.get('/api/dashboard', async (req, res) => {
  const today = istToday();
  const dateFn = istDate('closed_at');
  // Last 7 days revenue (grouped by IST day)
  const last7 = await db.query(`
    SELECT ${dateFn} as day, COALESCE(SUM(total),0) as revenue, COUNT(*) as orders
    FROM orders WHERE status='paid' AND closed_at IS NOT NULL
    GROUP BY ${dateFn}
    ORDER BY ${dateFn} DESC LIMIT 7
  `);
  // Top items today
  const dateFnCreated = istDate('o.created_at');
  const topItems = await db.query(`
    SELECT oi.name, SUM(oi.qty) as qty, SUM(oi.qty * oi.price) as revenue
    FROM order_items oi JOIN orders o ON o.id = oi.order_id
    WHERE ${dateFnCreated} = ?
    GROUP BY oi.name ORDER BY qty DESC LIMIT 5
  `, [today]);
  res.json({ revenue_chart: last7.reverse(), top_items: topItems });
});

// ============= AUTH =============
app.post('/api/auth/login', async (req, res) => {
  try {
    const { username, password } = req.body;
    if (!username || !password) return res.status(400).json({ ok: false, error: 'username & password required' });
    const u = (await db.query('SELECT * FROM users WHERE username=? AND is_active=1', [username.toLowerCase().trim()]))[0];
    if (!u) return res.status(401).json({ ok: false, error: 'Invalid credentials' });
    const ok = await bcrypt.compare(password, u.password_hash);
    if (!ok) return res.status(401).json({ ok: false, error: 'Invalid credentials' });
    const token = jwt.sign({ id: u.id, username: u.username, role: u.role, name: u.full_name }, JWT_SECRET, { expiresIn: '30d' });
    res.json({ ok: true, token, user: { id: u.id, username: u.username, full_name: u.full_name, role: u.role } });
  } catch (e) { res.status(500).json({ ok: false, error: e.message }); }
});

app.get('/api/auth/me', async (req, res) => {
  const auth = req.headers.authorization || '';
  const token = auth.replace('Bearer ', '');
  if (!token) return res.status(401).json({ ok: false });
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    res.json({ ok: true, user: decoded });
  } catch (e) { res.status(401).json({ ok: false, error: 'Invalid token' }); }
});

// Users CRUD (owner-only in client; backend permissive for now)
app.get('/api/users', async (req, res) => {
  res.json(await db.query('SELECT id, username, full_name, role, is_active, created_at FROM users ORDER BY id'));
});
app.post('/api/users', async (req, res) => {
  const { username, password, full_name = '', role = 'cashier' } = req.body;
  if (!username || !password) return res.status(400).json({ ok: false, error: 'username + password required' });
  const hash = await bcrypt.hash(password, 10);
  try {
    const r = await db.run('INSERT INTO users (username, password_hash, full_name, role, is_active) VALUES (?,?,?,?,1)',
      [username.toLowerCase().trim(), hash, full_name, role]);
    res.json({ id: r.lastID, ok: true });
  } catch (e) { res.status(400).json({ ok: false, error: 'Username likely exists' }); }
});
app.put('/api/users/:id', async (req, res) => {
  const { full_name, role, is_active, password } = req.body;
  if (password) {
    const hash = await bcrypt.hash(password, 10);
    await db.run('UPDATE users SET full_name=?, role=?, is_active=?, password_hash=? WHERE id=?',
      [full_name || '', role, is_active ? 1 : 0, hash, req.params.id]);
  } else {
    await db.run('UPDATE users SET full_name=?, role=?, is_active=? WHERE id=?',
      [full_name || '', role, is_active ? 1 : 0, req.params.id]);
  }
  res.json({ ok: true });
});
app.delete('/api/users/:id', async (req, res) => {
  await db.run('UPDATE users SET is_active=0 WHERE id=?', [req.params.id]);
  res.json({ ok: true });
});

// ============= CATEGORIES =============
app.get('/api/categories', async (req, res) => {
  res.json(await db.query('SELECT * FROM categories ORDER BY sort_order, name'));
});
app.post('/api/categories', async (req, res) => {
  const { name, sort_order = 0 } = req.body;
  const r = await db.run('INSERT INTO categories (name, sort_order) VALUES (?, ?)', [name, sort_order]);
  res.json({ id: r.lastID, ok: true });
});
app.put('/api/categories/:id', async (req, res) => {
  const { name, sort_order = 0 } = req.body;
  await db.run('UPDATE categories SET name=?, sort_order=? WHERE id=?', [name, sort_order, req.params.id]);
  res.json({ ok: true });
});
app.delete('/api/categories/:id', async (req, res) => {
  await db.run('DELETE FROM categories WHERE id=?', [req.params.id]);
  res.json({ ok: true });
});

// ============= MENU / PRODUCTS =============
app.get('/api/menu', async (req, res) => {
  const rows = await db.query(`
    SELECT m.*, c.name AS category_name FROM menu_items m
    LEFT JOIN categories c ON c.id = m.category_id
    WHERE m.available = 1 ORDER BY c.sort_order, m.name
  `);
  res.json(rows);
});
app.get('/api/menu/all', async (req, res) => {
  res.json(await db.query(`
    SELECT m.*, c.name AS category_name FROM menu_items m
    LEFT JOIN categories c ON c.id = m.category_id
    ORDER BY c.sort_order, m.name
  `));
});
app.post('/api/menu', async (req, res) => {
  const { name, category_id, price, tax_pct = 5, description = '', image_url = '' } = req.body;
  const r = await db.run(
    'INSERT INTO menu_items (name, category_id, price, tax_pct, available, description, image_url) VALUES (?,?,?,?,1,?,?)',
    [name, category_id, price, tax_pct, description, image_url]
  );
  res.json({ id: r.lastID, ok: true });
});
app.put('/api/menu/:id', async (req, res) => {
  const { name, category_id, price, tax_pct, available, description, image_url } = req.body;
  await db.run(
    'UPDATE menu_items SET name=?, category_id=?, price=?, tax_pct=?, available=?, description=?, image_url=? WHERE id=?',
    [name, category_id, price, tax_pct, available ? 1 : 0, description || '', image_url || '', req.params.id]
  );
  res.json({ ok: true });
});
app.delete('/api/menu/:id', async (req, res) => {
  await db.run('UPDATE menu_items SET available=0 WHERE id=?', [req.params.id]);
  res.json({ ok: true });
});

// ============= TABLES =============
app.get('/api/tables', async (req, res) => {
  res.json(await db.query(`
    SELECT t.*, (SELECT id FROM orders WHERE table_id = t.id AND status='open' LIMIT 1) AS current_order_id
    FROM tables t ORDER BY t.name
  `));
});
app.post('/api/tables', async (req, res) => {
  const { name, capacity = 4 } = req.body;
  const r = await db.run('INSERT INTO tables (name, capacity, status) VALUES (?,?,?)', [name, capacity, 'free']);
  res.json({ id: r.lastID, ok: true });
});
app.put('/api/tables/:id', async (req, res) => {
  const { name, capacity, status } = req.body;
  await db.run('UPDATE tables SET name=?, capacity=?, status=? WHERE id=?', [name, capacity, status, req.params.id]);
  res.json({ ok: true });
});
app.delete('/api/tables/:id', async (req, res) => {
  await db.run('DELETE FROM tables WHERE id=?', [req.params.id]);
  res.json({ ok: true });
});

// ============= CUSTOMERS =============
app.get('/api/customers', async (req, res) => {
  res.json(await db.query('SELECT * FROM customers ORDER BY last_visit_at DESC NULLS LAST, id DESC LIMIT 500').catch(async () => {
    // SQLite doesn't support NULLS LAST
    return db.query('SELECT * FROM customers ORDER BY last_visit_at DESC, id DESC LIMIT 500');
  }));
});
app.get('/api/customers/:id', async (req, res) => {
  const c = (await db.query('SELECT * FROM customers WHERE id = ?', [req.params.id]))[0];
  if (!c) return res.status(404).json({ error: 'not found' });
  c.orders = await db.query('SELECT * FROM orders WHERE customer_id = ? ORDER BY created_at DESC LIMIT 50', [c.id]);
  res.json(c);
});
app.post('/api/customers', async (req, res) => {
  const { name, phone, email = '', address = '', notes = '' } = req.body;
  const r = await db.run(
    'INSERT INTO customers (name, phone, email, address, notes) VALUES (?,?,?,?,?)',
    [name, phone, email, address, notes]
  );
  res.json({ id: r.lastID, ok: true });
});
app.put('/api/customers/:id', async (req, res) => {
  const { name, phone, email, address, notes, loyalty_points } = req.body;
  await db.run(
    'UPDATE customers SET name=?, phone=?, email=?, address=?, notes=?, loyalty_points=? WHERE id=?',
    [name, phone, email || '', address || '', notes || '', loyalty_points || 0, req.params.id]
  );
  res.json({ ok: true });
});
app.delete('/api/customers/:id', async (req, res) => {
  await db.run('DELETE FROM customers WHERE id=?', [req.params.id]);
  res.json({ ok: true });
});

// Helper: get-or-create customer by phone
async function ensureCustomer(name, phone) {
  if (!phone) return null;
  let c = (await db.query('SELECT id FROM customers WHERE phone = ?', [phone]))[0];
  if (c) return c.id;
  const r = await db.run('INSERT INTO customers (name, phone) VALUES (?, ?)', [name || 'Walk-in', phone]);
  return r.lastID || (await db.query('SELECT id FROM customers WHERE phone = ?', [phone]))[0]?.id;
}

// ============= ORDERS =============
app.post('/api/orders', async (req, res) => {
  const { type = 'dine-in', table_id = null, customer_name = '', customer_phone = '' } = req.body;
  const orderNo = 'O' + Date.now().toString().slice(-7);
  const customer_id = await ensureCustomer(customer_name, customer_phone);
  const r = await db.run(
    `INSERT INTO orders (order_no, type, table_id, customer_id, customer_name, customer_phone, status)
     VALUES (?,?,?,?,?,?,'open')`,
    [orderNo, type, table_id, customer_id, customer_name, customer_phone]
  );
  let id = r.lastID;
  if (!id) {
    const row = await db.query('SELECT id FROM orders WHERE order_no = ?', [orderNo]);
    id = row[0]?.id;
  }
  if (table_id) await db.run("UPDATE tables SET status='occupied' WHERE id=?", [table_id]);
  // Track event
  await db.run("INSERT INTO order_tracking (order_id, status, note) VALUES (?,?,?)", [id, 'placed', 'Order created']);
  res.json({ id, order_no: orderNo });
});

app.get('/api/orders', async (req, res) => {
  const { status, from, to } = req.query;
  let sql = `SELECT o.*, t.name AS table_name FROM orders o LEFT JOIN tables t ON t.id = o.table_id WHERE 1=1`;
  const params = [];
  if (status) { sql += ' AND o.status = ?'; params.push(status); }
  if (from) { sql += ` AND ${usePostgres ? "TO_CHAR(o.created_at,'YYYY-MM-DD')" : "date(o.created_at)"} >= ?`; params.push(from); }
  if (to) { sql += ` AND ${usePostgres ? "TO_CHAR(o.created_at,'YYYY-MM-DD')" : "date(o.created_at)"} <= ?`; params.push(to); }
  sql += ' ORDER BY o.created_at DESC LIMIT 500';
  res.json(await db.query(sql, params));
});

app.get('/api/orders/:id', async (req, res) => {
  const order = (await db.query(
    `SELECT o.*, t.name AS table_name FROM orders o LEFT JOIN tables t ON t.id = o.table_id WHERE o.id = ?`,
    [req.params.id]
  ))[0];
  if (!order) return res.status(404).json({ error: 'not found' });
  order.items = await db.query('SELECT * FROM order_items WHERE order_id = ? ORDER BY id', [req.params.id]);
  order.tracking = await db.query('SELECT * FROM order_tracking WHERE order_id = ? ORDER BY id', [req.params.id]);
  res.json(order);
});

app.post('/api/orders/:id/items', async (req, res) => {
  const { items } = req.body;
  const orderId = req.params.id;
  for (const it of items) {
    // Combo path
    if (it.combo_id) {
      const combo = (await db.query('SELECT * FROM combos WHERE id=?', [it.combo_id]))[0];
      if (!combo) continue;
      await db.run(
        `INSERT INTO order_items (order_id, menu_item_id, name, qty, price, tax_pct, notes, status, combo_id)
         VALUES (?,?,?,?,?,?,?, 'pending', ?)`,
        [orderId, 0, 'Combo: ' + combo.name, it.qty || 1, combo.price, combo.tax_pct || 5, it.notes || '', combo.id]
      );
      continue;
    }
    // Regular menu item path (with optional variant + modifiers)
    const menu = (await db.query('SELECT * FROM menu_items WHERE id = ?', [it.menu_item_id]))[0];
    if (!menu) continue;
    let price = Number(menu.price);
    let displayName = menu.name;
    let variantId = null, variantName = null;
    if (it.variant_id) {
      const v = (await db.query('SELECT * FROM menu_variants WHERE id=?', [it.variant_id]))[0];
      if (v) { price = Number(v.price); displayName = menu.name + ' (' + v.name + ')'; variantId = v.id; variantName = v.name; }
    }
    let modifiersJson = null;
    if (Array.isArray(it.modifiers) && it.modifiers.length) {
      const mods = [];
      for (const m of it.modifiers) {
        const mod = (await db.query('SELECT * FROM modifiers WHERE id=?', [m.id]))[0];
        if (mod) { price += Number(mod.price); mods.push({ id: mod.id, name: mod.name, price: Number(mod.price) }); }
      }
      modifiersJson = JSON.stringify(mods);
      if (mods.length) displayName += ' [' + mods.map(m => m.name).join(', ') + ']';
    }
    await db.run(
      `INSERT INTO order_items (order_id, menu_item_id, name, qty, price, tax_pct, notes, status, variant_id, variant_name, modifiers_json)
       VALUES (?,?,?,?,?,?,?, 'pending', ?, ?, ?)`,
      [orderId, menu.id, displayName, it.qty || 1, price, menu.tax_pct || 5, it.notes || '', variantId, variantName, modifiersJson]
    );
  }
  await recalcOrder(orderId);
  res.json({ ok: true });
});

app.delete('/api/orders/:id/items/:itemId', async (req, res) => {
  await db.run('DELETE FROM order_items WHERE id = ? AND order_id = ?', [req.params.itemId, req.params.id]);
  await recalcOrder(req.params.id);
  res.json({ ok: true });
});

async function recalcOrder(orderId) {
  const items = await db.query('SELECT * FROM order_items WHERE order_id = ?', [orderId]);
  let subtotal = 0, tax = 0;
  for (const it of items) {
    const line = Number(it.price) * Number(it.qty);
    subtotal += line;
    tax += line * Number(it.tax_pct) / 100;
  }
  const total = subtotal + tax;
  await db.run('UPDATE orders SET subtotal=?, tax=?, total=? WHERE id=?', [
    subtotal.toFixed(2), tax.toFixed(2), total.toFixed(2), orderId
  ]);
}

// ============= KOT =============
app.post('/api/orders/:id/kot', async (req, res) => {
  const orderId = req.params.id;
  const pending = await db.query("SELECT * FROM order_items WHERE order_id = ? AND status = 'pending'", [orderId]);
  if (pending.length === 0) return res.json({ ok: false, message: 'No pending items' });

  const kotNo = 'K' + Date.now().toString().slice(-6);
  const r = await db.run("INSERT INTO kot_tickets (order_id, kot_no, status) VALUES (?,?,'pending')", [orderId, kotNo]);
  let kotId = r.lastID;
  if (!kotId) kotId = (await db.query('SELECT id FROM kot_tickets WHERE kot_no = ?', [kotNo]))[0]?.id;
  for (const it of pending) {
    await db.run(
      'INSERT INTO kot_items (kot_id, order_item_id, name, qty, notes) VALUES (?,?,?,?,?)',
      [kotId, it.id, it.name, it.qty, it.notes || '']
    );
    await db.run("UPDATE order_items SET status='sent' WHERE id=?", [it.id]);
  }
  await db.run("INSERT INTO order_tracking (order_id, status, note) VALUES (?,?,?)", [orderId, 'in_kitchen', `KOT ${kotNo} sent to kitchen`]);
  res.json({ ok: true, kot_id: kotId, kot_no: kotNo, items: pending.length });
});

app.get('/api/kot', async (req, res) => {
  const rows = await db.query(`
    SELECT k.*, o.order_no, o.type, t.name AS table_name
    FROM kot_tickets k LEFT JOIN orders o ON o.id = k.order_id LEFT JOIN tables t ON t.id = o.table_id
    WHERE k.status != 'served' ORDER BY k.created_at DESC
  `);
  for (const k of rows) k.items = await db.query('SELECT * FROM kot_items WHERE kot_id = ?', [k.id]);
  res.json(rows);
});

app.put('/api/kot/:id/status', async (req, res) => {
  await db.run('UPDATE kot_tickets SET status=? WHERE id=?', [req.body.status, req.params.id]);
  if (req.body.status === 'served') {
    const t = (await db.query('SELECT order_id FROM kot_tickets WHERE id=?', [req.params.id]))[0];
    if (t) await db.run("INSERT INTO order_tracking (order_id, status, note) VALUES (?,?,?)", [t.order_id, 'served', 'Food served']);
  }
  res.json({ ok: true });
});

// ============= INVENTORY =============
app.get('/api/inventory', async (req, res) => {
  const rows = await db.query('SELECT * FROM inventory_items ORDER BY category, name');
  res.json(rows);
});
app.get('/api/inventory/low-stock', async (req, res) => {
  res.json(await db.query('SELECT * FROM inventory_items WHERE current_stock <= low_stock_threshold ORDER BY name'));
});
app.post('/api/inventory', async (req, res) => {
  const { name, sku = '', unit = 'unit', category = 'general',
          current_stock = 0, low_stock_threshold = 5, last_purchase_price = 0, supplier = '' } = req.body;
  const r = await db.run(
    'INSERT INTO inventory_items (name, sku, unit, category, current_stock, low_stock_threshold, last_purchase_price, supplier) VALUES (?,?,?,?,?,?,?,?)',
    [name, sku, unit, category, current_stock, low_stock_threshold, last_purchase_price, supplier]
  );
  if (Number(current_stock) > 0) {
    await db.run('INSERT INTO inventory_transactions (item_id, type, qty, unit_price, reason) VALUES (?,?,?,?,?)',
      [r.lastID, 'in', current_stock, last_purchase_price, 'Initial stock']);
  }
  res.json({ id: r.lastID, ok: true });
});
app.put('/api/inventory/:id', async (req, res) => {
  const { name, sku, unit, category, low_stock_threshold, last_purchase_price, supplier } = req.body;
  await db.run(
    'UPDATE inventory_items SET name=?, sku=?, unit=?, category=?, low_stock_threshold=?, last_purchase_price=?, supplier=? WHERE id=?',
    [name, sku || '', unit, category, low_stock_threshold, last_purchase_price, supplier || '', req.params.id]
  );
  res.json({ ok: true });
});
app.delete('/api/inventory/:id', async (req, res) => {
  await db.run('DELETE FROM inventory_items WHERE id=?', [req.params.id]);
  res.json({ ok: true });
});
app.post('/api/inventory/:id/transaction', async (req, res) => {
  const { type, qty, unit_price = 0, reason = '', reference_no = '' } = req.body;
  const item = (await db.query('SELECT * FROM inventory_items WHERE id=?', [req.params.id]))[0];
  if (!item) return res.status(404).json({ error: 'not found' });
  const delta = type === 'in' ? Number(qty) : -Number(qty);
  await db.run('UPDATE inventory_items SET current_stock = current_stock + ? WHERE id=?', [delta, req.params.id]);
  if (type === 'in' && unit_price > 0) {
    await db.run('UPDATE inventory_items SET last_purchase_price = ? WHERE id=?', [unit_price, req.params.id]);
  }
  await db.run('INSERT INTO inventory_transactions (item_id, type, qty, unit_price, reason, reference_no) VALUES (?,?,?,?,?,?)',
    [req.params.id, type, qty, unit_price, reason, reference_no]);
  res.json({ ok: true });
});
app.get('/api/inventory/:id/transactions', async (req, res) => {
  res.json(await db.query('SELECT * FROM inventory_transactions WHERE item_id=? ORDER BY id DESC LIMIT 200', [req.params.id]));
});

// ============= SHOPS =============
app.get('/api/shops', async (req, res) => {
  res.json(await db.query('SELECT * FROM shops ORDER BY id'));
});
app.post('/api/shops', async (req, res) => {
  const { name, address = '', phone = '', gst_no = '' } = req.body;
  const r = await db.run('INSERT INTO shops (name, address, phone, gst_no, is_active) VALUES (?,?,?,?,1)',
    [name, address, phone, gst_no]);
  res.json({ id: r.lastID, ok: true });
});
app.put('/api/shops/:id', async (req, res) => {
  const { name, address, phone, gst_no, is_active } = req.body;
  await db.run('UPDATE shops SET name=?, address=?, phone=?, gst_no=?, is_active=? WHERE id=?',
    [name, address || '', phone || '', gst_no || '', is_active ? 1 : 0, req.params.id]);
  res.json({ ok: true });
});
app.delete('/api/shops/:id', async (req, res) => {
  await db.run('DELETE FROM shops WHERE id=?', [req.params.id]);
  res.json({ ok: true });
});

// ============= ORDER TRACKING =============
app.get('/api/tracking', async (req, res) => {
  const today = istToday();
  const rows = await db.query(`
    SELECT o.id, o.order_no, o.type, o.status, o.total, o.subtotal, o.tax, o.discount, o.created_at,
           t.name AS table_name, o.customer_name, o.customer_phone,
           o.source, o.external_id, o.channel_state, o.channel_state_raw, o.source_meta
    FROM orders o LEFT JOIN tables t ON t.id = o.table_id
    WHERE ${istDate('o.created_at')} = ?
    ORDER BY o.created_at DESC LIMIT 100
  `, [today]);
  res.json(rows);
});
app.post('/api/orders/:id/track', async (req, res) => {
  const { status, note = '' } = req.body;
  await db.run('INSERT INTO order_tracking (order_id, status, note) VALUES (?,?,?)', [req.params.id, status, note]);
  res.json({ ok: true });
});

// ============= SETTLE / INVOICE =============
app.post('/api/orders/:id/settle', async (req, res) => {
  const { payment_method = 'cash', discount = 0 } = req.body;
  const order = (await db.query('SELECT * FROM orders WHERE id = ?', [req.params.id]))[0];
  if (!order) return res.status(404).json({ error: 'not found' });
  const items = await db.query('SELECT * FROM order_items WHERE order_id = ?', [req.params.id]);
  let subtotal = 0, tax = 0;
  for (const it of items) {
    const line = Number(it.price) * Number(it.qty);
    subtotal += line; tax += line * Number(it.tax_pct) / 100;
  }
  const total = subtotal + tax - Number(discount);
  const now = new Date().toISOString();
  await db.run(
    `UPDATE orders SET subtotal=?, tax=?, discount=?, total=?, payment_method=?, status='paid', closed_at=? WHERE id=?`,
    [subtotal.toFixed(2), tax.toFixed(2), discount, total.toFixed(2), payment_method, now, req.params.id]
  );
  if (order.table_id) await db.run("UPDATE tables SET status='free' WHERE id=?", [order.table_id]);
  // Update customer stats
  if (order.customer_id) {
    await db.run(
      'UPDATE customers SET total_orders = total_orders + 1, total_spend = total_spend + ?, last_visit_at = ? WHERE id = ?',
      [total.toFixed(2), now, order.customer_id]
    );
  }
  await db.run("INSERT INTO order_tracking (order_id, status, note) VALUES (?,?,?)",
    [req.params.id, 'paid', `Paid via ${payment_method}`]);

  // ---- Auto-deduct inventory based on recipes ----
  try {
    const orderItems = await db.query('SELECT * FROM order_items WHERE order_id=?', [req.params.id]);
    for (const oi of orderItems) {
      const recipe = await db.query('SELECT * FROM recipes WHERE menu_item_id=?', [oi.menu_item_id]);
      for (const r of recipe) {
        const deductQty = Number(r.qty) * Number(oi.qty);
        await db.run('UPDATE inventory_items SET current_stock = current_stock - ? WHERE id=?',
          [deductQty, r.inventory_item_id]);
        await db.run('INSERT INTO inventory_transactions (item_id, type, qty, reason, reference_no) VALUES (?,?,?,?,?)',
          [r.inventory_item_id, 'out', deductQty, 'Auto-deduct from sale: ' + oi.name, order.order_no]);
      }
    }
  } catch(e) { console.error('Auto-deduct error:', e.message); }

  res.json({ ok: true, invoice_no: order.order_no, total: total.toFixed(2) });
});

// ============= SETTINGS =============
app.get('/api/settings', async (req, res) => {
  const rows = await db.query('SELECT * FROM settings');
  const out = {};
  for (const r of rows) out[r.key] = r.value;
  res.json(out);
});
app.put('/api/settings', async (req, res) => {
  for (const [k, v] of Object.entries(req.body)) {
    // upsert
    const existing = await db.query('SELECT key FROM settings WHERE key = ?', [k]);
    if (existing.length) {
      await db.run('UPDATE settings SET value = ? WHERE key = ?', [String(v), k]);
    } else {
      await db.run('INSERT INTO settings (key, value) VALUES (?, ?)', [k, String(v)]);
    }
  }
  res.json({ ok: true });
});

// ============= APK DOWNLOAD =============
// Serve APK file if present in server/public/downloads/
app.get('/downloads/restaurant-pos.apk', (req, res) => {
  const apkPath = path.join(__dirname, 'public', 'downloads', 'restaurant-pos.apk');
  if (fs.existsSync(apkPath)) {
    res.download(apkPath, 'restaurant-pos.apk');
  } else {
    // Fall back to a placeholder page that explains how to generate the APK
    res.status(404).type('html').send(`
      <html><head><title>APK Not Yet Uploaded</title>
      <style>body{font-family:sans-serif;max-width:600px;margin:40px auto;padding:20px}
      a{color:#d97706}</style></head><body>
      <h2>📱 Restaurant POS APK</h2>
      <p>The APK file hasn't been uploaded to this server yet.</p>
      <p><strong>To generate the latest APK:</strong></p>
      <ol>
        <li>Visit <a href="https://www.pwabuilder.com/?siteUrl=${req.protocol}://${req.get('host')}">PWABuilder</a></li>
        <li>Click "Package For Stores" → "Android" → "Other Android" → "Download Package"</li>
        <li>Inside the zip, the APK is named <code>app-release-signed.apk</code></li>
      </ol>
      <p>Or sideload our last build from the project's GitHub Releases page.</p>
      </body></html>
    `);
  }
});

// ============= VARIANTS =============
app.get('/api/menu/:id/variants', async (req, res) => {
  res.json(await db.query('SELECT * FROM menu_variants WHERE menu_item_id=? ORDER BY sort_order, id', [req.params.id]));
});
app.post('/api/menu/:id/variants', async (req, res) => {
  const { name, price, sort_order = 0, is_default = 0 } = req.body;
  const r = await db.run('INSERT INTO menu_variants (menu_item_id, name, price, sort_order, is_default) VALUES (?,?,?,?,?)',
    [req.params.id, name, price, sort_order, is_default ? 1 : 0]);
  res.json({ id: r.lastID, ok: true });
});
app.put('/api/variants/:id', async (req, res) => {
  const { name, price, sort_order, is_default } = req.body;
  await db.run('UPDATE menu_variants SET name=?, price=?, sort_order=?, is_default=? WHERE id=?',
    [name, price, sort_order || 0, is_default ? 1 : 0, req.params.id]);
  res.json({ ok: true });
});
app.delete('/api/variants/:id', async (req, res) => {
  await db.run('DELETE FROM menu_variants WHERE id=?', [req.params.id]);
  res.json({ ok: true });
});

// ============= MODIFIER GROUPS + MODIFIERS =============
app.get('/api/modifier-groups', async (req, res) => {
  const groups = await db.query('SELECT * FROM modifier_groups ORDER BY id');
  for (const g of groups) {
    g.modifiers = await db.query('SELECT * FROM modifiers WHERE group_id=? ORDER BY sort_order, id', [g.id]);
  }
  res.json(groups);
});
app.post('/api/modifier-groups', async (req, res) => {
  const { name, selection_type = 'multiple', is_required = 0, min_select = 0, max_select = 99 } = req.body;
  const r = await db.run('INSERT INTO modifier_groups (name, selection_type, is_required, min_select, max_select) VALUES (?,?,?,?,?)',
    [name, selection_type, is_required ? 1 : 0, min_select, max_select]);
  res.json({ id: r.lastID, ok: true });
});
app.put('/api/modifier-groups/:id', async (req, res) => {
  const { name, selection_type, is_required, min_select, max_select } = req.body;
  await db.run('UPDATE modifier_groups SET name=?, selection_type=?, is_required=?, min_select=?, max_select=? WHERE id=?',
    [name, selection_type, is_required ? 1 : 0, min_select || 0, max_select || 99, req.params.id]);
  res.json({ ok: true });
});
app.delete('/api/modifier-groups/:id', async (req, res) => {
  await db.run('DELETE FROM modifiers WHERE group_id=?', [req.params.id]);
  await db.run('DELETE FROM menu_item_modifiers WHERE group_id=?', [req.params.id]);
  await db.run('DELETE FROM modifier_groups WHERE id=?', [req.params.id]);
  res.json({ ok: true });
});

app.post('/api/modifier-groups/:id/modifiers', async (req, res) => {
  const { name, price = 0, sort_order = 0 } = req.body;
  const r = await db.run('INSERT INTO modifiers (group_id, name, price, sort_order) VALUES (?,?,?,?)',
    [req.params.id, name, price, sort_order]);
  res.json({ id: r.lastID, ok: true });
});
app.put('/api/modifiers/:id', async (req, res) => {
  const { name, price, sort_order } = req.body;
  await db.run('UPDATE modifiers SET name=?, price=?, sort_order=? WHERE id=?',
    [name, price, sort_order || 0, req.params.id]);
  res.json({ ok: true });
});
app.delete('/api/modifiers/:id', async (req, res) => {
  await db.run('DELETE FROM modifiers WHERE id=?', [req.params.id]);
  res.json({ ok: true });
});

// Attach/detach modifier groups to menu items
app.get('/api/menu/:id/modifier-groups', async (req, res) => {
  res.json(await db.query(`
    SELECT g.*, (SELECT json_group_array(json_object('id', m.id, 'name', m.name, 'price', m.price))
                 FROM modifiers m WHERE m.group_id = g.id) as modifiers_json
    FROM modifier_groups g
    JOIN menu_item_modifiers mim ON mim.group_id = g.id
    WHERE mim.menu_item_id = ?
  `, [req.params.id]).catch(async () => {
    // Postgres-friendly fallback
    const groups = await db.query(`
      SELECT g.* FROM modifier_groups g
      JOIN menu_item_modifiers mim ON mim.group_id = g.id
      WHERE mim.menu_item_id = ?
    `, [req.params.id]);
    for (const g of groups) {
      g.modifiers = await db.query('SELECT * FROM modifiers WHERE group_id=? ORDER BY sort_order, id', [g.id]);
    }
    return groups;
  }));
});
app.post('/api/menu/:id/modifier-groups/:groupId', async (req, res) => {
  try {
    await db.run('INSERT INTO menu_item_modifiers (menu_item_id, group_id) VALUES (?, ?)', [req.params.id, req.params.groupId]);
  } catch (e) {}
  res.json({ ok: true });
});
app.delete('/api/menu/:id/modifier-groups/:groupId', async (req, res) => {
  await db.run('DELETE FROM menu_item_modifiers WHERE menu_item_id=? AND group_id=?', [req.params.id, req.params.groupId]);
  res.json({ ok: true });
});

// Full menu item detail (with variants and modifier groups)
app.get('/api/menu/:id/detail', async (req, res) => {
  const item = (await db.query('SELECT m.*, c.name AS category_name FROM menu_items m LEFT JOIN categories c ON c.id = m.category_id WHERE m.id=?', [req.params.id]))[0];
  if (!item) return res.status(404).json({ error: 'not found' });
  item.variants = await db.query('SELECT * FROM menu_variants WHERE menu_item_id=? ORDER BY sort_order, id', [req.params.id]);
  const groups = await db.query(`
    SELECT g.* FROM modifier_groups g
    JOIN menu_item_modifiers mim ON mim.group_id = g.id
    WHERE mim.menu_item_id = ?
  `, [req.params.id]);
  for (const g of groups) {
    g.modifiers = await db.query('SELECT * FROM modifiers WHERE group_id=? ORDER BY sort_order, id', [g.id]);
  }
  item.modifier_groups = groups;
  res.json(item);
});

// ============= COMBOS =============
app.get('/api/combos', async (req, res) => {
  const combos = await db.query('SELECT * FROM combos ORDER BY id');
  for (const c of combos) {
    c.items = await db.query(`
      SELECT ci.*, m.name AS item_name, cat.name AS category_name
      FROM combo_items ci
      LEFT JOIN menu_items m ON m.id = ci.menu_item_id
      LEFT JOIN categories cat ON cat.id = ci.category_id
      WHERE ci.combo_id = ?
    `, [c.id]);
  }
  res.json(combos);
});
app.post('/api/combos', async (req, res) => {
  const { name, description = '', price, tax_pct = 5, category_id = null, image_url = '' } = req.body;
  const r = await db.run('INSERT INTO combos (name, description, price, tax_pct, category_id, available, image_url) VALUES (?,?,?,?,?,1,?)',
    [name, description, price, tax_pct, category_id, image_url]);
  res.json({ id: r.lastID, ok: true });
});
app.put('/api/combos/:id', async (req, res) => {
  const { name, description, price, tax_pct, category_id, available, image_url } = req.body;
  await db.run('UPDATE combos SET name=?, description=?, price=?, tax_pct=?, category_id=?, available=?, image_url=? WHERE id=?',
    [name, description || '', price, tax_pct, category_id, available ? 1 : 0, image_url || '', req.params.id]);
  res.json({ ok: true });
});
app.delete('/api/combos/:id', async (req, res) => {
  await db.run('DELETE FROM combo_items WHERE combo_id=?', [req.params.id]);
  await db.run('DELETE FROM combos WHERE id=?', [req.params.id]);
  res.json({ ok: true });
});
app.post('/api/combos/:id/items', async (req, res) => {
  const { menu_item_id = null, category_id = null, qty = 1 } = req.body;
  const r = await db.run('INSERT INTO combo_items (combo_id, menu_item_id, category_id, qty) VALUES (?,?,?,?)',
    [req.params.id, menu_item_id, category_id, qty]);
  res.json({ id: r.lastID, ok: true });
});
app.delete('/api/combos/:comboId/items/:itemId', async (req, res) => {
  await db.run('DELETE FROM combo_items WHERE id=? AND combo_id=?', [req.params.itemId, req.params.comboId]);
  res.json({ ok: true });
});

// ============= RECIPES (ingredient mapping per menu item) =============
app.get('/api/menu/:id/recipe', async (req, res) => {
  const rows = await db.query(`
    SELECT r.*, i.name AS ingredient_name, i.unit, i.current_stock
    FROM recipes r LEFT JOIN inventory_items i ON i.id = r.inventory_item_id
    WHERE r.menu_item_id = ?
  `, [req.params.id]);
  res.json(rows);
});
app.post('/api/menu/:id/recipe', async (req, res) => {
  const { inventory_item_id, qty, notes = '' } = req.body;
  // Upsert: remove existing for this pair first
  await db.run('DELETE FROM recipes WHERE menu_item_id=? AND inventory_item_id=?', [req.params.id, inventory_item_id]);
  const r = await db.run('INSERT INTO recipes (menu_item_id, inventory_item_id, qty, notes) VALUES (?,?,?,?)',
    [req.params.id, inventory_item_id, qty, notes]);
  res.json({ id: r.lastID, ok: true });
});
app.delete('/api/recipes/:id', async (req, res) => {
  await db.run('DELETE FROM recipes WHERE id=?', [req.params.id]);
  res.json({ ok: true });
});

// ============= REPORTS =============
// IST-aware: date ranges and peak-hours reflect the restaurant's local day, not UTC.
function dateFn(col) { return istDate(col); }
function hourFn(col) {
  const c = usePostgres ? `${col} + INTERVAL '${IST_OFFSET_MIN} minutes'` : `${col}, '+${IST_OFFSET_MIN} minutes'`;
  return usePostgres ? `EXTRACT(HOUR FROM ${c})::int` : `CAST(strftime('%H', ${col}, '+${IST_OFFSET_MIN} minutes') AS INTEGER)`;
}

app.get('/api/reports/items', async (req, res) => {
  const { from = '1900-01-01', to = '2999-12-31' } = req.query;
  const rows = await db.query(`
    SELECT oi.name, SUM(oi.qty) as qty, SUM(oi.qty * oi.price) as revenue,
           SUM(oi.qty * oi.price * oi.tax_pct / 100) as tax
    FROM order_items oi JOIN orders o ON o.id = oi.order_id
    WHERE o.status='paid' AND ${dateFn('o.closed_at')} >= ? AND ${dateFn('o.closed_at')} <= ?
    GROUP BY oi.name ORDER BY revenue DESC
  `, [from, to]);
  res.json(rows);
});

app.get('/api/reports/payment', async (req, res) => {
  const { from = '1900-01-01', to = '2999-12-31' } = req.query;
  const rows = await db.query(`
    SELECT COALESCE(payment_method, 'unknown') as method,
           COUNT(*) as orders, COALESCE(SUM(total),0) as total
    FROM orders WHERE status='paid' AND ${dateFn('closed_at')} >= ? AND ${dateFn('closed_at')} <= ?
    GROUP BY payment_method ORDER BY total DESC
  `, [from, to]);
  res.json(rows);
});

app.get('/api/reports/tax', async (req, res) => {
  const { from = '1900-01-01', to = '2999-12-31' } = req.query;
  const rows = await db.query(`
    SELECT oi.tax_pct as rate,
           SUM(oi.qty * oi.price) as taxable_amount,
           SUM(oi.qty * oi.price * oi.tax_pct / 100) as tax_amount
    FROM order_items oi JOIN orders o ON o.id = oi.order_id
    WHERE o.status='paid' AND ${dateFn('o.closed_at')} >= ? AND ${dateFn('o.closed_at')} <= ?
    GROUP BY oi.tax_pct ORDER BY oi.tax_pct
  `, [from, to]);
  res.json(rows);
});

app.get('/api/reports/peak-hours', async (req, res) => {
  const { from = '1900-01-01', to = '2999-12-31' } = req.query;
  const rows = await db.query(`
    SELECT ${hourFn('o.closed_at')} as hour,
           COUNT(*) as orders, COALESCE(SUM(o.total),0) as revenue
    FROM orders o
    WHERE o.status='paid' AND ${dateFn('o.closed_at')} >= ? AND ${dateFn('o.closed_at')} <= ?
    GROUP BY hour ORDER BY hour
  `, [from, to]);
  res.json(rows);
});

app.get('/api/reports/top-customers', async (req, res) => {
  const { from = '1900-01-01', to = '2999-12-31' } = req.query;
  const rows = await db.query(`
    SELECT c.id, c.name, c.phone,
           COUNT(o.id) as orders, COALESCE(SUM(o.total),0) as total_spend
    FROM customers c JOIN orders o ON o.customer_id = c.id
    WHERE o.status='paid' AND ${dateFn('o.closed_at')} >= ? AND ${dateFn('o.closed_at')} <= ?
    GROUP BY c.id, c.name, c.phone ORDER BY total_spend DESC LIMIT 50
  `, [from, to]);
  res.json(rows);
});

app.get('/api/reports/summary', async (req, res) => {
  const { from = '1900-01-01', to = '2999-12-31' } = req.query;
  const summary = await db.query(`
    SELECT COUNT(*) as orders,
           COALESCE(SUM(total),0) as revenue,
           COALESCE(SUM(subtotal),0) as net_sales,
           COALESCE(SUM(tax),0) as total_tax,
           COALESCE(SUM(discount),0) as total_discount,
           COALESCE(AVG(total),0) as avg_order_value
    FROM orders WHERE status='paid' AND ${dateFn('closed_at')} >= ? AND ${dateFn('closed_at')} <= ?
  `, [from, to]);
  res.json(summary[0] || {});
});

// ============= HOLD / RESUME ORDER =============
app.put('/api/orders/:id/hold', async (req, res) => {
  await db.run("UPDATE orders SET status='hold' WHERE id=?", [req.params.id]);
  res.json({ ok: true });
});
app.put('/api/orders/:id/resume', async (req, res) => {
  await db.run("UPDATE orders SET status='open' WHERE id=?", [req.params.id]);
  res.json({ ok: true });
});
app.get('/api/orders-held', async (req, res) => {
  const rows = await db.query(`
    SELECT o.*, t.name AS table_name FROM orders o LEFT JOIN tables t ON t.id = o.table_id
    WHERE o.status='hold' ORDER BY o.created_at DESC
  `);
  res.json(rows);
});

// ============= WHATSAPP RECEIPT =============
// Generates a wa.me URL with bill text. Free, no API keys needed.
// Customer's WhatsApp opens with the message pre-filled; user taps Send.
app.get('/api/orders/:id/whatsapp-link', async (req, res) => {
  try {
    const o = (await db.query('SELECT o.*, t.name AS table_name FROM orders o LEFT JOIN tables t ON t.id=o.table_id WHERE o.id=?', [req.params.id]))[0];
    if (!o) return res.status(404).json({ error: 'not found' });
    const items = await db.query('SELECT * FROM order_items WHERE order_id=?', [req.params.id]);
    const settingsRows = await db.query('SELECT * FROM settings');
    const s = {}; for (const r of settingsRows) s[r.key] = r.value;

    const lines = [];
    lines.push(`*${s.restaurant_name || 'Restaurant POS'}*`);
    if (s.restaurant_address) lines.push(s.restaurant_address);
    if (s.restaurant_phone) lines.push('Ph: ' + s.restaurant_phone);
    if (s.gst_no) lines.push('GST: ' + s.gst_no);
    lines.push('');
    lines.push(`Invoice: ${o.order_no}`);
    lines.push(`Date: ${new Date(o.closed_at || o.created_at).toLocaleString()}`);
    lines.push(`Type: ${o.type}${o.table_name ? ' · ' + o.table_name : ''}`);
    if (o.customer_name) lines.push(`Customer: ${o.customer_name}`);
    lines.push('');
    lines.push('--- Items ---');
    for (const it of items) {
      lines.push(`${it.name} x${it.qty} = Rs.${(Number(it.price) * Number(it.qty)).toFixed(2)}`);
    }
    lines.push('');
    lines.push(`Subtotal: Rs.${Number(o.subtotal).toFixed(2)}`);
    lines.push(`Tax: Rs.${Number(o.tax).toFixed(2)}`);
    if (Number(o.discount) > 0) lines.push(`Discount: -Rs.${Number(o.discount).toFixed(2)}`);
    lines.push(`*TOTAL: Rs.${Number(o.total).toFixed(2)}*`);
    if (o.payment_method) lines.push(`Paid: ${o.payment_method}`);
    lines.push('');
    lines.push(s.bill_footer || 'Thank you!');

    const text = encodeURIComponent(lines.join('\n'));
    const phone = (o.customer_phone || '').replace(/[^0-9]/g, '');
    // wa.me requires E.164-like number without +. India default 91 prefix if missing.
    let waPhone = phone;
    if (waPhone && waPhone.length === 10) waPhone = '91' + waPhone;
    const url = waPhone ? `https://wa.me/${waPhone}?text=${text}` : `https://wa.me/?text=${text}`;
    res.json({ url, phone: waPhone, has_phone: !!waPhone });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// v8: BRANDS, ENRICHED OUTLETS/MENU, REVIEWS, CLOUD KITCHEN =============

// ---- BRANDS ----
app.get('/api/brands', async (req, res) => {
  try {
    const rows = await db.query('SELECT * FROM brands ORDER BY name');
    res.json(rows);
  } catch (e) { res.status(500).json({ ok: false, error: e.message }); }
});

app.post('/api/brands', async (req, res) => {
  try {
    const b = req.body || {};
    const r = await db.run(
      `INSERT INTO brands (name, slug, logo_url, cuisine, primary_color, description, is_cloud_kitchen)
       VALUES (?,?,?,?,?,?,?)`,
      [b.name, b.slug || '', b.logo_url || '', b.cuisine || '', b.primary_color || '#ff6b35',
       b.description || '', b.is_cloud_kitchen ? 1 : 0]
    );
    res.json({ id: r.lastID, ok: true });
  } catch (e) { res.status(500).json({ ok: false, error: e.message }); }
});

app.put('/api/brands/:id', async (req, res) => {
  try {
    const b = req.body || {};
    await db.run(
      `UPDATE brands SET name=?, slug=?, logo_url=?, cuisine=?, primary_color=?, description=?, is_cloud_kitchen=? WHERE id=?`,
      [b.name, b.slug || '', b.logo_url || '', b.cuisine || '', b.primary_color || '#ff6b35',
       b.description || '', b.is_cloud_kitchen ? 1 : 0, req.params.id]
    );
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ ok: false, error: e.message }); }
});

app.delete('/api/brands/:id', async (req, res) => {
  await db.run('DELETE FROM brands WHERE id=?', [req.params.id]);
  res.json({ ok: true });
});

// Bulk import brands from extension
app.post('/api/external-brands', async (req, res) => {
  try {
    const { source = 'zomato', brands = [] } = req.body;
    let inserted = 0, updated = 0;
    for (const b of brands) {
      if (!b.name) continue;
      const existing = await db.query(`SELECT id FROM brands WHERE (external_id=? AND source=?) OR name=?`,
        [b.external_id || '__none__', source, b.name]);
      if (existing.length) {
        await db.run(`UPDATE brands SET slug=?, logo_url=?, cuisine=?, description=?, rating=?, total_reviews=?, external_id=?, source=? WHERE id=?`,
          [b.slug || '', b.logo_url || '', b.cuisine || '', b.description || '',
           b.rating || 0, b.total_reviews || 0, b.external_id || '', source, existing[0].id]);
        updated++;
      } else {
        await db.run(`INSERT INTO brands (name, slug, logo_url, cuisine, description, rating, total_reviews, external_id, source, is_cloud_kitchen)
                      VALUES (?,?,?,?,?,?,?,?,?,?)`,
          [b.name, b.slug || '', b.logo_url || '', b.cuisine || '', b.description || '',
           b.rating || 0, b.total_reviews || 0, b.external_id || '', source, b.is_cloud_kitchen ? 1 : 0]);
        inserted++;
      }
    }
    res.json({ ok: true, inserted, updated, total: brands.length });
  } catch (e) { res.status(500).json({ ok: false, error: e.message }); }
});

// ---- ENRICHED OUTLETS (v8 upgrade) ----
app.post('/api/external-outlets-v2', async (req, res) => {
  try {
    const { source = 'zomato', outlets = [] } = req.body;
    let inserted = 0, updated = 0;
    for (const o of outlets) {
      if (!o.external_id || !o.name) continue;

      // Try to link to a brand by name match
      let brandId = null;
      if (o.brand_name) {
        const br = await db.query('SELECT id FROM brands WHERE name=?', [o.brand_name]);
        if (br.length) brandId = br[0].id;
      }

      const existing = await db.query(`SELECT id FROM shops WHERE external_id=? AND source=?`,
        [o.external_id, source]);

      if (existing.length) {
        await db.run(`UPDATE shops SET name=?, address=?, phone=?, city=?, area=?, lat=?, lng=?,
                      image_url=?, rating=?, total_reviews=?, cuisine=?, is_active=?, brand_id=?,
                      is_cloud_kitchen=?, opens_at=?, closes_at=?, avg_cost=?, rating_source=? WHERE id=?`,
          [o.name, o.address || '', o.phone || '', o.city || '', o.area || '',
           o.lat || null, o.lng || null, o.image_url || '', o.rating || 0,
           o.total_reviews || 0, o.cuisine || '', o.is_active ? 1 : 0, brandId,
           o.is_cloud_kitchen ? 1 : 0, o.opens_at || '', o.closes_at || '',
           o.avg_cost || 0, source, existing[0].id]);
        updated++;
      } else {
        await db.run(`INSERT INTO shops (name, address, phone, city, area, lat, lng, image_url,
                      rating, total_reviews, cuisine, is_active, brand_id, is_cloud_kitchen,
                      opens_at, closes_at, avg_cost, external_id, source, rating_source)
                      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
          [o.name, o.address || '', o.phone || '', o.city || '', o.area || '',
           o.lat || null, o.lng || null, o.image_url || '', o.rating || 0,
           o.total_reviews || 0, o.cuisine || '', o.is_active ? 1 : 0, brandId,
           o.is_cloud_kitchen ? 1 : 0, o.opens_at || '', o.closes_at || '',
           o.avg_cost || 0, o.external_id, source, source]);
        inserted++;
      }
    }
    res.json({ ok: true, inserted, updated, total: outlets.length });
  } catch (e) { res.status(500).json({ ok: false, error: e.message }); }
});

// ---- HIERARCHICAL MENU (v8 upgrade) ----
// Accepts: { source, outlet_external_id, categories: [{ name, items: [{ name, price, variants, ... }] }] }
app.post('/api/external-menu-v2', async (req, res) => {
  try {
    const { source = 'zomato', outlet_external_id, categories = [] } = req.body;

    // Find brand_id via outlet
    let brandId = null, outletId = null;
    if (outlet_external_id) {
      const o = await db.query('SELECT id, brand_id FROM shops WHERE external_id=? AND source=?',
        [outlet_external_id, source]);
      if (o.length) { outletId = o[0].id; brandId = o[0].brand_id; }
    }

    let catInserted = 0, catUpdated = 0, itemInserted = 0, itemUpdated = 0, variantsAdded = 0;

    for (const cat of categories) {
      if (!cat.name) continue;
      // Upsert category
      const existingCat = await db.query(`SELECT id FROM categories WHERE name=? AND brand_id IS ?`,
        [cat.name, brandId]);
      let catId;
      if (existingCat.length) {
        catId = existingCat[0].id;
        await db.run(`UPDATE categories SET image_url=?, description=?, sort_order=? WHERE id=?`,
          [cat.image_url || '', cat.description || '', cat.sort_order || 0, catId]);
        catUpdated++;
      } else {
        const r = await db.run(`INSERT INTO categories (name, sort_order, brand_id, image_url, description, external_id, source)
                                VALUES (?,?,?,?,?,?,?)`,
          [cat.name, cat.sort_order || 0, brandId, cat.image_url || '',
           cat.description || '', cat.external_id || '', source]);
        catId = r.lastID || (await db.query("SELECT id FROM categories WHERE name=? AND brand_id IS ?",
          [cat.name, brandId]))[0]?.id;
        catInserted++;
      }

      // Subcategories (recurse one level)
      for (const sub of (cat.subcategories || [])) {
        const existingSub = await db.query(`SELECT id FROM categories WHERE name=? AND parent_id=?`,
          [sub.name, catId]);
        let subId;
        if (existingSub.length) {
          subId = existingSub[0].id;
        } else {
          const r2 = await db.run(`INSERT INTO categories (name, parent_id, brand_id, sort_order, image_url, source)
                                   VALUES (?,?,?,?,?,?)`,
            [sub.name, catId, brandId, sub.sort_order || 0, sub.image_url || '', source]);
          subId = r2.lastID;
        }
        // Items under subcategory
        for (const it of (sub.items || [])) {
          const r3 = await upsertMenuItem(db, source, brandId, catId, subId, it);
          if (r3.inserted) itemInserted++; else itemUpdated++;
          variantsAdded += r3.variants;
        }
      }

      // Direct items under category
      for (const it of (cat.items || [])) {
        const r4 = await upsertMenuItem(db, source, brandId, catId, null, it);
        if (r4.inserted) itemInserted++; else itemUpdated++;
        variantsAdded += r4.variants;
      }
    }

    res.json({ ok: true,
      categories: { inserted: catInserted, updated: catUpdated },
      items: { inserted: itemInserted, updated: itemUpdated },
      variants_added: variantsAdded });
  } catch (e) { res.status(500).json({ ok: false, error: e.message }); }
});

// Helper used by external-menu-v2
async function upsertMenuItem(db, source, brandId, catId, subId, it) {
  let inserted = false, variants = 0;
  const existing = await db.query(`SELECT id FROM menu_items WHERE external_id=? AND source=?`,
    [it.external_id || '__none__', source]);
  let itemId;
  if (existing.length) {
    itemId = existing[0].id;
    await db.run(`UPDATE menu_items SET name=?, price=?, tax_pct=?, available=?, description=?,
                  image_url=?, food_type=?, is_recommended=?, is_bestseller=?, is_spicy=?,
                  prep_time=?, allergen_info=?, calorie_info=?, rating=?, review_count=?,
                  long_description=?, serves=?, category_id=?, subcategory_id=?, brand_id=?
                  WHERE id=?`,
      [it.name, it.price || 0, it.tax_pct || 5, it.available !== false ? 1 : 0,
       it.description || '', it.image_url || '', it.food_type || '',
       it.is_recommended ? 1 : 0, it.is_bestseller ? 1 : 0, it.is_spicy ? 1 : 0,
       it.prep_time || null, it.allergen_info || '', it.calorie_info || null,
       it.rating || 0, it.review_count || 0, it.long_description || '',
       it.serves || null, catId, subId, brandId, itemId]);
  } else {
    const r = await db.run(`INSERT INTO menu_items (name, category_id, subcategory_id, brand_id,
                            price, tax_pct, available, description, image_url, food_type,
                            is_recommended, is_bestseller, is_spicy, prep_time, allergen_info,
                            calorie_info, rating, review_count, long_description, serves,
                            external_id, source, slug)
                            VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      [it.name, catId, subId, brandId, it.price || 0, it.tax_pct || 5,
       it.available !== false ? 1 : 0, it.description || '', it.image_url || '',
       it.food_type || '', it.is_recommended ? 1 : 0, it.is_bestseller ? 1 : 0,
       it.is_spicy ? 1 : 0, it.prep_time || null, it.allergen_info || '',
       it.calorie_info || null, it.rating || 0, it.review_count || 0,
       it.long_description || '', it.serves || null, it.external_id || '', source,
       it.slug || '']);
    itemId = r.lastID;
    inserted = true;
  }
  // Variants
  if (Array.isArray(it.variants) && itemId) {
    for (const v of it.variants) {
      const ex = await db.query(`SELECT id FROM menu_variants WHERE menu_item_id=? AND name=?`,
        [itemId, v.name]);
      if (!ex.length) {
        await db.run(`INSERT INTO menu_variants (menu_item_id, name, price_delta, external_id, image_url, sort_order)
                      VALUES (?,?,?,?,?,?)`,
          [itemId, v.name, v.price_delta || (v.price ? v.price - (it.price || 0) : 0),
           v.external_id || '', v.image_url || '', v.sort_order || 0]);
        variants++;
      }
    }
  }
  return { inserted, variants };
}

// ---- REVIEWS ----
app.get('/api/reviews', async (req, res) => {
  try {
    const { brand_id, outlet_id, menu_item_id, limit = 100 } = req.query;
    let q = 'SELECT * FROM reviews WHERE 1=1';
    const args = [];
    if (brand_id) { q += ' AND brand_id=?'; args.push(brand_id); }
    if (outlet_id) { q += ' AND outlet_id=?'; args.push(outlet_id); }
    if (menu_item_id) { q += ' AND menu_item_id=?'; args.push(menu_item_id); }
    q += ' ORDER BY created_at DESC LIMIT ' + Number(limit);
    res.json(await db.query(q, args));
  } catch (e) { res.status(500).json({ ok: false, error: e.message }); }
});

app.post('/api/external-reviews', async (req, res) => {
  try {
    const { source = 'zomato', outlet_external_id, reviews = [] } = req.body;
    let outletId = null, brandId = null;
    if (outlet_external_id) {
      const o = await db.query('SELECT id, brand_id FROM shops WHERE external_id=? AND source=?',
        [outlet_external_id, source]);
      if (o.length) { outletId = o[0].id; brandId = o[0].brand_id; }
    }
    let inserted = 0, skipped = 0;
    for (const r of reviews) {
      if (!r.external_id) { skipped++; continue; }
      const ex = await db.query(`SELECT id FROM reviews WHERE external_id=? AND source=?`,
        [r.external_id, source]);
      if (ex.length) { skipped++; continue; }

      // Try to resolve menu_item_id from item name + brand
      let menuItemId = null;
      if (r.item_name && brandId) {
        const mi = await db.query(`SELECT id FROM menu_items WHERE brand_id=? AND name=? LIMIT 1`,
          [brandId, r.item_name]);
        if (mi.length) menuItemId = mi[0].id;
      }

      // Simple sentiment from rating
      let sentiment = 'neutral';
      if (r.rating >= 4) sentiment = 'positive';
      else if (r.rating <= 2.5) sentiment = 'negative';

      await db.run(`INSERT INTO reviews (source, external_id, brand_id, outlet_id, menu_item_id,
                    order_id, customer_name, customer_phone, rating, review_text,
                    is_replied, reply_text, sentiment)
                    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`,
        [source, r.external_id, brandId, outletId, menuItemId,
         r.order_id || '', r.customer_name || '', r.customer_phone || '',
         r.rating || 0, r.review_text || '',
         r.is_replied ? 1 : 0, r.reply_text || '', sentiment]);
      inserted++;
    }
    res.json({ ok: true, inserted, skipped, total: reviews.length });
  } catch (e) { res.status(500).json({ ok: false, error: e.message }); }
});

// ---- CLOUD KITCHEN DASHBOARD ----
app.get('/api/cloud-kitchen-dashboard', async (req, res) => {
  try {
    const brands = await db.query(`
      SELECT b.id, b.name, b.logo_url, b.primary_color, b.is_cloud_kitchen,
        b.rating, b.total_reviews,
        (SELECT COUNT(*) FROM shops WHERE brand_id=b.id) as outlet_count,
        (SELECT COUNT(*) FROM menu_items WHERE brand_id=b.id) as menu_count,
        (SELECT COUNT(*) FROM reviews WHERE brand_id=b.id) as review_count,
        (SELECT AVG(rating) FROM reviews WHERE brand_id=b.id) as avg_rating
      FROM brands b ORDER BY b.name
    `);
    res.json({ brands, total: brands.length });
  } catch (e) { res.status(500).json({ ok: false, error: e.message }); }
});

// GET enriched outlets (with brand info)
app.get('/api/outlets', async (req, res) => {
  try {
    const rows = await db.query(`
      SELECT s.*, b.name as brand_name, b.logo_url as brand_logo, b.primary_color as brand_color
      FROM shops s LEFT JOIN brands b ON b.id = s.brand_id
      ORDER BY s.name
    `);
    res.json(rows);
  } catch (e) { res.status(500).json({ ok: false, error: e.message }); }
});

// ============= EXTERNAL OUTLETS / MENU / INVENTORY (Bulk import) =============
// Receives outlet list from extension. Upsert by (source, external_id).
app.post('/api/external-outlets', async (req, res) => {
  try {
    const { source = 'zomato', outlets = [] } = req.body;
    let inserted = 0, updated = 0;
    for (const o of outlets) {
      if (!o.external_id) continue;
      const existing = await db.query("SELECT id FROM shops WHERE name=?", [`[${source}] ${o.name}`]);
      if (existing.length) {
        await db.run("UPDATE shops SET address=?, phone=?, is_active=? WHERE id=?",
          [o.address || '', o.phone || '', o.is_active ? 1 : 0, existing[0].id]);
        updated++;
      } else {
        await db.run("INSERT INTO shops (name, address, phone, is_active) VALUES (?,?,?,?)",
          [`[${source}] ${o.name}`, o.address || '', o.phone || '', o.is_active ? 1 : 0]);
        inserted++;
      }
    }
    res.json({ ok: true, inserted, updated, total: outlets.length });
  } catch (e) { res.status(500).json({ ok: false, error: e.message }); }
});

// Receives menu items from extension (per outlet)
app.post('/api/external-menu', async (req, res) => {
  try {
    const { source = 'zomato', outlet_external_id, items = [] } = req.body;
    let inserted = 0, updated = 0;
    // Ensure a category exists for this source
    let catId = (await db.query("SELECT id FROM categories WHERE name=?", [`${source}-imported`]))[0]?.id;
    if (!catId) {
      const r = await db.run("INSERT INTO categories (name, sort_order) VALUES (?, 99)", [`${source}-imported`]);
      catId = r.lastID || (await db.query("SELECT id FROM categories WHERE name=?", [`${source}-imported`]))[0]?.id;
    }
    for (const it of items) {
      const name = `[${source}] ${it.name}`;
      const existing = await db.query("SELECT id FROM menu_items WHERE name=?", [name]);
      if (existing.length) {
        await db.run("UPDATE menu_items SET price=?, tax_pct=?, available=?, description=? WHERE id=?",
          [it.price || 0, it.tax_pct || 5, it.available ? 1 : 0, it.description || '', existing[0].id]);
        updated++;
      } else {
        await db.run("INSERT INTO menu_items (name, category_id, price, tax_pct, available, description) VALUES (?,?,?,?,?,?)",
          [name, catId, it.price || 0, it.tax_pct || 5, it.available ? 1 : 0, it.description || '']);
        inserted++;
      }
    }
    res.json({ ok: true, inserted, updated, total: items.length, outlet: outlet_external_id });
  } catch (e) { res.status(500).json({ ok: false, error: e.message }); }
});

// Receives an inventory snapshot from extension (per outlet)
app.post('/api/external-inventory', async (req, res) => {
  try {
    const { source = 'zomato', items = [] } = req.body;
    let inserted = 0, updated = 0;
    for (const it of items) {
      const name = `[${source}] ${it.name}`;
      const existing = await db.query("SELECT id FROM inventory_items WHERE name=?", [name]);
      if (existing.length) {
        await db.run("UPDATE inventory_items SET current_stock=?, last_purchase_price=? WHERE id=?",
          [it.qty || 0, it.price || 0, existing[0].id]);
        updated++;
      } else {
        await db.run("INSERT INTO inventory_items (name, unit, category, current_stock, low_stock_threshold, last_purchase_price) VALUES (?,?,?,?,?,?)",
          [name, it.unit || 'unit', source, it.qty || 0, 5, it.price || 0]);
        inserted++;
      }
    }
    res.json({ ok: true, inserted, updated, total: items.length });
  } catch (e) { res.status(500).json({ ok: false, error: e.message }); }
});

// ============= EXTERNAL ORDERS (Swiggy / Zomato / etc.) =============
// Receives orders from the browser extension or notification listener
// Body shape: {
//   source: 'swiggy' | 'zomato' | 'dunzo' | 'other',
//   external_id: string,   // platform's order ID for dedup
//   customer: { name?, phone? },
//   items: [ { name, qty, price } ],
//   total: number,
//   meta: object  // raw payload for debugging
// }
// Helper: fuzzy-match items against menu and insert into order_items
async function populateOrderItems(orderId, items, source) {
  const allMenu = await db.query('SELECT * FROM menu_items WHERE available = 1');
  const norm = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9]/g, '');
  let subtotal = 0, tax = 0;
  for (const it of items) {
    const itName = norm(it.name);
    let menu = allMenu.find(m => norm(m.name) === itName);
    if (!menu) menu = allMenu.find(m => norm(m.name).includes(itName) || itName.includes(norm(m.name)));
    const price = Number(it.price) || (menu ? Number(menu.price) : 0);
    const taxPct = menu ? Number(menu.tax_pct) : 5;
    const qty = Number(it.qty) || 1;
    await db.run(
      `INSERT INTO order_items (order_id, menu_item_id, name, qty, price, tax_pct, status, notes)
       VALUES (?, ?, ?, ?, ?, ?, 'sent', ?)`,
      [orderId, menu ? menu.id : 0, it.name, qty, price, taxPct, menu ? '' : 'UNMATCHED ITEM']
    );
    subtotal += price * qty;
    tax += price * qty * taxPct / 100;
  }
  return { subtotal, tax };
}

// Map a platform lifecycle state (Zomato/Swiggy) to our normalized channel state.
// Zomato: NEW, ACCEPTED, PREPARING, READY, DISPATCHED, DELIVERED (UI tabs = Preparing/Ready/Picked up)
function normalizeChannelState(raw) {
  const s = String(raw || '').toUpperCase().replace(/[\s-]/g, '_');
  if (!s) return '';
  if (['NEW', 'PLACED', 'CREATED', 'PENDING'].includes(s)) return 'placed';
  if (['ACCEPTED', 'CONFIRMED', 'ACKNOWLEDGED'].includes(s)) return 'accepted';
  if (['PREPARING', 'IN_KITCHEN', 'COOKING', 'FOOD_PREPARING'].includes(s)) return 'preparing';
  if (['READY', 'READY_FOR_PICKUP', 'PREPARED'].includes(s)) return 'ready';
  if (['DISPATCHED', 'PICKED_UP', 'PICKEDUP', 'OUT_FOR_DELIVERY', 'ON_THE_WAY'].includes(s)) return 'picked_up';
  if (['DELIVERED', 'COMPLETED', 'COMPLETE'].includes(s)) return 'delivered';
  if (['CANCELLED', 'CANCELED', 'REJECTED'].includes(s)) return 'cancelled';
  return s.toLowerCase();
}

// ---- Raw payload logging (for monitoring what the platforms actually send) ----
// Stores the COMPLETE payload received, plus the untouched platform JSON (body.raw).
async function logIntegration(body, endpoint) {
  try {
    const items = Array.isArray(body && body.items) ? body.items : [];
    const rawPlatform = body && body.raw ? JSON.stringify(body.raw) : null;
    const payloadCopy = Object.assign({}, body || {});
    delete payloadCopy.raw; // kept in its own column
    const r = await db.run(
      `INSERT INTO integration_logs (source, external_id, endpoint, outcome, items_count, total, customer_name, payload, raw_platform)
       VALUES (?,?,?,?,?,?,?,?,?)`,
      [String((body && body.source) || ''), String((body && body.external_id) || ''), endpoint, 'received',
       items.length, Number(body && body.total) || 0,
       String((body && body.customer && body.customer.name) || ''),
       JSON.stringify(payloadCopy), rawPlatform]
    );
    // Also to stdout so it shows up in Railway logs
    console.log(`[external-order] ${(body&&body.source)||'?'} #${(body&&body.external_id)||'?'} ` +
      `items=${items.length} total=${(body&&body.total)} customer=${(body&&body.customer&&body.customer.name)||''}`);
    console.log('[external-order] FULL PAYLOAD >>> ' + JSON.stringify(body).slice(0, 20000));
    return r.lastID || null;
  } catch (e) { console.error('logIntegration failed:', e.message); return null; }
}
async function setLogOutcome(logId, outcome) {
  if (!logId) return;
  try { await db.run('UPDATE integration_logs SET outcome=? WHERE id=?', [String(outcome), logId]); } catch (e) {}
}

app.post('/api/external-order', async (req, res) => {
  const logId = await logIntegration(req.body, '/api/external-order');
  try {
    const { source = 'other', external_id, customer = {}, items = [], total = 0, meta = {} } = req.body;
    if (!external_id) { await setLogOutcome(logId, 'rejected: no external_id'); return res.status(400).json({ ok: false, error: 'external_id required' }); }
    // v8.1: items now optional. Empty items = "channel order pending details" (extension will backfill items later).
    const itemsArr = Array.isArray(items) ? items : [];

    // Dedup by (source, external_id) — if exists, optionally upgrade state/items
    const dup = await db.query("SELECT id, order_no, status FROM orders WHERE source=? AND external_id=?", [source, external_id]);
    if (dup.length) {
      const dupId = dup[0].id;
      let backfilled = false;
      // If the extension is now sending real items, backfill an order that has
      // either no items OR only the "AWAITING ITEM SYNC" placeholder shell.
      if (itemsArr.length > 0) {
        const realItems = await db.query(
          "SELECT COUNT(*) as c FROM order_items WHERE order_id=? AND NOT (menu_item_id=0 AND notes='AWAITING ITEM SYNC')",
          [dupId]);
        if (Number(realItems[0]?.c || 0) === 0) {
          // Remove placeholder rows + their KOT lines, then populate real items
          const placeholders = await db.query(
            "SELECT id FROM order_items WHERE order_id=? AND menu_item_id=0 AND notes='AWAITING ITEM SYNC'", [dupId]);
          for (const p of placeholders) {
            await db.run("DELETE FROM kot_items WHERE order_item_id=?", [p.id]).catch(()=>{});
          }
          await db.run("DELETE FROM order_items WHERE order_id=? AND menu_item_id=0 AND notes='AWAITING ITEM SYNC'", [dupId]);
          const rb = await populateOrderItems(dupId, itemsArr, source);
          const mSub = Number(meta && meta.subtotal) || 0;
          const mTax = Number(meta && meta.tax) || 0;
          const mDisc = Number(meta && meta.discount) || 0;
          const fSub = mSub > 0 ? mSub : rb.subtotal;
          const fTax = mTax > 0 ? mTax : rb.tax;
          const newTotal = Number(total) > 0 ? Number(total) : (fSub + fTax - mDisc);
          await db.run("UPDATE orders SET subtotal=?, tax=?, discount=?, total=? WHERE id=?",
            [fSub.toFixed(2), fTax.toFixed(2), mDisc.toFixed(2), newTotal.toFixed(2), dupId]);
          // Refresh KOT with the real items (reuse latest ticket for this order, or create one)
          let kot = (await db.query("SELECT id FROM kot_tickets WHERE order_id=? ORDER BY id DESC LIMIT 1", [dupId]))[0];
          if (!kot) {
            const kotNo = 'K' + Date.now().toString().slice(-6);
            const kr = await db.run("INSERT INTO kot_tickets (order_id, kot_no, status) VALUES (?,?,'pending')", [dupId, kotNo]);
            kot = { id: kr.lastID || (await db.query('SELECT id FROM kot_tickets WHERE kot_no=?', [kotNo]))[0]?.id };
          }
          const realRows = await db.query("SELECT * FROM order_items WHERE order_id=?", [dupId]);
          for (const oi of realRows) {
            await db.run('INSERT INTO kot_items (kot_id, order_item_id, name, qty, notes) VALUES (?,?,?,?,?)',
              [kot.id, oi.id, oi.name, oi.qty, oi.notes || '']);
          }
          backfilled = true;
        }
      }
      // Backfill customer + total on the order record when now available
      if (customer && (customer.name || customer.phone)) {
        let cid = null;
        if (customer.phone) { try { cid = await ensureCustomer(customer.name, customer.phone); } catch(e) {} }
        await db.run("UPDATE orders SET customer_name=COALESCE(NULLIF(?,''), customer_name), customer_phone=COALESCE(NULLIF(?,''), customer_phone), customer_id=COALESCE(?, customer_id) WHERE id=?",
          [customer.name || '', customer.phone || '', cid, dupId]);
      }
      if (!backfilled && Number(total) > 0) {
        await db.run("UPDATE orders SET total=? WHERE id=? AND (total IS NULL OR total=0)", [Number(total).toFixed(2), dupId]);
      }
      // Update state meta (NEW → PREPARING → READY → PICKED UP → DELIVERED transitions)
      if (meta && (meta.state || meta.status)) {
        const rawState = String(meta.state || meta.status);
        const chState = normalizeChannelState(rawState);
        const prev = (await db.query('SELECT channel_state FROM orders WHERE id=?', [dupId]))[0] || {};
        await db.run("UPDATE orders SET source_meta=?, channel_state=?, channel_state_raw=? WHERE id=?",
          [JSON.stringify(meta), chState, rawState, dupId]);
        // Only add a timeline entry when the state actually changed (avoids spam on every poll)
        if (prev.channel_state !== chState) {
          await db.run("INSERT INTO order_tracking (order_id, status, note) VALUES (?,?,?)",
            [dupId, chState, `${source.toUpperCase()} → ${rawState}`]);
          // Kitchen ticket follows the channel: ready/picked_up/delivered = food is out
          if (['ready', 'picked_up', 'delivered'].includes(chState)) {
            await db.run("UPDATE kot_tickets SET status='served' WHERE order_id=? AND status!='served'", [dupId]);
          }
        }
      }
      await setLogOutcome(logId, backfilled ? 'deduped+backfilled' : 'deduped');
      return res.json({ ok: true, deduped: true, backfilled, order_id: dupId, order_no: dup[0].order_no, state_synced: !!(meta.state || meta.status) });
    }

    // Get-or-create customer
    let customer_id = null;
    if (customer.phone) {
      try { customer_id = await ensureCustomer(customer.name, customer.phone); } catch(e) {}
    }

    // Create order
    const orderNo = source.toUpperCase().slice(0,3) + Date.now().toString().slice(-6);
    const r = await db.run(
      `INSERT INTO orders (order_no, type, source, external_id, source_meta, customer_id, customer_name, customer_phone, status, total)
       VALUES (?, 'delivery', ?, ?, ?, ?, ?, ?, 'open', ?)`,
      [orderNo, source, external_id, JSON.stringify(meta), customer_id, customer.name || '', customer.phone || '', Number(total) || 0]
    );
    let orderId = r.lastID;
    if (!orderId) orderId = (await db.query('SELECT id FROM orders WHERE order_no=?', [orderNo]))[0]?.id;

    // Fuzzy-match items to menu_items (or record a pending-details placeholder)
    let subtotal = 0, taxTotal = 0;
    if (itemsArr.length > 0) {
      const r2 = await populateOrderItems(orderId, itemsArr, source);
      subtotal = r2.subtotal; taxTotal = r2.tax;
    } else {
      await db.run(
        `INSERT INTO order_items (order_id, menu_item_id, name, qty, price, tax_pct, status, notes)
         VALUES (?, 0, ?, 1, 0, 5, 'sent', ?)`,
        [orderId, `[Pending details · ${source} #${external_id}]`, 'AWAITING ITEM SYNC']
      );
    }
    // Prefer the platform's exact money breakdown (from meta) over our computed values
    const metaSub = Number(meta && meta.subtotal) || 0;
    const metaTax = Number(meta && meta.tax) || 0;
    const metaDisc = Number(meta && meta.discount) || 0;
    const finalSub = metaSub > 0 ? metaSub : subtotal;
    const finalTax = metaTax > 0 ? metaTax : taxTotal;
    const calcTotal = Number(total) > 0 ? Number(total) : (finalSub + finalTax - metaDisc);
    await db.run('UPDATE orders SET subtotal=?, tax=?, discount=?, total=? WHERE id=?',
      [finalSub.toFixed(2), finalTax.toFixed(2), metaDisc.toFixed(2), calcTotal.toFixed(2), orderId]);

    // Record the incoming channel lifecycle state (Preparing / Ready / Picked up …)
    const newRawState = String((meta && (meta.state || meta.status)) || '');
    const newChState = normalizeChannelState(newRawState) || 'placed';
    await db.run("UPDATE orders SET channel_state=?, channel_state_raw=? WHERE id=?",
      [newChState, newRawState, orderId]);

    // Track
    await db.run("INSERT INTO order_tracking (order_id, status, note) VALUES (?,?,?)",
      [orderId, 'placed', `Received from ${source.toUpperCase()} (#${external_id})`]);
    if (newChState !== 'placed') {
      await db.run("INSERT INTO order_tracking (order_id, status, note) VALUES (?,?,?)",
        [orderId, newChState, `${source.toUpperCase()} → ${newRawState}`]);
    }

    // Auto-create KOT
    const pending = await db.query("SELECT * FROM order_items WHERE order_id=?", [orderId]);
    if (pending.length) {
      const kotNo = 'K' + Date.now().toString().slice(-6);
      const kr = await db.run("INSERT INTO kot_tickets (order_id, kot_no, status) VALUES (?,?,'pending')", [orderId, kotNo]);
      let kotId = kr.lastID;
      if (!kotId) kotId = (await db.query('SELECT id FROM kot_tickets WHERE kot_no=?', [kotNo]))[0]?.id;
      for (const oi of pending) {
        await db.run('INSERT INTO kot_items (kot_id, order_item_id, name, qty, notes) VALUES (?,?,?,?,?)',
          [kotId, oi.id, oi.name, oi.qty, oi.notes || '']);
      }
      await db.run("INSERT INTO order_tracking (order_id, status, note) VALUES (?,?,?)",
        [orderId, 'in_kitchen', `Auto-KOT ${kotNo}`]);
    }

    await setLogOutcome(logId, itemsArr.length > 0 ? 'created' : 'created (shell — no items sent)');
    res.json({ ok: true, order_id: orderId, order_no: orderNo, items_count: items.length });
  } catch (e) {
    console.error('external-order error:', e);
    await setLogOutcome(logId, 'error: ' + e.message);
    res.status(500).json({ ok: false, error: e.message });
  }
});

// ---- Integration log viewer ----
// GET /api/integration-logs                 -> latest 50 (summary, no big blobs)
// GET /api/integration-logs?full=1          -> include full payload + raw platform JSON
// GET /api/integration-logs?external_id=123 -> everything logged for one order
app.get('/api/integration-logs', async (req, res) => {
  try {
    const { source = '', external_id = '', limit = 50, full = '' } = req.query;
    const cols = full ? '*' : 'id, source, external_id, endpoint, outcome, items_count, total, customer_name, created_at';
    let sql = `SELECT ${cols} FROM integration_logs WHERE 1=1`;
    const args = [];
    if (source) { sql += ' AND source=?'; args.push(source); }
    if (external_id) { sql += ' AND external_id=?'; args.push(String(external_id)); }
    sql += ' ORDER BY id DESC LIMIT ' + Math.min(Number(limit) || 50, 500);
    const rows = await db.query(sql, args);
    if (full) {
      for (const r of rows) {
        try { r.payload = r.payload ? JSON.parse(r.payload) : null; } catch (e) {}
        try { r.raw_platform = r.raw_platform ? JSON.parse(r.raw_platform) : null; } catch (e) {}
      }
    }
    res.json(rows);
  } catch (e) { res.status(500).json({ ok: false, error: e.message }); }
});

// List of channel orders for admin
app.get('/api/external-orders', async (req, res) => {
  try {
    const { source = '', status = '', channel_state = '', search = '', from = '', to = '',
            limit = 25, offset = 0 } = req.query;
    const where = ['o.source IS NOT NULL'];
    const params = [];
    if (source) { where.push('o.source = ?'); params.push(source); }
    if (status) { where.push('o.status = ?'); params.push(status); }
    if (channel_state) { where.push('o.channel_state = ?'); params.push(channel_state); }
    if (search) {
      where.push('(o.order_no LIKE ? OR o.external_id LIKE ? OR o.customer_name LIKE ? OR o.customer_phone LIKE ?)');
      const s = '%' + search + '%';
      params.push(s, s, s, s);
    }
    if (from) { where.push(`${istDate('o.created_at')} >= ?`); params.push(from); }
    if (to)   { where.push(`${istDate('o.created_at')} <= ?`); params.push(to); }
    const whereSql = where.join(' AND ');
    const lim = Math.min(Math.max(parseInt(limit, 10) || 25, 1), 200);
    const off = Math.max(parseInt(offset, 10) || 0, 0);

    const totalRow = await db.query(`SELECT COUNT(*) AS c FROM orders o WHERE ${whereSql}`, params);
    const total = Number(totalRow[0]?.c || 0);
    const orders = await db.query(
      `SELECT o.*, t.name AS table_name FROM orders o LEFT JOIN tables t ON t.id = o.table_id
       WHERE ${whereSql} ORDER BY o.created_at DESC LIMIT ${lim} OFFSET ${off}`,
      params
    );
    res.json({ orders, total, limit: lim, offset: off });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message, orders: [], total: 0 });
  }
});

// ============= ASSETLINKS (for Android TWA - removes browser address bar) =============
app.get('/.well-known/assetlinks.json', (req, res) => {
  const p = path.join(__dirname, 'public', '.well-known', 'assetlinks.json');
  if (fs.existsSync(p)) res.sendFile(p);
  else res.status(404).json({ error: 'assetlinks not configured' });
});

// ============= STATIC + SPA =============
const clientBuild = path.join(__dirname, '..', 'client', 'dist');
app.use(express.static(clientBuild));
// Also serve server/public (for downloads + .well-known)
app.use(express.static(path.join(__dirname, 'public')));
app.get('*', (req, res) => {
  res.sendFile(path.join(clientBuild, 'index.html'));
});

// ============= START =============
const PORT = process.env.PORT || 3000;
(async () => {
  try {
    await initSchema();
    await seedData();
    await seedDefaultUser();
    app.listen(PORT, () => {
      console.log(`Restaurant POS running on port ${PORT} (db: ${usePostgres ? 'postgres' : 'sqlite'})`);
    });
  } catch (err) {
    console.error('Startup error:', err);
    process.exit(1);
  }
})();
 