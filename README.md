# Restaurant POS

A simple, modern Point-of-Sale system for restaurants — built with **Node.js + Express + React + PostgreSQL**.

## Features

- **POS Screen** — Browse menu by category, add items to cart, dine-in / takeaway toggle
- **Table Management** — Pick from 10 tables, auto-marks occupied / free
- **Order Management** — View open & closed orders, settle bills
- **KOT (Kitchen Order Ticket)** — Auto-prints to kitchen, mark items served
- **Invoicing** — Tax invoices with print-ready layout
- **Customer Details** — Capture name and phone on each order
- **Dashboard Stats** — Today's orders, revenue, open orders

## Tech Stack

- **Backend:** Node.js, Express, PostgreSQL (or SQLite locally)
- **Frontend:** React 18 + Vite
- **Deployment:** Railway (single-service deploy)

## Local Development

```bash
# Install everything
cd server && npm install
cd ../client && npm install

# Run backend (port 3000)
cd ../server && node index.js

# In another terminal, run frontend dev server (port 5173)
cd client && npm run dev
```

Visit `http://localhost:5173` for the dev UI, or `http://localhost:3000` for the served build.

When `DATABASE_URL` is not set, it falls back to a local SQLite file. Perfect for testing.

## Deploy to Railway

1. Push this repo to GitHub.
2. Create a new project on [Railway](https://railway.app).
3. **Deploy from GitHub repo** → pick your repo.
4. Click **+ New → Database → Add PostgreSQL**.
5. In your service's **Variables** tab, add a reference variable:
   - `DATABASE_URL` → `${{Postgres.DATABASE_URL}}`
6. In **Settings → Networking**, click **Generate Domain**.
7. Done — your POS is live!

## API Endpoints

| Method | Endpoint | Purpose |
|---|---|---|
| GET | `/api/health` | Health check |
| GET | `/api/stats` | Dashboard stats |
| GET | `/api/menu` | All menu items |
| GET | `/api/categories` | Menu categories |
| GET | `/api/tables` | Table list with status |
| GET | `/api/orders?status=open` | Orders by status |
| POST | `/api/orders` | Create order |
| POST | `/api/orders/:id/items` | Add items |
| POST | `/api/orders/:id/kot` | Send KOT to kitchen |
| POST | `/api/orders/:id/settle` | Settle and close |
| GET | `/api/kot` | Active KOT tickets |

## License

MIT
