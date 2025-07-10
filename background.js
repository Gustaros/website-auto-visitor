// Сервис-воркер для управления записью и воспроизведением действий

// Связь между popup и content script через background
chrome.runtime.onInstalled.addListener(() => {
  // ...можно добавить инициализацию при установке...
});

// Сохраняем сценарии по домену
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.type === 'SAVE_ACTIONS') {
    const { actions, domain } = msg;
    chrome.storage.local.get('scenarios', data => {
      const scenarios = data.scenarios || {};
      scenarios[domain] = actions;
      chrome.storage.local.set({ scenarios }, () => {
        sendResponse({ status: 'saved' });
      });
    });
    return true;
  } else if (msg.type === 'GET_SCENARIOS') {
    chrome.storage.local.get('scenarios', data => {
      sendResponse({ scenarios: data.scenarios || {} });
    });
    return true;
  }
});
