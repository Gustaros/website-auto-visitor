// Сервис-воркер для управления записью и воспроизведением действий

// Связь между popup и content script через background
chrome.runtime.onInstalled.addListener(() => {
  // ...можно добавить инициализацию при установке...
});

// Сохраняем сценарии по домену с поддержкой имени
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.type === 'SAVE_ACTIONS') {
    const { actions, domain, name, desc, url } = msg;
    chrome.storage.local.get('scenarios', data => {
      let scenarios = data.scenarios || {};
      const key = url || domain;
      if (!Array.isArray(scenarios[key])) scenarios[key] = [];
      // Формируем базовое имя: domain+path
      let baseName = name;
      if (!baseName) {
        try {
          const parsed = new URL(url);
          baseName = parsed.hostname + parsed.pathname;
        } catch { baseName = domain; }
      }
      // Автоматически добавляем номер, если уже есть сценарии для этого URL
      let scenarioName = baseName;
      if (scenarios[key].length > 0) scenarioName += ` [${scenarios[key].length + 1}]`;
      scenarios[key].push({ name: scenarioName, domain, url, actions, desc: desc || '' });
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
    const { domain, name, desc, url, index } = msg;
    chrome.storage.local.get('scenarios', data => {
      let scenarios = data.scenarios || {};
      const key = url || domain;
      if (scenarios[key] && scenarios[key][index]) {
        scenarios[key][index].name = name;
        if (typeof desc !== 'undefined') scenarios[key][index].desc = desc;
        chrome.storage.local.set({ scenarios }, () => {
          sendResponse({ status: 'renamed' });
        });
      } else {
        sendResponse({ status: 'not_found' });
      }
    });
    return true;
  } else if (msg.type === 'SCHEDULE_SCENARIO') {
    // Новый формат: url и index
    const { url, index, time } = msg;
    const key = url + '__' + index;
    chrome.storage.local.get('scheduledTasks', data => {
      let scheduledTasks = data.scheduledTasks || {};
      scheduledTasks[key] = time;
      chrome.storage.local.set({ scheduledTasks }, () => {
        sendResponse({ status: 'scheduled' });
      });
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
    const scenarios = data.scenarios || {};
    Object.entries(scheduled).forEach(([key, time]) => {
      const [url, idxStr] = key.split('__');
      const idx = Number(idxStr);
      const [h, m] = time.split(':').map(Number);
      if (now.getHours() === h && now.getMinutes() === m) {
        const arr = scenarios[url] || [];
        const scenario = arr[idx];
        if (!scenario) return;
        // Проверяем, есть ли открытая вкладка с этим url
        chrome.tabs.query({}, tabs => {
          let found = false;
          tabs.forEach(tab => {
            if (tab.url && tab.url.startsWith(url)) {
              found = true;
              chrome.tabs.sendMessage(tab.id, { type: 'PLAY_ACTIONS', actions: scenario.actions || [] });
            }
          });
          if (!found) {
            chrome.tabs.create({ url: url }, newTab => {
              chrome.tabs.onUpdated.addListener(function listener(tabId, info) {
                if (tabId === newTab.id && info.status === 'complete') {
                  chrome.tabs.sendMessage(tabId, { type: 'PLAY_ACTIONS', actions: scenario.actions || [] });
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

// Автоматический запуск всех сценариев раз в день при первом запуске браузера
let lastAutoRunDate = null;

function getTodayString() {
  const now = new Date();
  return now.getFullYear() + '-' + (now.getMonth()+1) + '-' + now.getDate();
}

chrome.runtime.onStartup.addListener(() => {
  chrome.storage.local.get(['scenarios', 'lastAutoRunDate', 'autoRunAllEnabled'], data => {
    if (!data.autoRunAllEnabled) return;
    const today = getTodayString();
    if (data.lastAutoRunDate === today) return; // Уже запускали сегодня
    const scenarios = data.scenarios || {};
    Object.entries(scenarios).forEach(([key, arr]) => {
      if (!Array.isArray(arr)) return;
      arr.forEach((scenario, idx) => {
        if (!scenario.url) return;
        // Используем url как есть
        const openUrl = scenario.url;
        console.log('[AutoRun] Открываю url:', openUrl);
        chrome.tabs.create({ url: openUrl, active: false }, newTab => {
          const listener = function(tabId, info) {
            if (tabId === newTab.id && info.status === 'complete') {
              setTimeout(() => {
                chrome.tabs.sendMessage(tabId, { type: 'PLAY_ACTIONS', actions: scenario.actions || [] });
                setTimeout(() => chrome.tabs.remove(tabId), 10000);
                chrome.tabs.onUpdated.removeListener(listener);
              }, 1500);
            }
          };
          chrome.tabs.onUpdated.addListener(listener);
        });
      });
    });
    chrome.storage.local.set({ lastAutoRunDate: today });
  });
});
