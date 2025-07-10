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
  } else if (msg.type === 'SCHEDULE_SCENARIO') {
    const { domain, time } = msg;
    scheduledTasks[domain] = time;
    chrome.storage.local.set({ scheduledTasks }, () => {
      sendResponse({ status: 'scheduled' });
    });
    return true;
  } else if (msg.type === 'GET_SCHEDULED_TASKS') {
    chrome.storage.local.get('scheduledTasks', data => {
      sendResponse({ scheduledTasks: data.scheduledTasks || {} });
    });
    return true;
  }
});

// Заготовка для автоматизации по расписанию
let scheduledTasks = {}

// Псевдо-таймер для проверки расписания (каждую минуту)
setInterval(() => {
  chrome.storage.local.get(['scenarios', 'scheduledTasks'], data => {
    const now = new Date();
    const scheduled = data.scheduledTasks || {};
    Object.entries(scheduled).forEach(([domain, time]) => {
      const [h, m] = time.split(':').map(Number);
      if (now.getHours() === h && now.getMinutes() === m) {
        // Найти активную вкладку с этим доменом и отправить PLAY_ACTIONS
        chrome.tabs.query({}, tabs => {
          tabs.forEach(tab => {
            try {
              const url = new URL(tab.url);
              if (url.hostname === domain) {
                chrome.tabs.sendMessage(tab.id, { type: 'PLAY_ACTIONS', actions: (data.scenarios||{})[domain] || [] });
              }
            } catch {}
          });
        });
      }
    });
  });
}, 60000);
