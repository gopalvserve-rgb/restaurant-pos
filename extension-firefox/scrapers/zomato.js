// Zomato for Business - HYBRID order sync
// PRIMARY: poll the official Zomato merchant REST API for NEW/PREPARING/READY/DELIVERED order IDs
// FALLBACK: scrape DOM for item details (Zomato uses Emotion hashed CSS classes,
//           so we use position-based heuristics + text-pattern matching).
//
// Discovered endpoints (June 2026):
//   GET /merchant-api/orders/get-all?state=NEW&delivery_mode=delivery,takeaway
//     → returns { count, entities: [orderId, orderId, ...] }
//   Real-time push uses socket.io at cc2.zomato.com (production integration path)
(function () {
  'use strict';
  if (window.__RPOS_ZOMATO_LOADED__) return;
  window.__RPOS_ZOMATO_LOADED__ = true;

  const POLL_MS = 5000;
  const STATES = ['NEW', 'PREPARING', 'READY', 'DELIVERED'];
  const seenIds = new Set();

  async function apiFetch(state) {
    try {
      const r = await fetch(`https://www.zomato.com/merchant-api/orders/get-all?state=${state}&delivery_mode=delivery,takeaway`,
        { credentials: 'include', headers: { 'Accept': 'application/json' } });
      if (!r.ok) return [];
      const j = await r.json();
      return Array.isArray(j.entities) ? j.entities : [];
    } catch (e) { console.warn('[RPOS-Zomato] API err:', e.message); return []; }
  }

  // Try to find item details in the rendered DOM for a given orderId
  function tryReadDomDetails(orderId) {
    // Find any element whose text contains the order ID, then walk to a card-like ancestor
    const idStr = String(orderId);
    const matches = Array.from(document.querySelectorAll('*')).filter(el =>
      el.children.length === 0 && el.textContent && el.textContent.includes(idStr)
    );
    if (!matches.length) return null;
    let card = matches[0];
    for (let i = 0; i < 8; i++) {
      if (!card.parentElement) break;
      card = card.parentElement;
      const txt = card.textContent;
      if (txt.length > 60 && /₹|Rs\.?\s*\d/.test(txt)) {
        // Plausible card. Extract:
        const items = [];
        // Heuristic: text nodes shaped like "Nx Item Name ₹Price" or "1 x Foo ₹144"
        const lineRe = /(\d+)\s*[xX×]\s+([^₹Rs]+?)\s*[₹Rs.]+\s*(\d+(?:\.\d+)?)/g;
        let m;
        while ((m = lineRe.exec(txt)) !== null) {
          items.push({ qty: Number(m[1]), name: m[2].trim(), price: Number(m[3]) });
        }
        // Grand total: largest ₹ amount in card
        const allPrices = (txt.match(/[₹Rs.]+\s*(\d+(?:\.\d+)?)/g) || []).map(s => Number(s.replace(/[^\d.]/g, '')));
        const total = allPrices.length ? Math.max(...allPrices) : 0;
        return { items, total };
      }
    }
    return null;
  }

  async function scan() {
    const allIds = new Set();
    for (const state of STATES) {
      const ids = await apiFetch(state);
      ids.forEach(id => allIds.add(id));
    }
    for (const id of allIds) {
      if (seenIds.has(id)) continue;
      seenIds.add(id);
      const detail = tryReadDomDetails(id);
      const order = {
        source: 'zomato',
        external_id: String(id),
        customer: { name: '', phone: '' },
        items: detail?.items || [],
        total: detail?.total || 0,
        meta: { url: location.href, capturedAt: new Date().toISOString(), domDetails: !!detail }
      };
      console.log('[RPOS-Zomato] New order ID:', id, 'items:', order.items.length);
      // Only sync if we have items (avoid empty placeholder orders)
      if (order.items.length > 0) {
        chrome.runtime.sendMessage({ type: 'NEW_ORDER', order }, (resp) => {
          if (chrome.runtime.lastError) console.warn(chrome.runtime.lastError);
          else console.log('[RPOS-Zomato] Sync result:', resp);
        });
      } else {
        console.log('[RPOS-Zomato] Skipped - no items detected for', id, '(open the order in dashboard for details)');
      }
    }
  }

  setInterval(scan, POLL_MS);
  setTimeout(scan, 2000);
  console.log('[RPOS-Zomato v2] Order sync active (REST API + DOM hybrid)');
})();
