// Service worker. The manifest already injects the content scripts on YouTube pages,
// so the only job here is first-run setup: fill in defaults without wiping saved
// settings, and load the scripts into YouTube tabs that were open before install/update.
chrome.runtime.onInstalled.addListener(async () => {
  const saved = await chrome.storage.sync.get(['intensity', 'rotationSpeed']);
  const defaults = {};
  if (saved.intensity === undefined) defaults.intensity = 1.5;
  if (saved.rotationSpeed === undefined) defaults.rotationSpeed = 0.02;
  if (Object.keys(defaults).length) await chrome.storage.sync.set(defaults);

  const tabs = await chrome.tabs.query({ url: ['https://*.youtube.com/*', 'https://music.youtube.com/*'] });
  for (const tab of tabs) {
    chrome.scripting
      .executeScript({ target: { tabId: tab.id }, files: ['engine.js', 'content.js'] })
      .catch(() => {});
  }
});
