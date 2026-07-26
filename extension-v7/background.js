const DEFAULT_ENDPOINT = 'https://restaurant-pos-app-production.up.railway.app';
const PLATFORM_URLS = {
  zomato: 'https://www.zomato.com/partners/onlineordering/orders/',
  swiggy: 'https://partner.swiggy.com/food/orders'
};

chrome.runtime.onInstalled.addListener(() => {
  console.log('Restaurant POS Sync v7 installed');
  chrome.storage.local.get(['endpoint', 'platform'], (cfg) => {
    if (!cfg.endpoint) chrome.storage.local.set({ endpoint: DEFAULT_ENDPOINT });
    if (!cfg.platform) chrome.storage.local.set({ platform: 'zomato' });
  });
});

chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name !== 'autopull') return;
  const cfg = await chrome.storage.local.get(['endpoint', 'platform', 'polling']);
  if (!cfg.polling) return;
  const platform = cfg.platform || 'zomato';
  const endpoint = cfg.endpoint || DEFAULT_ENDPOINT;
  const domain = platform === 'zomato' ? 'zomato.com' : 'partner.swiggy.com';

  const tabs = await chrome.tabs.query({});
  const tab = tabs.find(t => t.url && t.url.includes(domain));
  if (!tab) return;

  try {
    const result = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      world: 'MAIN',
      func: async (plat) => {
        if (plat !== 'zomato') return [];
        // === VERIFIED Zomato mapping (get-all -> IDs; order-details?tab_id=ID -> {order}) ===
        const num = (v) => { const n = Number(v); return isNaN(n) ? 0 : n; };
        const mapOrder = (o, id, listState) => {
          const cd = o.cartDetails || {};
          const dishes = (cd.items && cd.items.dishes) || [];
          const items = (Array.isArray(dishes) ? dishes : []).map(d => ({
            name: d.name || 'Item', qty: num(d.quantity) || 1,
            price: num(d.dishUnitCost != null ? d.dishUnitCost : d.unitCost)
          }));
          const subtotal = num(cd.subtotal && cd.subtotal.amountDetails && cd.subtotal.amountDetails.amountTotalCost);
          const total = num(cd.total && cd.total.amountDetails && cd.total.amountDetails.amountTotalCost) || subtotal;
          const creator = o.creator || {};
          return { id: String(id), state: o.state || listState,
            customer: { name: creator.name || creator.originalName || '', phone: '' },
            items, total,
            meta: { display_id: o.displayId || '', delivery_mode: o.deliveryMode || '', payment_type: (o.paymentDetails && o.paymentDetails.paymentType) || '' } };
        };
        const fetchDetail = async (id) => {
          try { const r = await fetch(`https://www.zomato.com/merchant-api/orders/order-details?tab_id=${id}`, { credentials: 'include' }); if (!r.ok) return null; const j = await r.json(); return (j && j.order) ? j.order : null; } catch (e) { return null; }
        };
        const states = ['NEW', 'ACCEPTED', 'PREPARING'];
        const seen = new Set();
        const all = [];
        for (const s of states) {
          let j = { entities: [] };
          try { j = await (await fetch(`https://www.zomato.com/merchant-api/orders/get-all?state=${s}&delivery_mode=delivery,takeaway`, { credentials: 'include' })).json(); } catch (e) {}
          for (const id of (j.entities || [])) {
            if (seen.has(id)) continue; seen.add(id);
            const order = await fetchDetail(id);
            all.push(order ? mapOrder(order, id, s) : { id: String(id), state: s, customer: {}, items: [], total: 0 });
          }
        }
        return all;
      },
      args: [platform]
    });
    const orders = result[0]?.result || [];
    for (const o of orders) {
      await fetch(endpoint + '/api/external-order', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          source: platform, external_id: String(o.id),
          customer: o.customer || {}, items: o.items || [], total: o.total || 0, meta: { state: o.state }
        })
      }).catch(() => {});
    }
    if (orders.length) {
      chrome.notifications.create({
        type: 'basic',
        iconUrl: 'icons/icon128.png',
        title: 'New orders synced',
        message: `${orders.length} ${platform} orders pushed to CRM`
      });
    }
  } catch (e) {
    console.error('autopull failed', e);
  }
});
