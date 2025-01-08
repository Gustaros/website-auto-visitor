chrome.runtime.onInstalled.addListener(() => {
  chrome.alarms.create("dailyVisitor", { periodInMinutes: 1440 });
  chrome.storage.local.get({ sitesToVisit: [] }, data => {
    if (!data.sitesToVisit.length) {
      chrome.storage.local.set({ sitesToVisit: [] });
    }
  });
});

const sitesToVisit = [
  "https://www.example1.com",
  "https://www.example2.com"
];

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === "dailyVisitor") {
    chrome.storage.local.get({ sitesToVisit: [] }, data => {
      data.sitesToVisit.forEach(site => {
        chrome.tabs.create({ url: site });
      });
    });
  }
});

chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status === "complete") {
    chrome.storage.local.get({ sitesToVisit: [] }, data => {
      if (data.sitesToVisit.includes(tab.url)) {
        chrome.tabs.remove(tabId);
      }
    });
  }
});