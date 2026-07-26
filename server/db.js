// Universal DB layer: PostgreSQL on Railway (DATABASE_URL set) or SQLite locally.
const path = require('path');

const usePostgres = !!process.env.DATABASE_URL;
let db;

if (usePostgres) {
  const { Pool } = require('pg');
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.DATABASE_URL.includes('localhost') ? false : { rejectUnauthorized: false }
  });
  db = {
    type: 'pg',
    async query(sql, params = []) {
      let i = 0; const pgSql = sql.replace(/\?/g, () => `$${++i}`);
      const r = await pool.query(pgSql, params); return r.rows;
    },
    async run(sql, params = []) {
      let i = 0; const pgSql = sql.replace(/\?/g, () => `$${++i}`);
      const r = await pool.query(pgSql, params); return { rows: r.rows, rowCount: r.rowCount };
    },
    async exec(sql) { await pool.query(sql); }
  };
} else {
  const Database = require('better-sqlite3');
  const dbPath = process.env.SQLITE_PATH || path.join(__dirname, 'restaurant.db');
  const sqlite = new Database(dbPath);
  try { sqlite.pragma('journal_mode = WAL'); } catch (e) {}
  db = {
    type: 'sqlite',
    async query(sql, params = []) { return sqlite.prepare(sql).all(...params); },
    async run(sql, params = []) {
      const i = sqlite.prepare(sql).run(...params);
      return { rows: [], rowCount: i.changes, lastID: i.lastInsertRowid };
    },
    async exec(sql) { sqlite.exec(sql); }
  };
}

async function initSchema() {
  const SERIAL = usePostgres ? 'SERIAL PRIMARY KEY' : 'INTEGER PRIMARY KEY AUTOINCREMENT';
  const TS = usePostgres ? 'TIMESTAMP DEFAULT CURRENT_TIMESTAMP' : 'DATETIME DEFAULT CURRENT_TIMESTAMP';
  const TS_NULL = usePostgres ? 'TIMESTAMP' : 'DATETIME';

  await db.exec(`CREATE TABLE IF NOT EXISTS categories (
    id ${SERIAL}, name TEXT NOT NULL UNIQUE, sort_order INTEGER DEFAULT 0
  );`);

  await db.exec(`CREATE TABLE IF NOT EXISTS menu_items (
    id ${SERIAL}, name TEXT NOT NULL, category_id INTEGER,
    price NUMERIC(10,2) NOT NULL, tax_pct NUMERIC(5,2) DEFAULT 5,
    available INTEGER DEFAULT 1, description TEXT,
    image_url TEXT
  );`);

  await db.exec(`CREATE TABLE IF NOT EXISTS tables (
    id ${SERIAL}, name TEXT NOT NULL UNIQUE,
    capacity INTEGER DEFAULT 4, status TEXT DEFAULT 'free'
  );`);

  await db.exec(`CREATE TABLE IF NOT EXISTS customers (
    id ${SERIAL}, name TEXT NOT NULL, phone TEXT, email TEXT,
    address TEXT, loyalty_points INTEGER DEFAULT 0,
    total_orders INTEGER DEFAULT 0, total_spend NUMERIC(12,2) DEFAULT 0,
    last_visit_at ${TS_NULL}, notes TEXT,
    created_at ${TS}
  );`);

  await db.exec(`CREATE TABLE IF NOT EXISTS orders (
    id ${SERIAL}, order_no TEXT, type TEXT NOT NULL,
    table_id INTEGER, customer_id INTEGER,
    customer_name TEXT, customer_phone TEXT,
    status TEXT DEFAULT 'open',
    subtotal NUMERIC(10,2) DEFAULT 0, tax NUMERIC(10,2) DEFAULT 0,
    discount NUMERIC(10,2) DEFAULT 0, total NUMERIC(10,2) DEFAULT 0,
    payment_method TEXT,
    created_at ${TS}, closed_at ${TS_NULL}
  );`);

  await db.exec(`CREATE TABLE IF NOT EXISTS order_items (
    id ${SERIAL}, order_id INTEGER NOT NULL, menu_item_id INTEGER NOT NULL,
    name TEXT NOT NULL, qty INTEGER NOT NULL DEFAULT 1,
    price NUMERIC(10,2) NOT NULL, tax_pct NUMERIC(5,2) DEFAULT 5,
    notes TEXT, status TEXT DEFAULT 'pending'
  );`);

  await db.exec(`CREATE TABLE IF NOT EXISTS kot_tickets (
    id ${SERIAL}, order_id INTEGER NOT NULL, kot_no TEXT,
    status TEXT DEFAULT 'pending', created_at ${TS}
  );`);

  await db.exec(`CREATE TABLE IF NOT EXISTS kot_items (
    id ${SERIAL}, kot_id INTEGER NOT NULL, order_item_id INTEGER NOT NULL,
    name TEXT NOT NULL, qty INTEGER NOT NULL, notes TEXT
  );`);

  // ---- INVENTORY ----
  await db.exec(`CREATE TABLE IF NOT EXISTS inventory_items (
    id ${SERIAL}, name TEXT NOT NULL, sku TEXT, unit TEXT DEFAULT 'unit',
    category TEXT DEFAULT 'general',
    current_stock NUMERIC(12,3) DEFAULT 0,
    low_stock_threshold NUMERIC(12,3) DEFAULT 5,
    last_purchase_price NUMERIC(10,2) DEFAULT 0,
    supplier TEXT,
    created_at ${TS}
  );`);

  await db.exec(`CREATE TABLE IF NOT EXISTS inventory_transactions (
    id ${SERIAL}, item_id INTEGER NOT NULL,
    type TEXT NOT NULL,
    qty NUMERIC(12,3) NOT NULL,
    unit_price NUMERIC(10,2) DEFAULT 0,
    reason TEXT, reference_no TEXT,
    created_at ${TS}
  );`);

  // ---- SHOPS / OUTLETS ----
  await db.exec(`CREATE TABLE IF NOT EXISTS shops (
    id ${SERIAL}, name TEXT NOT NULL, address TEXT, phone TEXT,
    gst_no TEXT, is_active INTEGER DEFAULT 1,
    created_at ${TS}
  );`);

  // ---- ORDER TRACKING ----
  await db.exec(`CREATE TABLE IF NOT EXISTS order_tracking (
    id ${SERIAL}, order_id INTEGER NOT NULL,
    status TEXT NOT NULL,
    note TEXT,
    created_at ${TS}
  );`);

  // ---- SETTINGS (key/value) ----
  await db.exec(`CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT
  );`);

  // ---- VARIANTS (item sizes/types) ----
  await db.exec(`CREATE TABLE IF NOT EXISTS menu_variants (
    id ${SERIAL}, menu_item_id INTEGER NOT NULL,
    name TEXT NOT NULL, price NUMERIC(10,2) NOT NULL,
    sort_order INTEGER DEFAULT 0, is_default INTEGER DEFAULT 0
  );`);

  // ---- MODIFIER GROUPS ----
  await db.exec(`CREATE TABLE IF NOT EXISTS modifier_groups (
    id ${SERIAL}, name TEXT NOT NULL,
    selection_type TEXT DEFAULT 'multiple',
    is_required INTEGER DEFAULT 0,
    min_select INTEGER DEFAULT 0, max_select INTEGER DEFAULT 99
  );`);

  // ---- MODIFIERS (options inside groups) ----
  await db.exec(`CREATE TABLE IF NOT EXISTS modifiers (
    id ${SERIAL}, group_id INTEGER NOT NULL,
    name TEXT NOT NULL, price NUMERIC(10,2) DEFAULT 0,
    sort_order INTEGER DEFAULT 0
  );`);

  // ---- LINK menu items <-> modifier groups ----
  await db.exec(`CREATE TABLE IF NOT EXISTS menu_item_modifiers (
    menu_item_id INTEGER NOT NULL,
    group_id INTEGER NOT NULL,
    PRIMARY KEY (menu_item_id, group_id)
  );`);

  // ---- COMBOS ----
  await db.exec(`CREATE TABLE IF NOT EXISTS combos (
    id ${SERIAL}, name TEXT NOT NULL, description TEXT,
    price NUMERIC(10,2) NOT NULL, tax_pct NUMERIC(5,2) DEFAULT 5,
    category_id INTEGER, available INTEGER DEFAULT 1,
    image_url TEXT
  );`);

  await db.exec(`CREATE TABLE IF NOT EXISTS combo_items (
    id ${SERIAL}, combo_id INTEGER NOT NULL,
    menu_item_id INTEGER, category_id INTEGER,
    qty INTEGER DEFAULT 1
  );`);

  // ---- USERS (login + roles) ----
  await db.exec(`CREATE TABLE IF NOT EXISTS users (
    id ${SERIAL}, username TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    full_name TEXT, role TEXT NOT NULL DEFAULT 'cashier',
    is_active INTEGER DEFAULT 1,
    created_at ${TS}
  );`);

  // ---- RECIPES (links menu items to inventory ingredients) ----
  await db.exec(`CREATE TABLE IF NOT EXISTS recipes (
    id ${SERIAL}, menu_item_id INTEGER NOT NULL,
    inventory_item_id INTEGER NOT NULL,
    qty NUMERIC(12,3) NOT NULL,
    notes TEXT
  );`);

  // Raw integration payload log — captures the COMPLETE payload received from the
  // browser extension (and the original platform JSON) for debugging/monitoring.
  await db.exec(`CREATE TABLE IF NOT EXISTS integration_logs (
    id ${SERIAL},
    source TEXT,
    external_id TEXT,
    endpoint TEXT,
    outcome TEXT,
    items_count INTEGER DEFAULT 0,
    total NUMERIC(12,2) DEFAULT 0,
    customer_name TEXT,
    payload TEXT,
    raw_platform TEXT,
    created_at ${TS}
  );`);

  // Ensure customer_id exists on orders (older tables may not have it)
  try { await db.exec(`ALTER TABLE orders ADD COLUMN customer_id INTEGER`); } catch(e) {}

  // External-source columns on orders (Swiggy/Zomato/Dunzo etc.) - idempotent
  try { await db.exec(`ALTER TABLE orders ADD COLUMN source TEXT`); } catch(e) {}
  try { await db.exec(`ALTER TABLE orders ADD COLUMN external_id TEXT`); } catch(e) {}
  try { await db.exec(`ALTER TABLE orders ADD COLUMN source_meta TEXT`); } catch(e) {}
  // Live channel lifecycle state from Zomato/Swiggy (placed/preparing/ready/picked_up/delivered)
  try { await db.exec(`ALTER TABLE orders ADD COLUMN channel_state TEXT`); } catch(e) {}
  try { await db.exec(`ALTER TABLE orders ADD COLUMN channel_state_raw TEXT`); } catch(e) {}

  // Extend order_items with variant + modifier columns (idempotent via try/catch)
  try { await db.exec(`ALTER TABLE order_items ADD COLUMN variant_id INTEGER`); } catch(e) {}
  try { await db.exec(`ALTER TABLE order_items ADD COLUMN variant_name TEXT`); } catch(e) {}
  try { await db.exec(`ALTER TABLE order_items ADD COLUMN modifiers_json TEXT`); } catch(e) {}
  try { await db.exec(`ALTER TABLE order_items ADD COLUMN combo_id INTEGER`); } catch(e) {}
  await initSchemaV8(db, usePostgres);
}

async function seedData() {
  // Categories
  const cats = await db.query('SELECT COUNT(*) as c FROM categories', []);
  if (Number(cats[0]?.c ?? cats[0]?.count ?? 0) === 0) {
    const categories = ['Starters', 'Main Course', 'Breads', 'Rice & Biryani', 'Beverages', 'Desserts'];
    for (let i = 0; i < categories.length; i++) {
      await db.run('INSERT INTO categories (name, sort_order) VALUES (?, ?)', [categories[i], i]);
    }
    const items = [
      ['Paneer Tikka', 1, 220, 5], ['Veg Spring Roll', 1, 180, 5],
      ['Chicken 65', 1, 280, 5], ['Hara Bhara Kebab', 1, 200, 5],
      ['Paneer Butter Masala', 2, 280, 5], ['Dal Makhani', 2, 240, 5],
      ['Butter Chicken', 2, 340, 5], ['Veg Kofta', 2, 260, 5],
      ['Butter Naan', 3, 50, 5], ['Garlic Naan', 3, 60, 5],
      ['Tandoori Roti', 3, 30, 5],
      ['Veg Biryani', 4, 220, 5], ['Chicken Biryani', 4, 280, 5],
      ['Jeera Rice', 4, 150, 5],
      ['Masala Chai', 5, 40, 5], ['Fresh Lime Soda', 5, 80, 5],
      ['Cold Coffee', 5, 120, 5],
      ['Gulab Jamun', 6, 100, 5], ['Ice Cream', 6, 120, 5]
    ];
    for (const [name, cat, price, tax] of items) {
      await db.run('INSERT INTO menu_items (name, category_id, price, tax_pct, available) VALUES (?, ?, ?, ?, 1)', [name, cat, price, tax]);
    }
  }

  // Tables
  const t = await db.query('SELECT COUNT(*) as c FROM tables', []);
  if (Number(t[0]?.c ?? t[0]?.count ?? 0) === 0) {
    for (let i = 1; i <= 10; i++) {
      await db.run('INSERT INTO tables (name, capacity, status) VALUES (?, ?, ?)', [`T${i}`, 4, 'free']);
    }
  }

  // Inventory
  const inv = await db.query('SELECT COUNT(*) as c FROM inventory_items', []);
  if (Number(inv[0]?.c ?? inv[0]?.count ?? 0) === 0) {
    const data = [
      ['Paneer', 'PANEER001', 'kg', 'raw', 5, 2, 320, 'Local Dairy'],
      ['Chicken', 'CHKN001', 'kg', 'raw', 8, 3, 280, 'Fresh Meat Co'],
      ['Tomato', 'VEG001', 'kg', 'raw', 10, 4, 40, 'Local Market'],
      ['Onion', 'VEG002', 'kg', 'raw', 15, 5, 30, 'Local Market'],
      ['Basmati Rice', 'RICE001', 'kg', 'raw', 20, 8, 110, 'Wholesale'],
      ['Cooking Oil', 'OIL001', 'L', 'raw', 12, 4, 140, 'Wholesale'],
      ['Wheat Flour', 'FLR001', 'kg', 'raw', 18, 6, 45, 'Wholesale'],
      ['Sugar', 'SGR001', 'kg', 'raw', 8, 3, 42, 'Wholesale'],
      ['Tea Leaves', 'TEA001', 'kg', 'raw', 3, 1, 380, 'Local Market'],
      ['Coffee Beans', 'COF001', 'kg', 'raw', 2, 1, 650, 'Specialty Co'],
      ['Coca-Cola 250ml', 'BEV001', 'bottle', 'finished', 48, 12, 18, 'Beverage Dist'],
      ['Water Bottle', 'BEV002', 'bottle', 'finished', 60, 24, 12, 'Beverage Dist']
    ];
    for (const r of data) {
      await db.run('INSERT INTO inventory_items (name, sku, unit, category, current_stock, low_stock_threshold, last_purchase_price, supplier) VALUES (?,?,?,?,?,?,?,?)', r);
    }
  }

  // Shops
  const shops = await db.query('SELECT COUNT(*) as c FROM shops', []);
  if (Number(shops[0]?.c ?? shops[0]?.count ?? 0) === 0) {
    await db.run('INSERT INTO shops (name, address, phone, gst_no, is_active) VALUES (?,?,?,?,1)',
      ['Main Outlet', 'Shop No. 1, Main Street, City', '+91-9876543210', '22AAAAA0000A1Z5']);
  }

  // Settings
  const st = await db.query('SELECT COUNT(*) as c FROM settings', []);
  if (Number(st[0]?.c ?? st[0]?.count ?? 0) === 0) {
    const settings = [
      ['restaurant_name', 'Restaurant POS'],
      ['restaurant_address', 'Shop No. 1, Main Street, City'],
      ['restaurant_phone', '+91-9876543210'],
      ['restaurant_email', 'gopalvserve@gmail.com'],
      ['gst_no', '22AAAAA0000A1Z5'],
      ['currency', 'INR'],
      ['currency_symbol', 'Rs.'],
      ['default_tax_pct', '5'],
      ['apk_download_url', '/downloads/restaurant-pos.apk'],
      ['bill_footer', 'Thank you! Visit again.']
    ];
    for (const [k, v] of settings) {
      await db.run('INSERT INTO settings (key, value) VALUES (?, ?)', [k, v]);
    }
  }
}


async function seedDefaultUser() {
  const bcrypt = require('bcryptjs');
  const exist = await db.query('SELECT COUNT(*) as c FROM users', []);
  if (Number(exist[0]?.c ?? exist[0]?.count ?? 0) > 0) return;
  const hash = await bcrypt.hash('admin123', 10);
  await db.run('INSERT INTO users (username, password_hash, full_name, role) VALUES (?,?,?,?)',
    ['admin', hash, 'Owner', 'owner']);
  console.log('Seed default admin: username=admin password=admin123');
}


// v8 schema: brands, expanded outlets/categories/menu, reviews
async function initSchemaV8(db, isPg) {
  const IFNE = isPg ? 'IF NOT EXISTS' : 'IF NOT EXISTS';
  const PK = isPg ? 'SERIAL PRIMARY KEY' : 'INTEGER PRIMARY KEY AUTOINCREMENT';
  const NOW = isPg ? 'CURRENT_TIMESTAMP' : "(datetime('now'))";

  // Brands table
  await db.exec(`CREATE TABLE ${IFNE} brands (
    id ${PK},
    name VARCHAR(200) UNIQUE,
    slug VARCHAR(200),
    logo_url TEXT,
    cuisine VARCHAR(200),
    primary_color VARCHAR(20) DEFAULT '#ff6b35',
    external_id VARCHAR(100),
    source VARCHAR(30),
    description TEXT,
    is_cloud_kitchen INTEGER DEFAULT 0,
    rating REAL DEFAULT 0,
    total_reviews INTEGER DEFAULT 0,
    created_at TIMESTAMP DEFAULT ${NOW}
  )`);

  // Reviews table
  await db.exec(`CREATE TABLE ${IFNE} reviews (
    id ${PK},
    source VARCHAR(30),
    external_id VARCHAR(200),
    brand_id INTEGER,
    outlet_id INTEGER,
    menu_item_id INTEGER,
    order_id VARCHAR(100),
    customer_name VARCHAR(200),
    customer_phone VARCHAR(30),
    rating REAL,
    review_text TEXT,
    is_replied INTEGER DEFAULT 0,
    reply_text TEXT,
    sentiment VARCHAR(20),
    review_date TIMESTAMP,
    created_at TIMESTAMP DEFAULT ${NOW}
  )`);

  // Extend shops with brand + metadata
  const shopCols = [
    'brand_id INTEGER',
    'external_id VARCHAR(100)',
    'source VARCHAR(30)',
    'city VARCHAR(100)',
    'area VARCHAR(150)',
    'lat REAL',
    'lng REAL',
    'image_url TEXT',
    'rating REAL DEFAULT 0',
    'total_reviews INTEGER DEFAULT 0',
    'is_cloud_kitchen INTEGER DEFAULT 0',
    'opens_at VARCHAR(20)',
    'closes_at VARCHAR(20)',
    'cuisine VARCHAR(200)',
    'avg_cost INTEGER',
    'rating_source VARCHAR(30)'
  ];
  for (const c of shopCols) {
    try { await db.exec(`ALTER TABLE shops ADD COLUMN ${c}`); } catch (e) {}
  }

  // Extend categories
  const catCols = [
    'brand_id INTEGER',
    'parent_id INTEGER',
    'image_url TEXT',
    'external_id VARCHAR(100)',
    'source VARCHAR(30)',
    'description TEXT'
  ];
  for (const c of catCols) {
    try { await db.exec(`ALTER TABLE categories ADD COLUMN ${c}`); } catch (e) {}
  }

  // Extend menu_items
  const itemCols = [
    'brand_id INTEGER',
    'subcategory_id INTEGER',
    'slug VARCHAR(300)',
    'food_type VARCHAR(20)',
    'is_recommended INTEGER DEFAULT 0',
    'is_bestseller INTEGER DEFAULT 0',
    'is_spicy INTEGER DEFAULT 0',
    'prep_time INTEGER',
    'allergen_info VARCHAR(500)',
    'calorie_info INTEGER',
    'rating REAL DEFAULT 0',
    'review_count INTEGER DEFAULT 0',
    'external_id VARCHAR(100)',
    'source VARCHAR(30)',
    'external_data TEXT',
    'long_description TEXT',
    'serves INTEGER'
  ];
  for (const c of itemCols) {
    try { await db.exec(`ALTER TABLE menu_items ADD COLUMN ${c}`); } catch (e) {}
  }

  // Extend menu_variants
  try { await db.exec(`ALTER TABLE menu_variants ADD COLUMN external_id VARCHAR(100)`); } catch (e) {}
  try { await db.exec(`ALTER TABLE menu_variants ADD COLUMN image_url TEXT`); } catch (e) {}
  try { await db.exec(`ALTER TABLE menu_variants ADD COLUMN sort_order INTEGER DEFAULT 0`); } catch (e) {}

  console.log('[v8] schema migrations applied');
}

module.exports = { db, initSchema, seedData, seedDefaultUser, usePostgres };
