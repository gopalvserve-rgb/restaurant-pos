const DEFAULT_ENDPOINT = 'https://restaurant-pos-app-production.up.railway.app';

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
  if (cfg.polling) $('pollOn').textContent = '⏸ Stop Auto-Pull';
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
  const result = await chrome.scripting.executeScript({
    target: { tabId: tab.id }, world: 'MAIN', func: scraperFn, args: [platform]
  });
  return { data: result[0]?.result, endpoint, platform };
}

// ============= SCRAPERS (run in page context) =============

function scrapeOutlets(platform) {
  if (platform === 'zomato') {
    return fetch('https://api.zomato.com/merchant-gw/web/restaurant/get-all-minimal-lite', {
      credentials: 'include', headers: { 'Accept': 'application/json' }
    }).then(r => r.json()).then(j => {
      const list = j.response?.data || j.data || j.restaurants || [];
      // Group brands (deduplicate by brand_id)
      const brands = {};
      const outlets = list.map(o => {
        if (o.brand_id) {
          brands[o.brand_id] = {
            external_id: String(o.brand_id),
            name: o.brand_name || o.name || 'Brand',
            logo_url: o.brand_logo || o.thumbnail || '',
            cuisine: o.cuisine || '',
            is_cloud_kitchen: o.is_cloud_kitchen === 1 || (o.location_type && o.location_type.toLowerCase().includes('cloud'))
          };
        }
        return {
          external_id: String(o.id || o.res_id || ''),
          name: o.name || 'Unknown',
          brand_name: o.brand_name || o.name,
          address: [o.subzone, o.city].filter(Boolean).join(', '),
          city: o.city || '',
          area: o.subzone || '',
          phone: o.phone || '',
          lat: o.latitude || null,
          lng: o.longitude || null,
          image_url: o.thumbnail || o.image || '',
          rating: o.aggregate_rating || o.rating || 0,
          total_reviews: o.votes || 0,
          cuisine: o.cuisine || '',
          is_active: o.delivery_status === 'ON' || o.is_online === 1,
          avg_cost: o.cost_for_two || 0,
          is_cloud_kitchen: o.is_cloud_kitchen === 1
        };
      }).filter(o => o.external_id);
      return { outlets, brands: Object.values(brands) };
    }).catch(e => ({ error: e.message }));
  }
  // Swiggy
  return fetch('https://partner.swiggy.com/api/owner/auth/v2/user-data', {
    credentials: 'include', headers: { 'Accept': 'application/json' }
  }).then(r => r.json()).then(j => {
    const list = j.data?.restaurants || j.restaurants || [];
    const brands = {};
    const outlets = list.map(r => {
      const brandKey = r.brand_id || r.parent_id || r.id;
      brands[brandKey] = {
        external_id: String(brandKey),
        name: r.brand_name || r.parent_name || r.name,
        logo_url: r.brand_logo || '',
        cuisine: (r.cuisines || []).join(', '),
        is_cloud_kitchen: r.is_cloud_kitchen === true
      };
      return {
        external_id: String(r.id || r.restaurant_id),
        name: r.name,
        brand_name: r.brand_name || r.name,
        address: r.address || '',
        city: r.city || '',
        area: r.locality || '',
        lat: r.latitude || null,
        lng: r.longitude || null,
        image_url: r.image || '',
        rating: r.rating || 0,
        cuisine: (r.cuisines || []).join(', '),
        is_active: r.status === 1 || r.online === true,
        is_cloud_kitchen: r.is_cloud_kitchen === true
      };
    }).filter(o => o.external_id);
    return { outlets, brands: Object.values(brands) };
  }).catch(e => ({ error: e.message }));
}

function scrapeMenu(platform) {
  if (platform === 'zomato') {
    return fetch('https://api.zomato.com/merchant-gw/web/restaurant/get-all-minimal-lite', { credentials: 'include' })
      .then(r => r.json()).then(async j => {
        const outlets = (j.response?.data || j.data || []).slice(0, 3); // limit to avoid rate-limit
        const perOutlet = [];
        for (const o of outlets) {
          const m = await fetch(`https://www.zomato.com/php/online_ordering/menu_edit?action=get_content_menu&res_id=${o.id}&service_role=DELIVERY_TAKEAWAY`, { credentials: 'include' })
            .then(r => r.json()).catch(() => null);
          if (!m) continue;
          const cats = m.categories || m.menu_categories || m.menu || [];
          const categories = cats.map(c => ({
            external_id: String(c.id || c.category_id || ''),
            name: c.name || c.title || 'Category',
            description: c.description || '',
            sort_order: c.sort_order || 0,
            image_url: c.image_url || '',
            items: (c.items || c.menu_items || []).map(it => ({
              external_id: String(it.id || it.item_id || ''),
              name: it.name || 'Item',
              price: Number(it.price || it.cost || 0),
              tax_pct: Number(it.tax_pct || 5),
              available: it.in_stock !== 0 && it.is_available !== 0,
              description: it.description || '',
              long_description: it.long_description || it.description || '',
              image_url: it.image_url || it.thumbnail || '',
              food_type: it.veg_classifier || (it.is_veg === 1 ? 'veg' : (it.is_veg === 0 ? 'non-veg' : '')),
              is_recommended: it.is_recommended === 1,
              is_bestseller: it.is_bestseller === 1 || it.tags?.includes('bestseller'),
              is_spicy: it.is_spicy === 1,
              prep_time: it.preparation_time || null,
              calorie_info: it.calorie_info || null,
              rating: it.rating || 0,
              review_count: it.rating_count || 0,
              serves: it.serves || null,
              slug: it.slug || '',
              variants: (it.variants || it.choices || []).map(v => ({
                external_id: String(v.id || ''),
                name: v.name || '',
                price: Number(v.price || 0),
                price_delta: v.price ? Number(v.price) - Number(it.price || 0) : 0
              })),
              subcategories: it.subcategories || []
            }))
          }));
          perOutlet.push({ outlet_external_id: String(o.id), categories });
        }
        return perOutlet;
      }).catch(e => ({ error: e.message }));
  }
  // Swiggy
  return fetch('https://partner.swiggy.com/api/owner/menu/v2/categories', { credentials: 'include' })
    .then(r => r.json()).then(j => {
      const cats = j.data?.categories || j.categories || [];
      const categories = cats.map(c => ({
        external_id: String(c.category_id || c.id || ''),
        name: c.category_name || c.name || 'Category',
        sort_order: c.sort_order || 0,
        items: (c.items || c.menu_items || []).map(it => ({
          external_id: String(it.item_id || it.id),
          name: it.item_name || it.name,
          price: Number(it.price || 0) / 100,
          tax_pct: Number(it.gst_details?.igst || 5),
          available: it.in_stock !== false,
          description: it.item_description || '',
          image_url: it.image_id ? `https://media-assets.swiggy.com/swiggy/image/upload/${it.image_id}` : '',
          food_type: it.veg_classifier === 'VEG' ? 'veg' : (it.veg_classifier === 'NON_VEG' ? 'non-veg' : ''),
          is_recommended: it.is_recommended === true,
          is_bestseller: it.is_bestseller === true,
          variants: (it.variants_v2?.variant_groups?.[0]?.variations || []).map(v => ({
            external_id: String(v.id || ''),
            name: v.name,
            price: Number(v.price || 0) / 100
          }))
        }))
      }));
      return [{ outlet_external_id: '', categories }];
    }).catch(e => ({ error: e.message }));
}

function scrapeReviews(platform) {
  if (platform === 'zomato') {
    return fetch('https://api.zomato.com/merchant-gw/web/restaurant/get-all-minimal-lite', { credentials: 'include' })
      .then(r => r.json()).then(async j => {
        const outlets = (j.response?.data || j.data || []).slice(0, 3);
        const all = [];
        for (const o of outlets) {
          // Try several known Zomato review endpoints (best-effort: Zomato rotates these)
          const tries = [
            `https://www.zomato.com/merchant-api/feedback/list?res_id=${o.id}`,
            `https://www.zomato.com/merchant-api/feedback/get-all?res_id=${o.id}`,
            `https://www.zomato.com/merchant-api/reviews/list?res_id=${o.id}`,
            `https://www.zomato.com/merchant-api/reviews?res_id=${o.id}`,
            `https://api.zomato.com/merchant-gw/web/feedback/list?res_id=${o.id}`,
            `https://api.zomato.com/merchant-gw/web/reviews/list?res_id=${o.id}`,
            `https://www.zomato.com/php/restaurant/restaurant_reviews_ajax.php?res_id=${o.id}`
          ];
          let reviews = [];
          for (const url of tries) {
            try {
              const r = await fetch(url, { credentials: 'include' });
              if (!r.ok) continue;
              const data = await r.json();
              const list = data.reviews || data.feedback || data.feedbacks || data.entities ||
                           data.data?.reviews || data.data?.feedback || data.data?.entities ||
                           data.response?.reviews || data.response?.data || [];
              if (Array.isArray(list) && list.length) {
                reviews = list.map(rv => ({
                  external_id: String(rv.id || rv.review_id || rv.feedback_id || ''),
                  customer_name: rv.user_name || rv.customer_name || 'Anonymous',
                  customer_phone: rv.user_phone || '',
                  rating: Number(rv.rating || rv.stars || 0),
                  review_text: rv.review_text || rv.comment || rv.feedback_text || '',
                  order_id: rv.order_id || '',
                  item_name: rv.item_name || rv.product_name || '',
                  is_replied: !!rv.reply,
                  reply_text: rv.reply || rv.reply_text || ''
                }));
                break;
              }
            } catch (e) {}
          }
          if (reviews.length) all.push({ outlet_external_id: String(o.id), reviews });
        }
        return all;
      }).catch(e => ({ error: e.message }));
  }
  // Swiggy
  return fetch('https://partner.swiggy.com/api/restaurant/reviews?page=1&size=100', { credentials: 'include' })
    .then(r => r.json()).then(j => {
      const list = j.data?.reviews || j.reviews || [];
      return [{ outlet_external_id: '', reviews: list.map(rv => ({
        external_id: String(rv.review_id || rv.id),
        customer_name: rv.customer_name || 'Anonymous',
        rating: Number(rv.rating || 0),
        review_text: rv.review_text || rv.comment || '',
        order_id: rv.order_id || '',
        item_name: '',
        is_replied: !!rv.reply,
        reply_text: rv.reply || ''
      })) }];
    }).catch(e => ({ error: e.message }));
}

async function scrapeOrders(platform) {
  if (platform === 'zomato') {
    // === VERIFIED against live Zomato partner API (Jul 2026) ===
    // List:   GET /merchant-api/orders/get-all?state=X&delivery_mode=delivery,takeaway
    //         -> { count, entities: [<orderId numbers>] }   (IDs only)
    // Detail: GET /merchant-api/orders/order-details?tab_id=<orderId>
    //         -> { status:'success', order:{...} }
    const num = (v) => { const n = Number(v); return isNaN(n) ? 0 : n; };

    // Map a single Zomato "order" object to our POS shape (paths confirmed live).
    const str = (v) => (v == null ? '' : (typeof v === 'string' ? v : (typeof v === 'object' ? (v.text || v.name || v.value || v.locality || v.address || '') : String(v))));
    const mapOrder = (o, id, listState) => {
      const cd = o.cartDetails || {};
      const dishes = (cd.items && cd.items.dishes) || [];
      const items = (Array.isArray(dishes) ? dishes : []).map(d => ({
        name: d.name || 'Item',
        qty: num(d.quantity) || 1,
        // dishUnitCost = dish price before add-ons; fall back to unitCost
        price: num(d.dishUnitCost != null ? d.dishUnitCost : d.unitCost),
        // Portion / variant text e.g. "Quantity: Full [8 Pieces]" (verified path: chooseText / customisations)
        desc: str(d.chooseText || (Array.isArray(d.customisations) ? d.customisations.map(c => c && c.name).filter(Boolean).join(', ') : '') || '')
      }));
      const subtotal = num(cd.subtotal && cd.subtotal.amountDetails && cd.subtotal.amountDetails.amountTotalCost);
      const total = num(cd.total && cd.total.amountDetails && cd.total.amountDetails.amountTotalCost) || subtotal;
      // Discount (sum of all applied discounts)
      let discount = 0;
      const discs = (cd.discountApplied && cd.discountApplied.discounts) || [];
      for (const d of discs) discount += Math.abs(num(d.discount && d.discount.totalDiscountAmount));
      // Taxes (sum of charges flagged as tax)
      let tax = 0;
      const charges = Array.isArray(cd.charges) ? cd.charges : [];
      for (const c of charges) {
        const ad = c.amountDetails || {};
        if (String(ad.type || '').toLowerCase() === 'tax' || /tax/i.test(String(ad.itemName || ''))) tax += num(ad.amountTotalCost);
      }
      const creator = o.creator || {};
      const addr = creator.address || {};
      // Rider details — supportingRiderDetails is an object keyed "0","1"… ; take the first
      let rider = null;
      const srd = o.supportingRiderDetails;
      if (srd && typeof srd === 'object') {
        const first = Array.isArray(srd) ? srd[0] : srd[Object.keys(srd)[0]];
        if (first) rider = {
          name: str(first.name),
          status: str(first.riderStatus),        // ASSIGNED / PICKED_UP / …
          pickup: str(first.pickup),
          drop: str(first.drop),                 // ETA (drop time, ISO)
          tracking: !!first.isRiderTrackingAvailable
        };
      }
      return {
        external_id: String(id),
        state: o.state || listState,
        source: 'zomato',
        customer: { name: creator.name || creator.originalName || '', phone: '' }, // Zomato masks phone
        items,
        total,
        meta: {
          state: o.state || listState,
          display_id: o.displayId || '',
          delivery_mode: o.deliveryMode || '',
          payment_type: (o.paymentDetails && o.paymentDetails.paymentType) || '',
          subtotal, discount, tax,
          // richer order-card details (paths verified live)
          outlet_res_id: str(o.resId),
          order_count: str(creator.orderCountDisplay),                 // "1st order by Sanchi"
          customer_address: str(addr.address || addr.locality),        // includes "(6 kms, 18 mins away)"
          address_instructions: str(addr.addressInstructions),
          otp: str(o.otp),                                             // customer handover OTP
          rider_assigned: !!o.riderAssigned,
          expected_handover: str(o.expectedHandOverTime),              // ETA ISO time
          rider                                                        // {name,status,pickup,drop,tracking}
        },
        // Complete untouched Zomato order JSON — logged server-side for monitoring.
        raw: o
      };
    };

    const fetchDetail = async (id) => {
      try {
        const r = await fetch(`https://www.zomato.com/merchant-api/orders/order-details?tab_id=${id}`, { credentials: 'include' });
        if (!r.ok) return null;
        const j = await r.json();
        return (j && j.order) ? j.order : null;
      } catch (e) { return null; }
    };

    const states = ['NEW', 'ACCEPTED', 'PREPARING', 'READY', 'DISPATCHED', 'DELIVERED'];
    const listResults = await Promise.all(states.map(s =>
      fetch(`https://www.zomato.com/merchant-api/orders/get-all?state=${s}&delivery_mode=delivery,takeaway`, { credentials: 'include' })
        .then(r => r.json()).catch(() => ({ entities: [] }))
    ));

    const seen = new Set();
    const queue = [];
    listResults.forEach((r, idx) => {
      (r.entities || []).forEach(id => {
        if (!seen.has(id)) { seen.add(id); queue.push({ id, state: states[idx] }); }
      });
    });

    const out = [];
    for (const q of queue.slice(0, 50)) {
      const order = await fetchDetail(q.id);
      if (order) {
        out.push(mapOrder(order, q.id, q.state));
      } else {
        // Graceful fallback: register the order as a shell so it still appears in POS.
        out.push({ external_id: String(q.id), state: q.state, source: 'zomato', items: [], total: 0, customer: {}, meta: { state: q.state, detail_failed: true } });
      }
    }
    return out;
  }
  // ---- SWIGGY ----
  // Verified live: the partner app loads orders from
  //   POST https://rms.swiggy.com/orders/v1/fetchOrders  body {restaurantTimeMap:{}, sourceMessageIdMap:{}}
  //   -> { restaurantData: [ { orders: [...], popOrders: [...] } ] }
  // The legacy partner.swiggy.com/api/restaurant/orders/list path now returns HTML (dead).
  // Field names inside an order are NOT yet confirmed (no live Swiggy order captured yet),
  // so we send `raw` for every order and let the server log it for mapping.
  const swNum = (v) => { const n = Number(v); return isNaN(n) ? 0 : n; };
  const swMap = (o) => {
    const cust = o.customer || o.customerDetails || o.user || {};
    const rawItems = o.items || o.orderItems || o.dishes || o.cart?.items || [];
    return {
      external_id: String(o.orderId || o.order_id || o.id || o.orderNumber || ''),
      state: o.orderStatus || o.status || o.state || '',
      source: 'swiggy',
      total: swNum(o.orderTotal ?? o.order_total ?? o.total ?? o.billAmount),
      customer: { name: cust.name || o.customerName || '', phone: cust.phone || o.customerPhone || '' },
      items: (Array.isArray(rawItems) ? rawItems : []).map(i => ({
        name: i.name || i.itemName || i.dishName || 'Item',
        qty: swNum(i.quantity ?? i.qty) || 1,
        price: swNum(i.unitPrice ?? i.unit_price ?? i.price)
      })),
      raw: o   // complete untouched Swiggy order JSON -> logged server-side
    };
  };
  return fetch('https://rms.swiggy.com/orders/v1/fetchOrders', {
    method: 'POST', credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ restaurantTimeMap: {}, sourceMessageIdMap: {} })
  })
    .then(r => r.json())
    .then(j => {
      const out = [];
      for (const rest of (j.restaurantData || [])) {
        for (const o of [...(rest.orders || []), ...(rest.popOrders || [])]) out.push(swMap(o));
      }
      return out;
    })
    .catch(e => ({ error: 'swiggy fetchOrders failed: ' + e.message }));
}

// ============= POST helpers =============
async function post(endpoint, path, body) {
  const r = await fetch(endpoint + path, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body)
  });
  return r.json();
}

// ============= Button handlers =============
$('platform').addEventListener('change', () => {
  chrome.storage.local.set({ platform: $('platform').value });
  updateFoot();
});

async function doBrands() {
  log(`Syncing brands+outlets from ${$('platform').value}…`, 'info');
  setBusy(true);
  try {
    const { data, endpoint, platform } = await runScraper(scrapeOutlets);
    if (!data || data.error) { log('Error: ' + (data?.error || 'no data'), 'err'); return null; }
    // Push brands first
    if (data.brands?.length) {
      const br = await post(endpoint, '/api/external-brands', { source: platform, brands: data.brands });
      log(`  brands: ${br.inserted || 0} new, ${br.updated || 0} updated`, 'ok');
    }
    return { data, endpoint, platform };
  } finally { setBusy(false); }
}

async function doOutletsOnly() {
  setBusy(true);
  try {
    const { data, endpoint, platform } = await runScraper(scrapeOutlets);
    if (!data || data.error) { log('Error: ' + (data?.error || 'no data'), 'err'); return null; }
    const o = await post(endpoint, '/api/external-outlets-v2', { source: platform, outlets: data.outlets });
    log(`  outlets: ${o.inserted || 0} new, ${o.updated || 0} updated`, 'ok');
    return { data, endpoint, platform };
  } finally { setBusy(false); }
}

$('syncBrands').addEventListener('click', async () => {
  await doBrands();
});

$('syncOutlets').addEventListener('click', async () => {
  log(`Syncing outlets…`, 'info');
  await doOutletsOnly();
});

$('syncMenu').addEventListener('click', async () => {
  log(`Syncing menu+variants…`, 'info');
  setBusy(true);
  try {
    const { data, endpoint, platform } = await runScraper(scrapeMenu);
    if (!data || data.error) { log('Error: ' + (data?.error || 'no data'), 'err'); return; }
    let totalCats = 0, totalItems = 0, totalVariants = 0;
    for (const outlet of data) {
      const r = await post(endpoint, '/api/external-menu-v2', {
        source: platform, outlet_external_id: outlet.outlet_external_id, categories: outlet.categories
      });
      totalCats += (r.categories?.inserted || 0) + (r.categories?.updated || 0);
      totalItems += (r.items?.inserted || 0) + (r.items?.updated || 0);
      totalVariants += r.variants_added || 0;
    }
    log(`✓ ${totalCats} categories, ${totalItems} items, ${totalVariants} variants`, 'ok');
  } finally { setBusy(false); }
});

$('syncInventory').addEventListener('click', async () => {
  log('Deriving inventory from menu stock flags…', 'info');
  setBusy(true);
  try {
    const { data, endpoint, platform } = await runScraper(scrapeMenu);
    if (!data || data.error) { log('Error: ' + (data?.error || 'no data'), 'err'); return; }
    const items = [];
    for (const outlet of data) {
      for (const c of outlet.categories) {
        for (const it of c.items) items.push({ name: it.name, qty: it.available ? 1 : 0, unit: 'plate', price: it.price });
      }
    }
    const r = await post(endpoint, '/api/external-inventory', { source: platform, items });
    log(`✓ ${r.inserted || 0} new, ${r.updated || 0} updated`, 'ok');
  } finally { setBusy(false); }
});

$('syncOrders').addEventListener('click', async () => {
  log(`Syncing orders from ${$('platform').value}…`, 'info');
  setBusy(true);
  try {
    const { data, endpoint, platform } = await runScraper(scrapeOrders);
    if (!data || data.error) { log('Error: ' + (data?.error || 'no data'), 'err'); return; }
    let ok = 0, fail = 0;
    for (const o of data) {
      try {
        await post(endpoint, '/api/external-order', {
          source: platform, external_id: o.external_id, customer: o.customer,
          items: o.items, total: o.total, meta: o.meta || { state: o.state },
          raw: o.raw || null
        });
        ok++;
      } catch (e) { fail++; }
    }
    log(`✓ ${ok} orders synced (${fail} failed)`, ok ? 'ok' : 'err');
  } finally { setBusy(false); }
});

$('syncReviews').addEventListener('click', async () => {
  log(`Syncing reviews from ${$('platform').value}…`, 'info');
  setBusy(true);
  try {
    const { data, endpoint, platform } = await runScraper(scrapeReviews);
    if (!data || data.error) { log('Reviews error: ' + (data?.error || 'no data'), 'err'); return; }
    if (!data.length) { log('No reviews found (endpoint may not be open to your account)', 'warn'); return; }
    let total = 0;
    for (const outlet of data) {
      const r = await post(endpoint, '/api/external-reviews', {
        source: platform, outlet_external_id: outlet.outlet_external_id, reviews: outlet.reviews
      });
      total += r.inserted || 0;
    }
    log(`✓ ${total} new reviews synced`, 'ok');
  } finally { setBusy(false); }
});

$('syncAll').addEventListener('click', async () => {
  log('🚀 STARTING FULL SYNC…', 'info');
  $('syncBrands').click();
  await new Promise(r => setTimeout(r, 800));
  await doBrands();
  await new Promise(r => setTimeout(r, 800));
  await doOutletsOnly();
  await new Promise(r => setTimeout(r, 800));
  $('syncMenu').click(); await new Promise(r => setTimeout(r, 2500));
  $('syncReviews').click(); await new Promise(r => setTimeout(r, 2000));
  $('syncOrders').click();
  log('✅ Full sync triggered. Watch lines above.', 'ok');
});

$('pollOn').addEventListener('click', async () => {
  const cur = await chrome.storage.local.get('polling');
  const next = !cur.polling;
  await chrome.storage.local.set({ polling: next });
  if (next) {
    chrome.alarms.create('autopull', { periodInMinutes: 1 });
    $('pollOn').textContent = '⏸ Stop Auto-Pull';
    log('Auto-pull ON — orders+reviews every minute', 'ok');
  } else {
    chrome.alarms.clear('autopull');
    $('pollOn').textContent = '▶ Start Auto-Pull (Orders + Reviews)';
    log('Auto-pull OFF', 'info');
  }
});

init();
