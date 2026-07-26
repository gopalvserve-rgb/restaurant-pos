import React, { useState } from 'react';
import AdminDashboard from './admin/Dashboard.jsx';
import AdminProducts from './admin/Products.jsx';
import AdminModifiers from './admin/Modifiers.jsx';
import AdminCombos from './admin/Combos.jsx';
import AdminRecipes from './admin/Recipes.jsx';
import AdminInventory from './admin/Inventory.jsx';
import AdminCustomers from './admin/Customers.jsx';
import AdminOrders from './admin/AdminOrders.jsx';
import AdminTracking from './admin/Tracking.jsx';
import AdminReports from './admin/Reports.jsx';
import AdminShops from './admin/Shops.jsx';
import AdminUsers from './admin/Users.jsx';
import AdminIntegrations from './admin/Integrations.jsx';
import AdminBrands from './admin/Brands.jsx';
import AdminReviews from './admin/Reviews.jsx';
import AdminCloudKitchen from './admin/CloudKitchen.jsx';
import AdminSettings from './admin/Settings.jsx';

const SECTIONS = [
  { key: 'dashboard', label: 'Dashboard', icon: '📊' },
  { key: 'cloudkitchen', label: 'Cloud Kitchen', icon: '☁️' },
  { key: 'brands', label: 'Brands', icon: '🏷️' },
  { key: 'products', label: 'Products / Menu', icon: '🍽️' },
  { key: 'modifiers', label: 'Modifiers', icon: '⚡' },
  { key: 'combos', label: 'Combos / Meals', icon: '🎁' },
  { key: 'recipes', label: 'Recipes (Auto-Stock)', icon: '📝' },
  { key: 'inventory', label: 'Inventory', icon: '📦' },
  { key: 'customers', label: 'Customers', icon: '👥' },
  { key: 'orders', label: 'Orders', icon: '🧾' },
  { key: 'reviews', label: 'Reviews & Ratings', icon: '⭐' },
  { key: 'tracking', label: 'Tracking', icon: '📍' },
  { key: 'reports', label: 'Reports', icon: '📈' },
  { key: 'integrations', label: 'Integrations', icon: '🔌' },
  { key: 'shops', label: 'Shops / Outlets', icon: '🏪' },
  { key: 'users', label: 'Users & Roles', icon: '🔐' },
  { key: 'settings', label: 'Settings', icon: '⚙️' }
];

export default function Admin({ user }) {
  const [section, setSection] = useState('dashboard');
  const pages = {
    dashboard: <AdminDashboard />,
    cloudkitchen: <AdminCloudKitchen />,
    brands: <AdminBrands />,
    products: <AdminProducts />,
    modifiers: <AdminModifiers />,
    combos: <AdminCombos />,
    recipes: <AdminRecipes />,
    inventory: <AdminInventory />,
    customers: <AdminCustomers />,
    orders: <AdminOrders />,
    reviews: <AdminReviews />,
    tracking: <AdminTracking />,
    reports: <AdminReports />,
    integrations: <AdminIntegrations />,
    shops: <AdminShops />,
    users: <AdminUsers />,
    settings: <AdminSettings />
  };
  return (
    <div className="admin-wrap">
      <aside className="admin-sidebar">
        <div className="admin-brand">Admin Backend</div>
        <nav>
          {SECTIONS.map(s => (
            <button key={s.key} className={'admin-navbtn' + (section === s.key ? ' active' : '')} onClick={() => setSection(s.key)}>
              <span className="ico">{s.icon}</span> {s.label}
            </button>
          ))}
        </nav>
        <div className="admin-foot"><small>v1.3 · {new Date().getFullYear()}</small></div>
      </aside>
      <main className="admin-main">{pages[section]}</main>
    </div>
  );
}
