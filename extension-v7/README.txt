Restaurant POS Sync — v8.1 (Full Order Detail Edition) — updated 2026-07-07
=============================================

NEW IN v8
- Brands entity (cloud-kitchen friendly)
- Hierarchical menu: categories → subcategories → items → variants
- Reviews + ratings sync
- Sync EVERYTHING button (one click pulls brands → outlets → menu → reviews → orders)
- Auto-pull background mode (orders + reviews every minute)

HOW IT WORKS
1. Choose Zomato or Swiggy in dropdown
2. Click "🚀 Sync EVERYTHING" — pulls all data
3. Or use individual buttons: Brands / Outlets / Menu / Inventory / Orders / Reviews

INSTALL (Chrome)
1. Open chrome://extensions
2. Toggle "Developer mode" (top right)
3. Click "Load unpacked" → select this folder

DATA SAVED TO CRM
- /api/external-brands         (brand cards with logo, cuisine)
- /api/external-outlets-v2     (with lat/lng, rating, image, cloud-kitchen flag)
- /api/external-menu-v2        (categories+items+variants hierarchy, food-type, allergens)
- /api/external-reviews        (item-linked reviews with sentiment auto-tag)
- /api/external-order          (live orders, dedup by source+external_id)
- /api/external-inventory      (stock snapshot)

ENDPOINTS (Zomato discovered)
- Outlets: api.zomato.com/merchant-gw/web/restaurant/get-all-minimal-lite
- Menu:    www.zomato.com/php/online_ordering/menu_edit?action=get_content_menu
- Orders:  www.zomato.com/merchant-api/orders/get-all
- Reviews: www.zomato.com/merchant-api/feedback/list (tries multiple paths)
