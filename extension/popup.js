async function load() {
  const c = await chrome.storage.local.get(['posUrl', 'apiKey', 'enabled', 'syncedCount', 'lastSyncAt']);
  document.getElementById('posUrl').value = c.posUrl || 'https://restaurant-pos-app-production.up.railway.app';
  document.getElementById('apiKey').value = c.apiKey || '';
  document.getElementById('enabled').checked = c.enabled !== false;
  document.getElementById('count').textContent = c.syncedCount || 0;
  document.getElementById('lastSync').textContent = c.lastSyncAt ? 'Last sync: ' + new Date(c.lastSyncAt).toLocaleString() : 'Not synced yet';
}

document.getElementById('save').onclick = async () => {
  await chrome.storage.local.set({
    posUrl: document.getElementById('posUrl').value.trim(),
    apiKey: document.getElementById('apiKey').value.trim(),
    enabled: document.getElementById('enabled').checked
  });
  alert('Saved!');
};

document.getElementById('reset').onclick = async () => {
  await chrome.runtime.sendMessage({ type: 'RESET_COUNT' });
  load();
};

document.getElementById('enabled').onchange = async (e) => {
  await chrome.storage.local.set({ enabled: e.target.checked });
};

load();
