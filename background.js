// Сервис-воркер для управления записью и воспроизведением действий

// Связь между popup и content script через background
chrome.runtime.onInstalled.addListener(() => {
  // ...можно добавить инициализацию при установке...
});

// Сохраняем сценарии по домену с поддержкой имени
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.type === 'SAVE_ACTIONS') {
    const { actions, domain, name } = msg;
    chrome.storage.local.get('scenarios', data => {
      const scenarios = data.scenarios || {};
      scenarios[domain] = { name: name || domain, domain, actions };
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
  } else if (msg.type === 'RENAME_SCENARIO') {
    const { domain, name } = msg;
    chrome.storage.local.get('scenarios', data => {
      const scenarios = data.scenarios || {};
      if (scenarios[domain]) {
        scenarios[domain].name = name;
        chrome.storage.local.set({ scenarios }, () => {
          sendResponse({ status: 'renamed' });
        });
      } else {
        sendResponse({ status: 'not_found' });
      }
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
        // Проверяем, есть ли открытая вкладка с этим доменом
        chrome.tabs.query({}, tabs => {
          let found = false;
          tabs.forEach(tab => {
            try {
              const url = new URL(tab.url);
              if (url.hostname === domain) {
                found = true;
                // Запускаем сценарий на уже открытой вкладке
                chrome.tabs.sendMessage(tab.id, { type: 'PLAY_ACTIONS', actions: (data.scenarios||{})[domain]?.actions || [] });
              }
            } catch {}
          });
          if (!found) {
            // Открываем новую вкладку и запускаем сценарий после загрузки
            chrome.tabs.create({ url: 'https://' + domain }, newTab => {
              // Ждём загрузки страницы, затем отправляем PLAY_ACTIONS
              chrome.tabs.onUpdated.addListener(function listener(tabId, info) {
                if (tabId === newTab.id && info.status === 'complete') {
                  chrome.tabs.sendMessage(tabId, { type: 'PLAY_ACTIONS', actions: (data.scenarios||{})[domain]?.actions || [] });
                  chrome.tabs.onUpdated.removeListener(listener);
                }
              });
            });
          }
        });
      }
    });
  });
}, 60000);
