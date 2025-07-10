// Скрипт для popup.html: управление кнопками и взаимодействие сbackground.js

document.addEventListener('DOMContentLoaded', () => {
  const startBtn = document.getElementById('start-record');
  const stopBtn = document.getElementById('stop-record');
  const playBtn = document.getElementById('play-actions');
  const statusDiv = document.getElementById('status');
  const scenarioList = document.getElementById('scenario-list');

  let recordedActions = [];
  let currentDomain = '';
  let scenarios = {};

  // Получаем домен текущей вкладки
  chrome.tabs.query({active: true, currentWindow: true}, tabs => {
    let url = '';
    try {
      url = tabs[0].url || '';
      if (!url.startsWith('http')) {
        statusDiv.textContent = 'Расширение работает только на обычных сайтах (http/https).';
        startBtn.disabled = true;
        stopBtn.disabled = true;
        playBtn.disabled = true;
        return;
      }
      const parsed = new URL(url);
      currentDomain = parsed.hostname;
      statusDiv.textContent = 'Домен: ' + currentDomain;
    } catch {
      statusDiv.textContent = 'Не удалось определить домен.';
      startBtn.disabled = true;
      stopBtn.disabled = true;
      playBtn.disabled = true;
      return;
    }
    // Загружаем сценарии
    chrome.runtime.sendMessage({type: 'GET_SCENARIOS'}, resp => {
      scenarios = resp.scenarios || {};
      console.log('[Website Auto Visitor] Загруженные сценарии:', scenarios); // диагностика
      updateScenarioList();
    });
  });

  // Универсальная функция для отправки сообщения с повтором
  function sendMessageWithRetry(tabId, message, callback, retries = 3) {
    chrome.tabs.sendMessage(tabId, message, resp => {
      if (chrome.runtime.lastError) {
        if (retries > 0) {
          setTimeout(() => sendMessageWithRetry(tabId, message, callback, retries - 1), 300);
        } else {
          callback(null, chrome.runtime.lastError.message);
        }
        return;
      }
      callback(resp, null);
    });
  }

  startBtn.onclick = () => {
    chrome.tabs.query({active: true, currentWindow: true}, tabs => {
      sendMessageWithRetry(tabs[0].id, {type: 'START_RECORDING'}, (resp, err) => {
        if (err) {
          statusDiv.textContent = 'Ошибка: расширение не может работать на этой странице.\n' + err;
          return;
        }
        statusDiv.textContent = 'Запись...';
        startBtn.disabled = true;
        stopBtn.disabled = false;
        playBtn.disabled = true;
      });
    });
  };

  stopBtn.onclick = () => {
    if (!currentDomain) {
      statusDiv.textContent = 'Ошибка: домен не определён, сценарий не будет сохранён.';
      startBtn.disabled = false;
      stopBtn.disabled = true;
      playBtn.disabled = true;
      return;
    }
    chrome.tabs.query({active: true, currentWindow: true}, tabs => {
      sendMessageWithRetry(tabs[0].id, {type: 'STOP_RECORDING'}, (resp, err) => {
        if (err) {
          statusDiv.textContent = 'Ошибка: расширение не может работать на этой странице.\n' + err;
          return;
        }
        recordedActions = resp.actions || [];
        statusDiv.textContent = 'Запись остановлена. Действий: ' + recordedActions.length;
        startBtn.disabled = false;
        stopBtn.disabled = true;
        playBtn.disabled = recordedActions.length === 0;
        // Сохраняем сценарий по домену, только если домен определён
        if (currentDomain) {
          chrome.runtime.sendMessage({type: 'SAVE_ACTIONS', actions: recordedActions, domain: currentDomain}, () => {
            // Обновляем список сценариев
            chrome.runtime.sendMessage({type: 'GET_SCENARIOS'}, resp => {
              scenarios = resp.scenarios || {};
              updateScenarioList();
            });
          });
        }
      });
    });
  };

  playBtn.onclick = () => {
    if (!recordedActions.length) return;
    chrome.tabs.query({active: true, currentWindow: true}, tabs => {
      sendMessageWithRetry(tabs[0].id, {type: 'PLAY_ACTIONS', actions: recordedActions}, (resp, err) => {
        if (err) {
          statusDiv.textContent = 'Ошибка: расширение не может работать на этой странице.\n' + err;
          return;
        }
        statusDiv.textContent = 'Воспроизведение...';
      });
    });
  };

  // --- UI для расписания ---
  const scheduleDiv = document.createElement('div');
  scheduleDiv.style.margin = '10px 0';
  scheduleDiv.innerHTML = '<b>Автозапуск по расписанию:</b><br><input id="schedule-time" type="time"> <button id="set-schedule">Установить</button>';
  document.body.appendChild(scheduleDiv);

  const scheduleInput = document.getElementById('schedule-time');
  const setScheduleBtn = document.getElementById('set-schedule');

  setScheduleBtn.onclick = () => {
    if (!currentDomain || !scheduleInput.value) return;
    chrome.runtime.sendMessage({ type: 'SCHEDULE_SCENARIO', domain: currentDomain, time: scheduleInput.value }, resp => {
      statusDiv.textContent = 'Автозапуск для ' + currentDomain + ' установлен на ' + scheduleInput.value;
    });
  };

  // Показываем текущее расписание
  chrome.runtime.sendMessage({ type: 'GET_SCHEDULED_TASKS' }, resp => {
    const scheduled = resp.scheduledTasks || {};
    if (scheduled[currentDomain]) {
      scheduleInput.value = scheduled[currentDomain];
      statusDiv.textContent += '\nАвтозапуск: ' + scheduled[currentDomain];
    }
  });

  function updateScenarioList() {
    if (!scenarioList) return;
    scenarioList.innerHTML = '';
    Object.keys(scenarios).forEach(domain => {
      if (!domain || domain === 'undefined') return;
      const li = document.createElement('li');
      li.textContent = domain + (domain === currentDomain ? ' (текущий)' : '');
      li.style.cursor = 'pointer';
      // Кнопка удаления сценария
      const delBtn = document.createElement('button');
      delBtn.textContent = '✕';
      delBtn.title = 'Удалить сценарий';
      delBtn.style.marginLeft = '8px';
      delBtn.onclick = (e) => {
        e.stopPropagation();
        if (confirm('Удалить сценарий для ' + domain + '?')) {
          delete scenarios[domain];
          chrome.storage.local.set({ scenarios }, () => updateScenarioList());
        }
      };
      li.onclick = () => {
        recordedActions = scenarios[domain] || [];
        playBtn.disabled = !recordedActions.length;
        statusDiv.textContent = 'Выбран сценарий для: ' + domain + '. Действий: ' + recordedActions.length;
        console.log('[Website Auto Visitor] Выбран сценарий:', domain, recordedActions);
      };
      li.appendChild(delBtn);
      scenarioList.appendChild(li);
    });
  }
});
