// Сервис-воркер для управления записью и воспроизведением действий

// Связь между popup и content script через background
chrome.runtime.onInstalled.addListener(() => {
  // ...можно добавить инициализацию при установке...
});

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.type === 'SAVE_ACTIONS') {
    chrome.storage.local.set({actions: msg.actions}, () => {
      sendResponse({status: 'saved'});
    });
    return true;
  } else if (msg.type === 'GET_ACTIONS') {
    chrome.storage.local.get('actions', (data) => {
      sendResponse({actions: data.actions || []});
    });
    return true;
  }
});
