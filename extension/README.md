# Restaurant POS — Chrome Extension

Captures orders from **Swiggy Partner** & **Zomato for Business** dashboards and syncs them to your Restaurant POS in real time, with auto-KOT and recipe-based inventory deduction.

## Install (Unpacked)

1. Open Chrome → `chrome://extensions`
2. Toggle **Developer mode** (top-right)
3. Click **Load unpacked** → select this folder
4. Click the extension icon → set your POS URL (default works) → Save
5. Log in to your Swiggy Partner or Zomato for Business dashboard
6. Orders are detected every 5 seconds and synced automatically

## ⚠️ Important caveats

- **DOM-based scraping**: Swiggy/Zomato change their UI frequently. If sync stops working, selectors need updating in `scrapers/swiggy.js` / `scrapers/zomato.js`.
- **ToS**: Both platforms technically forbid scraping their partner UI. This is fine for internal use / pilot, **not safe to publish on Chrome Web Store**.
- **Production**: For 20+ outlets, switch to **UrbanPiper API** or apply for direct **Swiggy/Zomato POS Partner** approval (legit + reliable).

## What it does

- Polls the partner dashboard every 5s
- Detects new order cards by their unique IDs (dedup via local storage + server)
- POSTs to `<POS_URL>/api/external-order` with `{ source, external_id, items, customer, total }`
- Backend fuzzy-matches item names to your menu, creates the order, auto-sends KOT, deducts recipe ingredients
- Shows a desktop notification per synced order

## Files

```
extension/
├── manifest.json
├── background.js     # Service worker - POSTs to your POS API
├── popup.html/js     # Settings UI
├── scrapers/
│   ├── swiggy.js     # DOM scraper for Swiggy Partner
│   └── zomato.js     # DOM scraper for Zomato for Business
└── icons/
```

## Selector tuning

If Swiggy/Zomato changes their HTML, update the `DEFAULTS` object at the top of `scrapers/swiggy.js` / `scrapers/zomato.js`. Or set custom overrides via DevTools:
```js
chrome.storage.local.set({ swiggySelectors: { orderCard: '.my-new-selector', /*...*/ } })
```

## API contract

```http
POST /api/external-order
Content-Type: application/json

{
  "source": "swiggy",
  "external_id": "SW123456",
  "customer": { "name": "Rahul K", "phone": "" },
  "items": [
    { "name": "Paneer Tikka", "qty": 2, "price": 220 },
    { "name": "Butter Naan", "qty": 3, "price": 50 }
  ],
  "total": 590,
  "meta": { "url": "https://partner.swiggy.com/...", "capturedAt": "..." }
}
```

Returns `{ ok: true, order_id, order_no }` or `{ ok: true, deduped: true }` if already seen.
