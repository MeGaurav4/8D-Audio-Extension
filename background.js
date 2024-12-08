chrome.runtime.onInstalled.addListener(function() {
  chrome.storage.sync.set({enabled: false});
});

chrome.tabs.onUpdated.addListener(function(tabId, changeInfo, tab) {
  if (changeInfo.status === 'complete' && tab.url && (tab.url.includes('youtube.com') || tab.url.includes('music.youtube.com'))) {
    chrome.scripting.executeScript({
      target: { tabId: tabId },
      files: ['content.js']
    });
  }
});

chrome.action.onClicked.addListener((tab) => {
  if (tab.url && (tab.url.includes('youtube.com') || tab.url.includes('music.youtube.com'))) {
    chrome.tabs.sendMessage(tab.id, {action: 'toggle'});
  }
});
