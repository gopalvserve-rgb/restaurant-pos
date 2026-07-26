const DEFAULT_ENDPOINT = 'https://restaurant-pos-production-7d9d.up.railway.app';
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
        if (plat === 'zomato') {
          const states = ['NEW', 'ACCEPTED', 'PREPARING'];
          const all = [];
          for (const s of states) {
            const r = await fetch(`https://www.zomato.com/merchant-api/orders/get-all?state=${s}&delivery_mode=delivery,takeaway`, { credentials: 'include' });
            const j = await r.json();
            (j.entities || []).forEach(id => all.push({ id, state: s }));
          }
          return all;
        }
        return [];
      },
      args: [platform]
    });
    const orders = result[0]?.result || [];
    for (const o of orders) {
      await fetch(endpoint + '/api/external-order', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          source: platform, external_id: String(o.id),
          customer: {}, items: [], total: 0, meta: { state: o.state }
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
