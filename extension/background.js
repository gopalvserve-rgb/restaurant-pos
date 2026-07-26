// Background service worker - receives orders from content scripts and POSTs to POS
const DEFAULT_POS_URL = 'https://restaurant-pos-app-production.up.railway.app';

async function getConfig() {
  const c = await chrome.storage.local.get(['posUrl', 'apiKey', 'enabled', 'syncedIds']);
  return {
    posUrl: c.posUrl || DEFAULT_POS_URL,
    apiKey: c.apiKey || '',
    enabled: c.enabled !== false,
    syncedIds: c.syncedIds || []
  };
}

async function sendOrder(order) {
  const cfg = await getConfig();
  if (!cfg.enabled) return { ok: false, error: 'disabled' };
  if (cfg.syncedIds.includes(`${order.source}:${order.external_id}`)) {
    return { ok: true, deduped: true };
  }
  try {
    const res = await fetch(cfg.posUrl + '/api/external-order', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(cfg.apiKey ? { 'Authorization': 'Bearer ' + cfg.apiKey } : {})
      },
      body: JSON.stringify(order)
    });
    const data = await res.json();
    if (data.ok) {
      const ids = (await chrome.storage.local.get('syncedIds')).syncedIds || [];
      ids.unshift(`${order.source}:${order.external_id}`);
      await chrome.storage.local.set({ syncedIds: ids.slice(0, 500) });
      // Update badge
      const count = (await chrome.storage.local.get('syncedCount')).syncedCount || 0;
      const newCount = count + 1;
      await chrome.storage.local.set({ syncedCount: newCount, lastSyncAt: new Date().toISOString() });
      chrome.action.setBadgeText({ text: String(newCount) });
      chrome.action.setBadgeBackgroundColor({ color: '#d97706' });
      // Notify
      chrome.notifications.create('order-' + order.external_id, {
        type: 'basic',
        iconUrl: 'icons/icon128.png',
        title: `✓ ${order.source.toUpperCase()} order synced`,
        message: `${order.items?.length || 0} items · ₹${order.total || 0} · #${order.external_id}`,
        priority: 1
      });
    }
    return data;
  } catch (e) {
    console.error('POS sync failed:', e);
    return { ok: false, error: e.message };
  }
}

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.type === 'NEW_ORDER') {
    sendOrder(msg.order).then(sendResponse);
    return true; // async response
  }
  if (msg.type === 'GET_STATUS') {
    chrome.storage.local.get(['syncedCount', 'lastSyncAt', 'enabled', 'posUrl']).then(sendResponse);
    return true;
  }
  if (msg.type === 'RESET_COUNT') {
    chrome.storage.local.set({ syncedCount: 0, syncedIds: [] });
    chrome.action.setBadgeText({ text: '' });
    sendResponse({ ok: true });
    return true;
  }
});

chrome.runtime.onInstalled.addListener(async () => {
  await chrome.storage.local.set({ enabled: true, syncedCount: 0, syncedIds: [] });
  chrome.action.setBadgeBackgroundColor({ color: '#d97706' });
  console.log('Restaurant POS Order Sync installed.');
});
