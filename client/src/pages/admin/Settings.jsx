import React, { useEffect, useState } from 'react';
import { api } from '../../api.js';

export default function AdminSettings() {
  const [s, setS] = useState(null);
  const [saved, setSaved] = useState(false);

  useEffect(() => { api.settings().then(setS); }, []);

  async function save() {
    await api.updateSettings(s);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }

  if (!s) return <div className="admin-page"><h1>Settings</h1><div className="empty">Loading…</div></div>;

  const set = (k, v) => setS({ ...s, [k]: v });

  return (
    <div className="admin-page">
      <h1>Settings</h1>

      <div className="card">
        <h3>Restaurant Info</h3>
        <label>Restaurant Name</label>
        <input value={s.restaurant_name || ''} onChange={e => set('restaurant_name', e.target.value)} />
        <label>Address</label>
        <textarea rows={2} value={s.restaurant_address || ''} onChange={e => set('restaurant_address', e.target.value)} />
        <div className="row2">
          <div><label>Phone</label><input value={s.restaurant_phone || ''} onChange={e => set('restaurant_phone', e.target.value)} /></div>
          <div><label>Email</label><input value={s.restaurant_email || ''} onChange={e => set('restaurant_email', e.target.value)} /></div>
        </div>
        <div className="row2">
          <div><label>GST No</label><input value={s.gst_no || ''} onChange={e => set('gst_no', e.target.value)} /></div>
          <div><label>Default Tax %</label><input type="number" value={s.default_tax_pct || ''} onChange={e => set('default_tax_pct', e.target.value)} /></div>
        </div>
        <div className="row2">
          <div><label>Currency Code</label><input value={s.currency || 'INR'} onChange={e => set('currency', e.target.value)} /></div>
          <div><label>Currency Symbol</label><input value={s.currency_symbol || '₹'} onChange={e => set('currency_symbol', e.target.value)} /></div>
        </div>
        <label>Bill Footer</label>
        <input value={s.bill_footer || ''} onChange={e => set('bill_footer', e.target.value)} />
        <div style={{ marginTop: 12 }}>
          <button className="btn btn-primary" onClick={save}>Save Settings</button>
          {saved && <span style={{ marginLeft: 12, color: 'var(--success)' }}>✓ Saved</span>}
        </div>
      </div>

      <div className="card" style={{ marginTop: 16 }}>
        <h3>📱 Android App</h3>
        <p>Download the signed Android APK to install on your phone or tablet.</p>
        <p className="muted-sm">If "Download" returns a placeholder page, the APK file hasn't been uploaded yet — see the next-steps page on the link.</p>
        <a href={s.apk_download_url || '/downloads/restaurant-pos.apk'}
           className="btn btn-primary"
           download="restaurant-pos.apk"
           style={{ display: 'inline-block', padding: '12px 24px', textDecoration: 'none' }}>
          ⬇ Download Android APP (APK)
        </a>
        <div style={{ marginTop: 12 }}>
          <small>Or scan this QR code with your phone:</small><br/>
          <img alt="QR" src={`https://api.qrserver.com/v1/create-qr-code/?size=160x160&data=${encodeURIComponent(window.location.origin + (s.apk_download_url || '/downloads/restaurant-pos.apk'))}`} />
        </div>
      </div>

      <div className="card" style={{ marginTop: 16 }}>
        <h3>🌐 Install as Web App (PWA)</h3>
        <p>On any phone, open <code>{window.location.origin}</code> in Chrome / Safari and tap "Add to Home screen". The app installs full-screen and works offline.</p>
      </div>
    </div>
  );
}
