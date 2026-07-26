const DEFAULT_ENDPOINT = 'https://restaurant-pos-production-7d9d.up.railway.app';

const PLATFORM_URLS = {
  zomato: 'https://www.zomato.com/partners/onlineordering/orders/',
  swiggy: 'https://partner.swiggy.com/food/orders'
};

const $ = id => document.getElementById(id);

async function init() {
  const cfg = await chrome.storage.local.get(['endpoint', 'platform', 'polling']);
  $('endpoint').value = cfg.endpoint || DEFAULT_ENDPOINT;
  $('platform').value = cfg.platform || 'zomato';
  updateFoot();
  if (cfg.polling) {
    $('pollOn').textContent = '⏸ Stop Auto-Pull';
  }
}

function updateFoot() {
  $('footPlatform').textContent = $('platform').value === 'zomato' ? 'Zomato' : 'Swiggy';
}

function log(msg, cls = 'info') {
  const d = document.createElement('div');
  d.className = 'line ' + cls;
  d.textContent = msg;
  $('status').appendChild(d);
  $('status').scrollTop = $('status').scrollHeight;
}

function setBusy(busy) {
  document.querySelectorAll('button').forEach(b => b.disabled = busy);
  $('footState').textContent = busy ? 'syncing…' : 'idle';
}

async function ensureTab(platform) {
  const tabs = await chrome.tabs.query({});
  const url = PLATFORM_URLS[platform];
  const domain = platform === 'zomato' ? 'zomato.com' : 'partner.swiggy.com';
  let tab = tabs.find(t => t.url && t.url.includes(domain));
  if (!tab) {
    log(`Opening ${platform} portal…`, 'info');
    tab = await chrome.tabs.create({ url, active: false });
    await new Promise(r => setTimeout(r, 5000));
  }
  return tab;
}

async function runScraper(scraperFn) {
  const platform = $('platform').value;
  const endpoint = $('endpoint').value.replace(/\/$/, '');
  await chrome.storage.local.set({ platform, endpoint });

  const tab = await ensureTab(platform);

  setBusy(true);
  try {
    const result = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      world: 'MAIN',
      func: scraperFn,
      args: [platform]
    });
    return { data: result[0]?.result, tab, endpoint, platform };
  } finally {
    setBusy(false);
  }
}

// ============= Scrapers (injected into the page) =============
function scrapeOutlets(platform) {
  if (platform === 'zomato') {
    return fetch('https://api.zomato.com/merchant-gw/web/restaurant/get-all-minimal-lite', {
      credentials: 'include',
      headers: { 'Accept': 'application/json' }
    })
      .then(r => r.json())
      .then(j => {
        const list = j.response?.data || j.data || j.restaurants || [];
        return list.map(o => ({
          external_id: String(o.id || o.res_id || ''),
          name: o.name || o.restaurant_name || 'Unknown',
          address: [o.subzone, o.city].filter(Boolean).join(', '),
          phone: o.phone || '',
          is_active: o.delivery_status === 'ON' || o.is_online === 1
        })).filter(o => o.external_id);
      })
      .catch(e => ({ error: e.message }));
  }
  // Swiggy
  return fetch('https://partner.swiggy.com/api/owner/auth/v2/user-data', {
    credentials: 'include',
    headers: { 'Accept': 'application/json' }
  })
    .then(r => r.json())
    .then(j => {
      const list = j.data?.restaurants || j.restaurants || [];
      return list.map(r => ({
        external_id: String(r.id || r.restaurant_id || ''),
        name: r.name || r.restaurant_name || 'Unknown',
        address: r.address || '',
        phone: '',
        is_active: r.status === 1 || r.online === true
      })).filter(o => o.external_id);
    })
    .catch(e => ({ error: e.message }));
}

function scrapeMenu(platform) {
  if (platform === 'zomato') {
    return fetch('https://api.zomato.com/merchant-gw/web/restaurant/get-all-minimal-lite', { credentials: 'include' })
      .then(r => r.json())
      .then(async j => {
        const outlets = (j.response?.data || j.data || []).slice(0, 1);
        const all = [];
        for (const o of outlets) {
          const m = await fetch(`https://www.zomato.com/php/online_ordering/menu_edit?action=get_content_menu&res_id=${o.id}&service_role=DELIVERY_TAKEAWAY`, { credentials: 'include' })
            .then(r => r.json()).catch(() => null);
          if (!m) continue;
          const cats = m.categories || m.menu_categories || m.menu || [];
          for (const c of cats) {
            const items = c.items || c.menu_items || [];
            for (const it of items) {
              all.push({
                external_id: String(it.id || it.item_id || ''),
                name: it.name || it.item_name || 'Item',
                price: Number(it.price || it.cost || 0),
                tax_pct: Number(it.tax_pct || 5),
                available: it.in_stock !== 0 && it.is_available !== 0,
                description: it.description || '',
                outlet_id: o.id
              });
            }
          }
        }
        return all;
      })
      .catch(e => ({ error: e.message }));
  }
  // Swiggy
  return fetch('https://partner.swiggy.com/api/owner/menu/v2/categories', { credentials: 'include' })
    .then(r => r.json())
    .then(j => {
      const cats = j.data?.categories || j.categories || [];
      const items = [];
      for (const c of cats) {
        for (const it of (c.items || c.menu_items || [])) {
          items.push({
            external_id: String(it.item_id || it.id || ''),
            name: it.item_name || it.name || 'Item',
            price: Number(it.price || 0) / 100,
            tax_pct: Number(it.gst_details?.igst || 5),
            available: it.in_stock !== false,
            description: it.item_description || ''
          });
        }
      }
      return items;
    })
    .catch(e => ({ error: e.message }));
}

function scrapeOrders(platform) {
  if (platform === 'zomato') {
    const states = ['NEW', 'ACCEPTED', 'PREPARING', 'READY', 'DISPATCHED', 'DELIVERED'];
    return Promise.all(states.map(s =>
      fetch(`https://www.zomato.com/merchant-api/orders/get-all?state=${s}&delivery_mode=delivery,takeaway`, { credentials: 'include' })
        .then(r => r.json()).catch(() => ({ entities: [] }))
    )).then(results => {
      const orderIds = new Set();
      results.forEach((r, idx) => (r.entities || []).forEach(id => orderIds.add(`${states[idx]}:${id}`)));
      return Array.from(orderIds).slice(0, 50).map(s => {
        const [state, id] = s.split(':');
        return { external_id: id, state, source: 'zomato', items: [], total: 0, customer: {} };
      });
    });
  }
  // Swiggy
  return fetch('https://partner.swiggy.com/api/restaurant/orders/list?page=1&size=50', { credentials: 'include' })
    .then(r => r.json())
    .then(j => {
      const orders = j.data?.orders || j.orders || [];
      return orders.map(o => ({
        external_id: String(o.order_id || o.id),
        state: o.status,
        source: 'swiggy',
        total: Number(o.order_total || 0),
        customer: { name: o.customer_name || '', phone: o.customer_phone || '' },
        items: (o.order_items || []).map(i => ({ name: i.name, qty: i.quantity, price: i.unit_price }))
      }));
    })
    .catch(e => ({ error: e.message }));
}

// ============= Button handlers =============
$('platform').addEventListener('change', () => {
  chrome.storage.local.set({ platform: $('platform').value });
  updateFoot();
});

$('syncOutlets').addEventListener('click', async () => {
  log(`Syncing outlets from ${$('platform').value}…`, 'info');
  const { data, endpoint, platform } = await runScraper(scrapeOutlets);
  if (!data || data.error) { log('Error: ' + (data?.error || 'no data'), 'err'); return; }
  log(`Found ${data.length} outlets. Posting…`, 'info');
  try {
    const r = await fetch(endpoint + '/api/external-outlets', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ source: platform, outlets: data })
    }).then(x => x.json());
    log(`✓ ${r.inserted || 0} new, ${r.updated || 0} updated`, 'ok');
  } catch (e) { log('Post failed: ' + e.message, 'err'); }
});

$('syncMenu').addEventListener('click', async () => {
  log(`Syncing menu from ${$('platform').value}…`, 'info');
  const { data, endpoint, platform } = await runScraper(scrapeMenu);
  if (!data || data.error) { log('Error: ' + (data?.error || 'no data'), 'err'); return; }
  log(`Found ${data.length} menu items. Posting…`, 'info');
  try {
    const r = await fetch(endpoint + '/api/external-menu', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ source: platform, items: data })
    }).then(x => x.json());
    log(`✓ ${r.inserted || 0} new items, ${r.updated || 0} updated`, 'ok');
  } catch (e) { log('Post failed: ' + e.message, 'err'); }
});

$('syncInventory').addEventListener('click', async () => {
  log('Deriving inventory from menu stock flags…', 'info');
  const { data, endpoint, platform } = await runScraper(scrapeMenu);
  if (!data || data.error) { log('Error: ' + (data?.error || 'no data'), 'err'); return; }
  const items = data.map(i => ({ name: i.name, qty: i.available ? 1 : 0, unit: 'plate', price: i.price }));
  log(`Posting inventory snapshot of ${items.length} items…`, 'info');
  try {
    const r = await fetch(endpoint + '/api/external-inventory', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ source: platform, items })
    }).then(x => x.json());
    log(`✓ ${r.inserted || 0} new, ${r.updated || 0} updated`, 'ok');
  } catch (e) { log('Post failed: ' + e.message, 'err'); }
});

$('syncOrders').addEventListener('click', async () => {
  log(`Syncing orders from ${$('platform').value}…`, 'info');
  const { data, endpoint, platform } = await runScraper(scrapeOrders);
  if (!data || data.error) { log('Error: ' + (data?.error || 'no data'), 'err'); return; }
  log(`Found ${data.length} orders. Posting…`, 'info');
  let ok = 0, fail = 0;
  for (const o of data) {
    try {
      await fetch(endpoint + '/api/external-order', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          source: platform,
          external_id: o.external_id,
          customer: o.customer,
          items: o.items,
          total: o.total,
          meta: { state: o.state }
        })
      });
      ok++;
    } catch (e) { fail++; }
  }
  log(`✓ ${ok} orders synced (${fail} failed)`, ok ? 'ok' : 'err');
});

$('pollOn').addEventListener('click', async () => {
  const cur = await chrome.storage.local.get('polling');
  const next = !cur.polling;
  await chrome.storage.local.set({ polling: next });
  if (next) {
    chrome.alarms.create('autopull', { periodInMinutes: 1 });
    $('pollOn').textContent = '⏸ Stop Auto-Pull';
    log('Auto-pull ON — fetches orders every minute', 'ok');
  } else {
    chrome.alarms.clear('autopull');
    $('pollOn').textContent = '▶ Start Auto-Pull (Orders)';
    log('Auto-pull OFF', 'info');
  }
});

init();
