import { useState, useEffect } from 'react';

export function getStoredUser() {
  try { return JSON.parse(localStorage.getItem('rpos_user') || 'null'); } catch { return null; }
}
export function setStoredAuth(user, token) {
  localStorage.setItem('rpos_user', JSON.stringify(user));
  localStorage.setItem('rpos_token', token);
}
export function clearAuth() {
  localStorage.removeItem('rpos_user');
  localStorage.removeItem('rpos_token');
}

export function useAuth() {
  const [user, setUser] = useState(getStoredUser());
  useEffect(() => {
    const h = () => setUser(getStoredUser());
    window.addEventListener('storage', h);
    return () => window.removeEventListener('storage', h);
  }, []);
  return user;
}

// Role permissions - what each role can access
export const PERMS = {
  owner:   { pos: true, orders: true, kot: true, admin: true, allAdmin: true },
  manager: { pos: true, orders: true, kot: true, admin: true, allAdmin: true },
  cashier: { pos: true, orders: true, kot: false, admin: false },
  waiter:  { pos: true, orders: true, kot: false, admin: false },
  kitchen: { pos: false, orders: false, kot: true, admin: false }
};
export function can(user, what) {
  if (!user) return false;
  const p = PERMS[user.role] || PERMS.cashier;
  return p[what] === true;
}
