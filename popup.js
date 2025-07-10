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
  let selectedDomain = '';
  let selectedName = '';

  // Вспомогательные DOM-элементы объявляются один раз
  let actionsDiv, scheduleDiv, scheduleInput, setScheduleBtn, exportBtn, importBtn;

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
          const name = prompt('Введите имя для сценария:', currentDomain) || currentDomain;
          chrome.runtime.sendMessage({type: 'SAVE_ACTIONS', actions: recordedActions, domain: currentDomain, name}, () => {
            // Обновляем список сценариев
            chrome.runtime.sendMessage({type: 'GET_SCENARIOS'}, resp => {
              scenarios = resp.scenarios || {};
              updateScenarioList();
              renderActionsList();
            });
          });
        }
      });
    });
  };

  // --- Поиск по имени сценария ---
  let searchDiv = document.getElementById('searchDiv');
  if (!searchDiv) {
    searchDiv = document.createElement('div');
    searchDiv.id = 'searchDiv';
    searchDiv.style.margin = '10px 0';
    searchDiv.innerHTML = '<input id="scenario-search" type="text" placeholder="Поиск сценария по имени..." style="width:95%">';
    document.body.insertBefore(searchDiv, scenarioList);
  }
  let searchInput = document.getElementById('scenario-search');
  let scenarioFilter = '';
  searchInput.oninput = () => {
    scenarioFilter = searchInput.value.trim().toLowerCase();
    updateScenarioList();
  };

  function updateScenarioList() {
    if (!scenarioList) return;
    scenarioList.innerHTML = '';
    Object.keys(scenarios).forEach(domain => {
      if (!domain || domain === 'undefined') return;
      const scenario = scenarios[domain];
      const name = (scenario.name || domain);
      if (scenarioFilter && !name.toLowerCase().includes(scenarioFilter)) return;
      const li = document.createElement('li');
      li.textContent = name + (domain === currentDomain ? ' (текущий)' : '');
      li.style.cursor = 'pointer';
      li.style.padding = '2px 4px';
      li.style.borderRadius = '4px';
      if (domain === selectedDomain) {
        li.style.background = '#d0ebff';
        li.style.fontWeight = 'bold';
      }
      // Кнопка удаления сценария
      const delBtn = document.createElement('button');
      delBtn.textContent = '✕';
      delBtn.title = 'Удалить сценарий';
      delBtn.style.marginLeft = '8px';
      delBtn.onclick = (e) => {
        e.stopPropagation();
        if (confirm('Удалить сценарий для ' + (scenario.name || domain) + '?')) {
          delete scenarios[domain];
          chrome.storage.local.set({ scenarios }, () => updateScenarioList());
          if (selectedDomain === domain) {
            selectedDomain = '';
            selectedName = '';
            recordedActions = [];
            playBtn.disabled = true;
          }
        }
      };
      // Кнопка переименования
      const renameBtn = document.createElement('button');
      renameBtn.textContent = '✎';
      renameBtn.title = 'Переименовать сценарий';
      renameBtn.style.marginLeft = '4px';
      renameBtn.onclick = (e) => {
        e.stopPropagation();
        const newName = prompt('Новое имя сценария:', scenario.name || domain);
        if (newName && newName !== scenario.name) {
          chrome.runtime.sendMessage({ type: 'RENAME_SCENARIO', domain, name: newName }, () => {
            scenarios[domain].name = newName;
            updateScenarioList();
            if (selectedDomain === domain) selectedName = newName;
          });
        }
      };
      li.onclick = () => {
        selectedDomain = domain;
        selectedName = scenario.name || domain;
        recordedActions = scenario.actions || [];
        playBtn.disabled = !recordedActions.length;
        updateScenarioList();
        statusDiv.textContent = 'Выбран сценарий: ' + selectedName + ' (' + domain + '). Действий: ' + recordedActions.length;
        console.log('[Website Auto Visitor] Выбран сценарий:', selectedName, recordedActions);
        renderActionsList();
      };
      li.appendChild(renameBtn);
      li.appendChild(delBtn);
      scenarioList.appendChild(li);
    });
    renderActionsList();
  }

  playBtn.onclick = () => {
    if (!recordedActions.length) return;
    if (!selectedDomain) {
      statusDiv.textContent = 'Сначала выберите сценарий.';
      return;
    }
    if (!confirm('Воспроизвести сценарий: ' + (selectedName || selectedDomain) + '?')) return;
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
  scheduleDiv = document.getElementById('scheduleDiv');
  if (!scheduleDiv) {
    scheduleDiv = document.createElement('div');
    scheduleDiv.id = 'scheduleDiv';
    scheduleDiv.style.margin = '10px 0';
    scheduleDiv.innerHTML = '<b>Автозапуск по расписанию:</b><br><input id="schedule-time" type="time"> <button id="set-schedule">Установить</button>';
    document.body.appendChild(scheduleDiv);
  }
  scheduleInput = document.getElementById('schedule-time');
  setScheduleBtn = document.getElementById('set-schedule');
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

  // --- Экспорт/импорт сценариев ---
  exportBtn = document.getElementById('exportBtn');
  if (!exportBtn) {
    exportBtn = document.createElement('button');
    exportBtn.id = 'exportBtn';
    exportBtn.textContent = 'Экспорт сценариев';
    exportBtn.style.margin = '5px 0';
    exportBtn.onclick = () => {
      const data = JSON.stringify(scenarios, null, 2);
      const blob = new Blob([data], {type: 'application/json'});
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'website-auto-visitor-scenarios.json';
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    };
    document.body.appendChild(exportBtn);
  }

  importBtn = document.getElementById('importBtn');
  if (!importBtn) {
    importBtn = document.createElement('button');
    importBtn.id = 'importBtn';
    importBtn.textContent = 'Импорт сценариев';
    importBtn.style.margin = '5px 0';
    importBtn.onclick = () => {
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = '.json,application/json';
      input.onchange = (e) => {
        const file = e.target.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = (ev) => {
          try {
            const imported = JSON.parse(ev.target.result);
            Object.assign(scenarios, imported);
            chrome.storage.local.set({ scenarios }, () => updateScenarioList());
            statusDiv.textContent = 'Сценарии импортированы.';
          } catch {
            statusDiv.textContent = 'Ошибка импорта файла.';
          }
        };
        reader.readAsText(file);
      };
      input.click();
    };
    document.body.appendChild(importBtn);
  }

  // --- Блок для просмотра и редактирования действий сценария ---
  actionsDiv = document.getElementById('actions-list');
  if (!actionsDiv) {
    actionsDiv = document.createElement('div');
    actionsDiv.id = 'actions-list';
    actionsDiv.style.margin = '10px 0';
    document.body.appendChild(actionsDiv);
  }

  function renderActionsList() {
    actionsDiv.innerHTML = '';
    if (!selectedDomain || !scenarios[selectedDomain]) return;
    const scenario = scenarios[selectedDomain];
    const actions = scenario.actions || [];
    if (!actions.length) {
      actionsDiv.textContent = 'Нет действий в сценарии.';
      return;
    }
    const ul = document.createElement('ul');
    ul.style.paddingLeft = '20px';
    let dragSrcIdx = null;
    actions.forEach((action, idx) => {
      const li = document.createElement('li');
      li.textContent = `${idx + 1}. ${action.type}` + (action.selector ? ` [${action.selector}]` : '') + (action.value ? ` = "${action.value}"` : '') + (action.href ? ` → ${action.href}` : '') + (action.scrollTop !== undefined ? ` (scroll: ${action.scrollTop})` : '');
      // Кнопка удаления действия
      const delBtn = document.createElement('button');
      delBtn.textContent = '✕';
      delBtn.title = 'Удалить действие';
      delBtn.style.marginLeft = '8px';
      delBtn.onclick = () => {
        scenario.actions.splice(idx, 1);
        chrome.runtime.sendMessage({ type: 'SAVE_ACTIONS', actions: scenario.actions, domain: selectedDomain, name: scenario.name }, () => {
          scenarios[selectedDomain].actions = scenario.actions;
          renderActionsList();
          updateScenarioList();
        });
      };
      li.appendChild(delBtn);
      // Drag&Drop
      li.draggable = true;
      li.ondragstart = (e) => {
        dragSrcIdx = idx;
        li.style.opacity = '0.5';
      };
      li.ondragend = (e) => {
        li.style.opacity = '';
      };
      li.ondragover = (e) => {
        e.preventDefault();
        li.style.background = '#ffeeba';
      };
      li.ondragleave = (e) => {
        li.style.background = '';
      };
      li.ondrop = (e) => {
        e.preventDefault();
        li.style.background = '';
        if (dragSrcIdx !== null && dragSrcIdx !== idx) {
          const moved = scenario.actions.splice(dragSrcIdx, 1)[0];
          scenario.actions.splice(idx, 0, moved);
          chrome.runtime.sendMessage({ type: 'SAVE_ACTIONS', actions: scenario.actions, domain: selectedDomain, name: scenario.name }, () => {
            scenarios[selectedDomain].actions = scenario.actions;
            renderActionsList();
            updateScenarioList();
          });
        }
        dragSrcIdx = null;
      };
      ul.appendChild(li);
    });
    actionsDiv.appendChild(ul);
  }

  // Вызовем renderActionsList при выборе сценария
  function updateScenarioList() {
    if (!scenarioList) return;
    scenarioList.innerHTML = '';
    Object.keys(scenarios).forEach(domain => {
      if (!domain || domain === 'undefined') return;
      const scenario = scenarios[domain];
      const name = (scenario.name || domain);
      if (scenarioFilter && !name.toLowerCase().includes(scenarioFilter)) return;
      const li = document.createElement('li');
      li.textContent = name + (domain === currentDomain ? ' (текущий)' : '');
      li.style.cursor = 'pointer';
      li.style.padding = '2px 4px';
      li.style.borderRadius = '4px';
      if (domain === selectedDomain) {
        li.style.background = '#d0ebff';
        li.style.fontWeight = 'bold';
      }
      // Кнопка удаления сценария
      const delBtn = document.createElement('button');
      delBtn.textContent = '✕';
      delBtn.title = 'Удалить сценарий';
      delBtn.style.marginLeft = '8px';
      delBtn.onclick = (e) => {
        e.stopPropagation();
        if (confirm('Удалить сценарий для ' + (scenario.name || domain) + '?')) {
          delete scenarios[domain];
          chrome.storage.local.set({ scenarios }, () => updateScenarioList());
          if (selectedDomain === domain) {
            selectedDomain = '';
            selectedName = '';
            recordedActions = [];
            playBtn.disabled = true;
          }
        }
      };
      // Кнопка переименования
      const renameBtn = document.createElement('button');
      renameBtn.textContent = '✎';
      renameBtn.title = 'Переименовать сценарий';
      renameBtn.style.marginLeft = '4px';
      renameBtn.onclick = (e) => {
        e.stopPropagation();
        const newName = prompt('Новое имя сценария:', scenario.name || domain);
        if (newName && newName !== scenario.name) {
          chrome.runtime.sendMessage({ type: 'RENAME_SCENARIO', domain, name: newName }, () => {
            scenarios[domain].name = newName;
            updateScenarioList();
            if (selectedDomain === domain) selectedName = newName;
          });
        }
      };
      li.onclick = () => {
        selectedDomain = domain;
        selectedName = scenario.name || domain;
        recordedActions = scenario.actions || [];
        playBtn.disabled = !recordedActions.length;
        updateScenarioList();
        statusDiv.textContent = 'Выбран сценарий: ' + selectedName + ' (' + domain + '). Действий: ' + recordedActions.length;
        console.log('[Website Auto Visitor] Выбран сценарий:', selectedName, recordedActions);
        renderActionsList();
      };
      li.appendChild(renameBtn);
      li.appendChild(delBtn);
      scenarioList.appendChild(li);
    });
    renderActionsList();
  }

  playBtn.onclick = () => {
    if (!recordedActions.length) return;
    if (!selectedDomain) {
      statusDiv.textContent = 'Сначала выберите сценарий.';
      return;
    }
    if (!confirm('Воспроизвести сценарий: ' + (selectedName || selectedDomain) + '?')) return;
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
  scheduleDiv = document.getElementById('scheduleDiv');
  if (!scheduleDiv) {
    scheduleDiv = document.createElement('div');
    scheduleDiv.id = 'scheduleDiv';
    scheduleDiv.style.margin = '10px 0';
    scheduleDiv.innerHTML = '<b>Автозапуск по расписанию:</b><br><input id="schedule-time" type="time"> <button id="set-schedule">Установить</button>';
    document.body.appendChild(scheduleDiv);
  }
  scheduleInput = document.getElementById('schedule-time');
  setScheduleBtn = document.getElementById('set-schedule');
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

  // --- Экспорт/импорт сценариев ---
  exportBtn = document.getElementById('exportBtn');
  if (!exportBtn) {
    exportBtn = document.createElement('button');
    exportBtn.id = 'exportBtn';
    exportBtn.textContent = 'Экспорт сценариев';
    exportBtn.style.margin = '5px 0';
    exportBtn.onclick = () => {
      const data = JSON.stringify(scenarios, null, 2);
      const blob = new Blob([data], {type: 'application/json'});
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'website-auto-visitor-scenarios.json';
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    };
    document.body.appendChild(exportBtn);
  }

  importBtn = document.getElementById('importBtn');
  if (!importBtn) {
    importBtn = document.createElement('button');
    importBtn.id = 'importBtn';
    importBtn.textContent = 'Импорт сценариев';
    importBtn.style.margin = '5px 0';
    importBtn.onclick = () => {
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = '.json,application/json';
      input.onchange = (e) => {
        const file = e.target.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = (ev) => {
          try {
            const imported = JSON.parse(ev.target.result);
            Object.assign(scenarios, imported);
            chrome.storage.local.set({ scenarios }, () => updateScenarioList());
            statusDiv.textContent = 'Сценарии импортированы.';
          } catch {
            statusDiv.textContent = 'Ошибка импорта файла.';
          }
        };
        reader.readAsText(file);
      };
      input.click();
    };
    document.body.appendChild(importBtn);
  }

  // --- Переключатель автозапуска всех сценариев при запуске браузера ---
  let autoRunSwitchDiv = document.getElementById('autoRunSwitchDiv');
  if (!autoRunSwitchDiv) {
    autoRunSwitchDiv = document.createElement('div');
    autoRunSwitchDiv.id = 'autoRunSwitchDiv';
    autoRunSwitchDiv.style.margin = '18px 0 0 0';
    autoRunSwitchDiv.style.display = 'flex';
    autoRunSwitchDiv.style.alignItems = 'center';
    autoRunSwitchDiv.style.justifyContent = 'center';
    autoRunSwitchDiv.innerHTML = `
      <label class="toggle-switch-label">
        <input type="checkbox" id="autoRunAllSwitch" class="toggle-switch-input">
        <span class="toggle-switch-slider"></span>
        <span style="margin-left:12px;font-size:14px;">Автоматически запускать все сценарии при запуске браузера</span>
      </label>
    `;
    // Добавляем переключатель в самый низ popup
    document.body.appendChild(autoRunSwitchDiv);
  }
  let autoRunAllSwitch = document.getElementById('autoRunAllSwitch');
  // Инициализация состояния переключателя
  chrome.storage.local.get('autoRunAllEnabled', data => {
    autoRunAllSwitch.checked = !!data.autoRunAllEnabled;
  });
  autoRunAllSwitch.onchange = () => {
    chrome.storage.local.set({ autoRunAllEnabled: autoRunAllSwitch.checked });
  };
});
