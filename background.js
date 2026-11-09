// Service worker.
// - First run: fill in defaults without wiping saved settings, load scripts into open tabs.
// - Keyboard shortcut: toggle 8D in the current tab.
// - Badge: shows "8D" on tabs where the page reports it is on (the page owns that state).
// - "Any site": keep a content script registered for every site the user switched on.
const FILES = ['engine.js', 'machines.js', 'content.js'];
const YT = ['https://*.youtube.com/*', 'https://music.youtube.com/*'];
const scriptId = (origin) => 'site-' + origin.replace(/[^a-z0-9]/gi, '_');

async function injectInto(tabId) {
  try { await chrome.scripting.executeScript({ target: { tabId }, files: FILES }); } catch (e) { /* not allowed there */ }
}

async function syncSiteScripts() {
  const { origins = [] } = await chrome.permissions.getAll();
  const wanted = origins.filter((o) => !YT.includes(o) && !o.includes('youtube.com'));
  const existing = await chrome.scripting.getRegisteredContentScripts();
  const have = new Set(existing.map((s) => s.id));
  const keep = new Set(wanted.map(scriptId));
  const stale = existing.filter((s) => s.id.startsWith('site-') && !keep.has(s.id)).map((s) => s.id);
  if (stale.length) await chrome.scripting.unregisterContentScripts({ ids: stale });
  const add = wanted
    .filter((o) => !have.has(scriptId(o)))
    .map((o) => ({ id: scriptId(o), matches: [o], js: FILES, runAt: 'document_idle', allFrames: false }));
  if (add.length) await chrome.scripting.registerContentScripts(add);
}

chrome.runtime.onInstalled.addListener(async () => {
  const saved = await chrome.storage.sync.get(['intensity', 'rotationSpeed']);
  const defaults = {};
  if (saved.intensity === undefined) defaults.intensity = 1.5;
  if (saved.rotationSpeed === undefined) defaults.rotationSpeed = 0.02;
  if (Object.keys(defaults).length) await chrome.storage.sync.set(defaults);

  await syncSiteScripts().catch(() => {});
  const tabs = await chrome.tabs.query({ url: YT });
  for (const tab of tabs) injectInto(tab.id);
});

chrome.runtime.onStartup.addListener(() => { syncSiteScripts().catch(() => {}); });
chrome.permissions.onAdded.addListener(async (perms) => {
  await syncSiteScripts().catch(() => {});
  // the popup may close while Chrome shows the permission prompt, so load into the
  // site's open tabs from here
  const origins = (perms && perms.origins) || [];
  if (!origins.length) return;
  const tabs = await chrome.tabs.query({ url: origins }).catch(() => []);
  for (const tab of tabs) injectInto(tab.id);
});
chrome.permissions.onRemoved.addListener(() => { syncSiteScripts().catch(() => {}); });

function setBadge(tabId, on) {
  chrome.action.setBadgeText({ tabId, text: on ? '8D' : '' });
  if (!on) return;
  chrome.action.setBadgeBackgroundColor({ tabId, color: '#ddff00' });
  if (chrome.action.setBadgeTextColor) chrome.action.setBadgeTextColor({ tabId, color: '#1e1e1e' });
}

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.action === 'powerChanged' && sender.tab && sender.frameId === 0) {
    setBadge(sender.tab.id, !!msg.enabled);
    sendResponse({ ok: true });
    return false;
  }
  if (msg.action === 'siteEnabled' && msg.tabId) {
    syncSiteScripts()
      .catch(() => {})
      .then(() => injectInto(msg.tabId))
      .then(() => sendResponse({ ok: true }));
    return true;
  }
  return false;
});

chrome.commands.onCommand.addListener(async (command) => {
  if (command !== 'toggle-8d') return;
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab) return;
  // the page reports the result back with 'powerChanged', which updates the badge
  chrome.tabs.sendMessage(tab.id, { action: 'toggle' }, () => void chrome.runtime.lastError);
});
