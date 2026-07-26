// Swiggy Partner dashboard scraper.
// IMPORTANT: Swiggy's UI changes frequently. Selectors are best-effort and may need updating.
// The script supports user-overridable selectors via chrome.storage.local.swiggySelectors.
(function () {
  'use strict';
  if (window.__RPOS_SWIGGY_LOADED__) return;
  window.__RPOS_SWIGGY_LOADED__ = true;

  const POLL_MS = 5000;
  const seenIds = new Set();

  const DEFAULTS = {
    // CSS selectors that may need updating as Swiggy changes UI
    orderCard: '[data-testid*="order-card"], [class*="OrderCard"], [data-order-id], [class*="order-item-card"]',
    orderId: '[class*="order-id"], [data-test*="order-id"], [class*="orderId"]',
    customerName: '[class*="customer-name"], [data-test*="customer"]',
    itemRow: '[class*="item-row"], [class*="OrderItem"], li[class*="item"]',
    itemName: '[class*="item-name"], [class*="ItemName"]',
    itemQty: '[class*="item-qty"], [class*="quantity"]',
    itemPrice: '[class*="item-price"], [class*="ItemPrice"]',
    totalAmount: '[class*="grand-total"], [class*="total-amount"], [class*="GrandTotal"]'
  };

  let SEL = { ...DEFAULTS };

  chrome.storage.local.get('swiggySelectors', (v) => {
    if (v.swiggySelectors) SEL = { ...DEFAULTS, ...v.swiggySelectors };
  });

  function text(el, sel) {
    const found = el.querySelector(sel);
    return found ? found.textContent.trim() : '';
  }
  function num(s) {
    const m = String(s || '').replace(/[^\d.]/g, '');
    return m ? Number(m) : 0;
  }

  function extractOrder(card) {
    const idRaw = text(card, SEL.orderId) || card.getAttribute('data-order-id') || '';
    const external_id = idRaw.replace(/[^A-Za-z0-9]/g, '');
    if (!external_id) return null;

    const customer = { name: text(card, SEL.customerName), phone: '' };

    const items = [];
    card.querySelectorAll(SEL.itemRow).forEach(row => {
      const name = text(row, SEL.itemName);
      if (!name) return;
      const qty = num(text(row, SEL.itemQty)) || 1;
      const price = num(text(row, SEL.itemPrice));
      items.push({ name, qty, price });
    });

    const total = num(text(card, SEL.totalAmount));

    return { source: 'swiggy', external_id, customer, items, total,
             meta: { url: location.href, capturedAt: new Date().toISOString() } };
  }

  function scan() {
    const cards = document.querySelectorAll(SEL.orderCard);
    let newCount = 0;
    cards.forEach(card => {
      const order = extractOrder(card);
      if (!order || !order.external_id) return;
      if (seenIds.has(order.external_id)) return;
      if (order.items.length === 0) return;
      seenIds.add(order.external_id);
      newCount++;
      console.log('[RPOS-Swiggy] New order:', order);
      chrome.runtime.sendMessage({ type: 'NEW_ORDER', order }, (resp) => {
        if (chrome.runtime.lastError) console.warn(chrome.runtime.lastError);
        else console.log('[RPOS-Swiggy] Sync result:', resp);
      });
    });
    if (newCount) console.log(`[RPOS-Swiggy] Synced ${newCount} new orders`);
  }

  setInterval(scan, POLL_MS);
  setTimeout(scan, 1500);
  console.log('[RPOS-Swiggy] Order sync active on', location.hostname);
})();
