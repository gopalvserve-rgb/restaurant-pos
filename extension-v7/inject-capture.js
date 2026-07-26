// ============================================================================
// Restaurant POS — PASSIVE network capture (MAIN world, document_start)
// ----------------------------------------------------------------------------
// This does NOT make its own scraping calls. It hooks the Zomato dashboard's
// OWN fetch/XHR traffic and captures the `order-details` responses the page
// already loads, then forwards the complete payload (+ raw JSON) to the POS.
// So every order the merchant views is logged automatically — no self-calls.
// ============================================================================
(function () {
  'use strict';
  var POS = 'https://restaurant-pos-app-production.up.railway.app';
  var DETAIL_RE = /merchant-api\/orders\/order-details/i;

  function num(v) { var n = Number(v); return isNaN(n) ? 0 : n; }
  function str(v) {
    if (v == null) return '';
    if (typeof v === 'string') return v;
    if (typeof v === 'object') return v.text || v.name || v.value || v.locality || v.address || '';
    return String(v);
  }

  // Map a Zomato order-details `order` object to the POS shape (verified paths).
  function mapOrder(o) {
    var cd = o.cartDetails || {};
    var dishes = (cd.items && cd.items.dishes) || [];
    var items = (Array.isArray(dishes) ? dishes : []).map(function (d) {
      return {
        name: d.name || 'Item',
        qty: num(d.quantity) || 1,
        price: num(d.dishUnitCost != null ? d.dishUnitCost : d.unitCost),
        desc: str(d.chooseText || (Array.isArray(d.customisations) ? d.customisations.map(function (c) { return c && c.name; }).filter(Boolean).join(', ') : ''))
      };
    });
    var subtotal = num(cd.subtotal && cd.subtotal.amountDetails && cd.subtotal.amountDetails.amountTotalCost);
    var total = num(cd.total && cd.total.amountDetails && cd.total.amountDetails.amountTotalCost) || subtotal;
    var discount = 0;
    ((cd.discountApplied && cd.discountApplied.discounts) || []).forEach(function (d) {
      discount += Math.abs(num(d.discount && d.discount.totalDiscountAmount));
    });
    var tax = 0;
    (Array.isArray(cd.charges) ? cd.charges : []).forEach(function (c) {
      var ad = c.amountDetails || {};
      if (String(ad.type || '').toLowerCase() === 'tax' || /tax/i.test(String(ad.itemName || ''))) tax += num(ad.amountTotalCost);
    });
    var creator = o.creator || {};
    var addr = creator.address || {};
    var rider = null;
    var srd = o.supportingRiderDetails;
    if (srd && typeof srd === 'object') {
      var first = Array.isArray(srd) ? srd[0] : srd[Object.keys(srd)[0]];
      if (first) rider = {
        name: str(first.name), status: str(first.riderStatus),
        pickup: str(first.pickup), drop: str(first.drop),
        tracking: !!first.isRiderTrackingAvailable
      };
    }
    return {
      source: 'zomato',
      external_id: String(o.id),
      state: o.state || '',
      customer: { name: creator.name || creator.originalName || '', phone: '' },
      items: items,
      total: total,
      meta: {
        state: o.state || '',
        display_id: o.displayId || '',
        delivery_mode: o.deliveryMode || '',
        payment_type: (o.paymentDetails && o.paymentDetails.paymentType) || '',
        subtotal: subtotal, discount: discount, tax: tax,
        outlet_res_id: str(o.resId),
        order_count: str(creator.orderCountDisplay),
        customer_address: str(addr.address || addr.locality),
        address_instructions: str(addr.addressInstructions),
        otp: str(o.otp),
        rider_assigned: !!o.riderAssigned,
        expected_handover: str(o.expectedHandOverTime),
        rider: rider,
        captured_via: 'network'   // marks this as passively captured, not self-called
      },
      raw: o
    };
  }

  // De-dupe: only forward an order when its state actually changed (avoid spamming
  // the POS on every dashboard poll of the same unchanged order).
  var lastState = {};
  function forward(order) {
    try {
      var key = order.external_id;
      if (lastState[key] === order.state && order.items.length) return; // unchanged
      lastState[key] = order.state;
      fetch(POS + '/api/external-order', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(order)
      }).catch(function () {});
    } catch (e) {}
  }

  function handle(url, text) {
    if (!DETAIL_RE.test(url)) return;
    try {
      var j = JSON.parse(text);
      var o = j && j.order;
      if (o && o.id) forward(mapOrder(o));
    } catch (e) {}
  }

  // ---- Hook fetch ----
  var origFetch = window.fetch;
  window.fetch = function () {
    var args = arguments;
    var url = (typeof args[0] === 'string') ? args[0] : (args[0] && args[0].url);
    var p = origFetch.apply(this, args);
    if (url && DETAIL_RE.test(url)) {
      p.then(function (r) { r.clone().text().then(function (t) { handle(url, t); }).catch(function () {}); }).catch(function () {});
    }
    return p;
  };

  // ---- Hook XHR ----
  var O = XMLHttpRequest.prototype.open, Snd = XMLHttpRequest.prototype.send;
  XMLHttpRequest.prototype.open = function (m, u) { this.__posUrl = u; return O.apply(this, arguments); };
  XMLHttpRequest.prototype.send = function () {
    var xhr = this;
    if (xhr.__posUrl && DETAIL_RE.test(xhr.__posUrl)) {
      xhr.addEventListener('load', function () { try { handle(xhr.__posUrl, xhr.responseText); } catch (e) {} });
    }
    return Snd.apply(this, arguments);
  };

  console.log('[Restaurant POS] passive network capture active on Zomato dashboard');
})();
