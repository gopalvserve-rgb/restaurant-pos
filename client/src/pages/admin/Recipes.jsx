import React, { useEffect, useState } from 'react';
import { api } from '../../api.js';

export default function AdminRecipes() {
  const [menu, setMenu] = useState([]);
  const [inv, setInv] = useState([]);
  const [selectedId, setSelectedId] = useState(null);
  const [recipe, setRecipe] = useState([]);
  const [adding, setAdding] = useState({ inventory_item_id: '', qty: '' });

  async function loadAll() {
    const [m, i] = await Promise.all([api.menuAll(), api.inventory()]);
    setMenu(m); setInv(i);
    if (!selectedId && m.length) setSelectedId(m[0].id);
  }
  useEffect(() => { loadAll(); }, []);
  useEffect(() => {
    if (selectedId) api.recipe(selectedId).then(setRecipe);
  }, [selectedId]);

  async function addIngredient() {
    if (!adding.inventory_item_id || !adding.qty) return alert('Pick ingredient and qty');
    await api.addRecipe(selectedId, { inventory_item_id: Number(adding.inventory_item_id), qty: Number(adding.qty) });
    setAdding({ inventory_item_id: '', qty: '' });
    setRecipe(await api.recipe(selectedId));
  }
  async function removeIngredient(id) {
    if (!confirm('Remove this ingredient from recipe?')) return;
    await api.deleteRecipe(id);
    setRecipe(await api.recipe(selectedId));
  }

  const selectedItem = menu.find(m => m.id === selectedId);
  const usedIds = new Set(recipe.map(r => r.inventory_item_id));
  const available = inv.filter(i => !usedIds.has(i.id));

  return (
    <div className="admin-page">
      <h1>Recipes & Auto-Deduction</h1>
      <p className="muted-sm">Link each menu item to its ingredients. When the item is sold and order is settled, the linked ingredients are automatically deducted from inventory.</p>

      <div className="grid2" style={{ gridTemplateColumns: '300px 1fr' }}>
        <div className="card">
          <h3>Menu Items</h3>
          <div style={{ maxHeight: 600, overflowY: 'auto' }}>
            {menu.map(m => (
              <button key={m.id}
                className={'admin-navbtn' + (selectedId === m.id ? ' active' : '')}
                style={{ display: 'block', padding: '8px 12px', borderRadius: 4, marginBottom: 2, color: selectedId === m.id ? 'white' : 'var(--text)', background: selectedId === m.id ? 'var(--primary)' : 'transparent', width: '100%', textAlign: 'left' }}
                onClick={() => setSelectedId(m.id)}>
                {m.name} <span className="muted-sm" style={{ color: selectedId === m.id ? '#fef3c7' : 'var(--muted)' }}>· {m.category_name}</span>
              </button>
            ))}
          </div>
        </div>

        <div className="card">
          {selectedItem && (
            <>
              <h3>{selectedItem.name} — Recipe</h3>
              <p className="muted-sm">For each portion sold, these quantities will be deducted from inventory:</p>

              <table className="data-table">
                <thead><tr><th>Ingredient</th><th>Qty per portion</th><th>Current Stock</th><th></th></tr></thead>
                <tbody>
                  {recipe.map(r => (
                    <tr key={r.id}>
                      <td><b>{r.ingredient_name}</b></td>
                      <td>{Number(r.qty)} {r.unit}</td>
                      <td>{Number(r.current_stock)} {r.unit}</td>
                      <td><button className="btn-link" style={{ color: 'var(--danger)' }} onClick={() => removeIngredient(r.id)}>Remove</button></td>
                    </tr>
                  ))}
                  {recipe.length === 0 && <tr><td colSpan="4" className="empty">No ingredients linked yet</td></tr>}
                </tbody>
              </table>

              <h4 style={{ marginTop: 20 }}>Add Ingredient</h4>
              <div className="row-flex" style={{ alignItems: 'flex-end' }}>
                <div style={{ flex: 1 }}>
                  <label className="muted-sm">Ingredient</label>
                  <select value={adding.inventory_item_id} onChange={e => setAdding({ ...adding, inventory_item_id: e.target.value })} style={{ width: '100%' }}>
                    <option value="">— pick ingredient —</option>
                    {available.map(i => <option key={i.id} value={i.id}>{i.name} ({i.unit})</option>)}
                  </select>
                </div>
                <div>
                  <label className="muted-sm">Qty per portion</label>
                  <input type="number" step="0.001" value={adding.qty} onChange={e => setAdding({ ...adding, qty: e.target.value })} style={{ width: 120 }} placeholder="e.g. 0.1" />
                </div>
                <button className="btn btn-primary" onClick={addIngredient}>Add</button>
              </div>

              {recipe.length > 0 && (
                <div style={{ marginTop: 20, padding: 12, background: '#f0fdf4', border: '1px solid #86efac', borderRadius: 6 }}>
                  <b>How auto-deduction works:</b>
                  <ol style={{ marginLeft: 20, fontSize: 13 }}>
                    <li>Customer orders {selectedItem.name} (×N)</li>
                    <li>When you "Settle & Print", the order is marked paid</li>
                    <li>For each ingredient above, system deducts (qty × N) from inventory</li>
                    <li>Stock movement is logged in inventory transactions</li>
                  </ol>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
