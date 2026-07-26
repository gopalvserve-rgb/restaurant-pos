import React, { useState } from 'react';
import { api } from '../api.js';

export default function Bill({ order }) {
  const [sending, setSending] = useState(false);
  if (!order) return null;

  async function sendWhatsApp() {
    setSending(true);
    try {
      const { url, has_phone } = await api.whatsappLink(order.id);
      if (!has_phone) {
        if (!confirm('No phone number for this customer. Open WhatsApp share dialog anyway?')) return;
      }
      window.open(url, '_blank');
    } catch (e) { alert('Error: ' + e.message); }
    finally { setSending(false); }
  }

  return (
    <>
      <div className="no-print" style={{ textAlign: 'center', marginBottom: 16 }}>
        <button className="btn" onClick={sendWhatsApp} disabled={sending}
          style={{ background: '#25D366', color: 'white', padding: '10px 20px', fontWeight: 600 }}>
          💬 Send via WhatsApp
        </button>
      </div>
      <div className="bill">
        <h3>RESTAURANT</h3>
        <div className="center">Tax Invoice</div>
        <div className="divider"></div>
        <div>Invoice: <b>{order.order_no}</b></div>
        <div>Date: {new Date(order.closed_at || order.created_at).toLocaleString()}</div>
        <div>Type: {order.type === 'dine-in' ? `Dine-In · ${order.table_name || ''}` : (order.type === 'delivery' ? `Delivery${order.source ? ' (' + order.source + ')' : ''}` : 'Takeaway')}</div>
        {order.customer_name && <div>Customer: {order.customer_name}</div>}
        {order.customer_phone && <div>Phone: {order.customer_phone}</div>}
        <table>
          <thead>
            <tr><td>Item</td><td className="right">Qty</td><td className="right">Amt</td></tr>
          </thead>
          <tbody>
            {(order.items || []).map(i => (
              <tr key={i.id}>
                <td>{i.name}</td>
                <td className="right">{i.qty}</td>
                <td className="right">₹{(Number(i.price) * Number(i.qty)).toFixed(2)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="divider"></div>
        <table>
          <tbody>
            <tr><td>Subtotal</td><td className="right">₹{Number(order.subtotal).toFixed(2)}</td></tr>
            <tr><td>Tax</td><td className="right">₹{Number(order.tax).toFixed(2)}</td></tr>
            {Number(order.discount) > 0 && (
              <tr><td>Discount</td><td className="right">-₹{Number(order.discount).toFixed(2)}</td></tr>
            )}
            <tr><td><b>TOTAL</b></td><td className="right"><b>₹{Number(order.total).toFixed(2)}</b></td></tr>
            {order.payment_method && <tr><td>Paid by</td><td className="right">{order.payment_method.toUpperCase()}</td></tr>}
          </tbody>
        </table>
        <div className="divider"></div>
        <div className="center">Thank you! Visit again.</div>
      </div>
    </>
  );
}
