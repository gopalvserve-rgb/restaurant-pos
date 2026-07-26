const BASE = '/api';

async function req(path, opts = {}) {
  const token = localStorage.getItem('rpos_token');
  const res = await fetch(BASE + path, {
    ...opts,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { 'Authorization': 'Bearer ' + token } : {}),
      ...(opts.headers || {})
    }
  });
  if (!res.ok) throw new Error('HTTP ' + res.status);
  return res.json();
}

export const api = {
  health: () => req('/health'),
  stats: () => req('/stats'),
  dashboard: () => req('/dashboard'),

  categories: () => req('/categories'),
  createCategory: (b) => req('/categories', { method: 'POST', body: JSON.stringify(b) }),
  updateCategory: (id, b) => req('/categories/' + id, { method: 'PUT', body: JSON.stringify(b) }),
  deleteCategory: (id) => req('/categories/' + id, { method: 'DELETE' }),

  menu: () => req('/menu'),
  menuAll: () => req('/menu/all'),
  menuDetail: (id) => req('/menu/' + id + '/detail'),
  createMenu: (b) => req('/menu', { method: 'POST', body: JSON.stringify(b) }),
  updateMenu: (id, b) => req('/menu/' + id, { method: 'PUT', body: JSON.stringify(b) }),
  deleteMenu: (id) => req('/menu/' + id, { method: 'DELETE' }),

  // Variants
  variants: (menuId) => req('/menu/' + menuId + '/variants'),
  createVariant: (menuId, b) => req('/menu/' + menuId + '/variants', { method: 'POST', body: JSON.stringify(b) }),
  updateVariant: (id, b) => req('/variants/' + id, { method: 'PUT', body: JSON.stringify(b) }),
  deleteVariant: (id) => req('/variants/' + id, { method: 'DELETE' }),

  // Modifier groups
  modifierGroups: () => req('/modifier-groups'),
  createModifierGroup: (b) => req('/modifier-groups', { method: 'POST', body: JSON.stringify(b) }),
  updateModifierGroup: (id, b) => req('/modifier-groups/' + id, { method: 'PUT', body: JSON.stringify(b) }),
  deleteModifierGroup: (id) => req('/modifier-groups/' + id, { method: 'DELETE' }),
  createModifier: (groupId, b) => req('/modifier-groups/' + groupId + '/modifiers', { method: 'POST', body: JSON.stringify(b) }),
  updateModifier: (id, b) => req('/modifiers/' + id, { method: 'PUT', body: JSON.stringify(b) }),
  deleteModifier: (id) => req('/modifiers/' + id, { method: 'DELETE' }),
  attachGroup: (menuId, groupId) => req('/menu/' + menuId + '/modifier-groups/' + groupId, { method: 'POST' }),
  detachGroup: (menuId, groupId) => req('/menu/' + menuId + '/modifier-groups/' + groupId, { method: 'DELETE' }),

  // Combos
  combos: () => req('/combos'),
  createCombo: (b) => req('/combos', { method: 'POST', body: JSON.stringify(b) }),
  updateCombo: (id, b) => req('/combos/' + id, { method: 'PUT', body: JSON.stringify(b) }),
  deleteCombo: (id) => req('/combos/' + id, { method: 'DELETE' }),
  addComboItem: (id, b) => req('/combos/' + id + '/items', { method: 'POST', body: JSON.stringify(b) }),
  removeComboItem: (comboId, itemId) => req('/combos/' + comboId + '/items/' + itemId, { method: 'DELETE' }),

  tables: () => req('/tables'),
  createTable: (b) => req('/tables', { method: 'POST', body: JSON.stringify(b) }),
  updateTable: (id, b) => req('/tables/' + id, { method: 'PUT', body: JSON.stringify(b) }),
  deleteTable: (id) => req('/tables/' + id, { method: 'DELETE' }),

  customers: () => req('/customers'),
  customer: (id) => req('/customers/' + id),
  createCustomer: (b) => req('/customers', { method: 'POST', body: JSON.stringify(b) }),
  updateCustomer: (id, b) => req('/customers/' + id, { method: 'PUT', body: JSON.stringify(b) }),
  deleteCustomer: (id) => req('/customers/' + id, { method: 'DELETE' }),

  orders: (qs) => req('/orders' + (qs || '')),
  order: (id) => req('/orders/' + id),
  createOrder: (b) => req('/orders', { method: 'POST', body: JSON.stringify(b) }),
  addItems: (id, items) => req('/orders/' + id + '/items', { method: 'POST', body: JSON.stringify({ items }) }),
  removeItem: (id, itemId) => req('/orders/' + id + '/items/' + itemId, { method: 'DELETE' }),
  sendKot: (id) => req('/orders/' + id + '/kot', { method: 'POST' }),
  settle: (id, b) => req('/orders/' + id + '/settle', { method: 'POST', body: JSON.stringify(b) }),
  trackOrder: (id, b) => req('/orders/' + id + '/track', { method: 'POST', body: JSON.stringify(b) }),

  kotList: () => req('/kot'),
  kotStatus: (id, status) => req('/kot/' + id + '/status', { method: 'PUT', body: JSON.stringify({ status }) }),

  inventory: () => req('/inventory'),
  lowStock: () => req('/inventory/low-stock'),
  createInventory: (b) => req('/inventory', { method: 'POST', body: JSON.stringify(b) }),
  updateInventory: (id, b) => req('/inventory/' + id, { method: 'PUT', body: JSON.stringify(b) }),
  deleteInventory: (id) => req('/inventory/' + id, { method: 'DELETE' }),
  invTransaction: (id, b) => req('/inventory/' + id + '/transaction', { method: 'POST', body: JSON.stringify(b) }),
  invTransactions: (id) => req('/inventory/' + id + '/transactions'),

  shops: () => req('/shops'),
  createShop: (b) => req('/shops', { method: 'POST', body: JSON.stringify(b) }),
  updateShop: (id, b) => req('/shops/' + id, { method: 'PUT', body: JSON.stringify(b) }),
  deleteShop: (id) => req('/shops/' + id, { method: 'DELETE' }),

  tracking: () => req('/tracking'),


  // Recipes
  recipe: (menuId) => req('/menu/' + menuId + '/recipe'),
  addRecipe: (menuId, b) => req('/menu/' + menuId + '/recipe', { method: 'POST', body: JSON.stringify(b) }),
  deleteRecipe: (id) => req('/recipes/' + id, { method: 'DELETE' }),

  // Reports
  reportItems: (qs) => req('/reports/items' + (qs || '')),
  reportPayment: (qs) => req('/reports/payment' + (qs || '')),
  reportTax: (qs) => req('/reports/tax' + (qs || '')),
  reportPeakHours: (qs) => req('/reports/peak-hours' + (qs || '')),
  reportTopCustomers: (qs) => req('/reports/top-customers' + (qs || '')),
  reportSummary: (qs) => req('/reports/summary' + (qs || '')),

  // Hold/resume
  holdOrder: (id) => req('/orders/' + id + '/hold', { method: 'PUT' }),
  resumeOrder: (id) => req('/orders/' + id + '/resume', { method: 'PUT' }),
  heldOrders: () => req('/orders-held'),


  // Auth + Users
  login: (b) => req('/auth/login', { method: 'POST', body: JSON.stringify(b) }),
  me: () => req('/auth/me'),
  users: () => req('/users'),
  createUser: (b) => req('/users', { method: 'POST', body: JSON.stringify(b) }),
  updateUser: (id, b) => req('/users/' + id, { method: 'PUT', body: JSON.stringify(b) }),
  deleteUser: (id) => req('/users/' + id, { method: 'DELETE' }),

  // WhatsApp
  whatsappLink: (orderId) => req('/orders/' + orderId + '/whatsapp-link'),

  // External orders (Swiggy/Zomato)
  externalOrders: (qs) => req('/external-orders' + (qs || '')),

  // Raw integration payload logs (full scraping result received from the platform)
  integrationLogs: (qs) => req('/integration-logs' + (qs || '')),


  // v8: Brands, enriched outlets, hierarchical menu, reviews
  brands: () => req('/brands'),
  createBrand: (b) => req('/brands', { method: 'POST', body: JSON.stringify(b) }),
  updateBrand: (id, b) => req('/brands/' + id, { method: 'PUT', body: JSON.stringify(b) }),
  deleteBrand: (id) => req('/brands/' + id, { method: 'DELETE' }),
  outletsRich: () => req('/outlets'),
  reviews: (qs) => req('/reviews' + (qs || '')),
  cloudKitchenDash: () => req('/cloud-kitchen-dashboard'),

  settings: () => req('/settings'),
  updateSettings: (b) => req('/settings', { method: 'PUT', body: JSON.stringify(b) })
};
