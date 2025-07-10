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
  let actionsDiv, scheduleDiv, scheduleInput, setScheduleBtn, exportBtn, importBtn, autoRunSwitchDiv, autoRunAllSwitch, searchDiv, searchInput;
  let scenarioFilter = '';

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
      setDomainStatus('');
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
        setStatusStopped(recordedActions.length);
        startBtn.disabled = false;
        stopBtn.disabled = true;
        playBtn.disabled = recordedActions.length === 0;
        if (currentDomain) {
          const name = prompt(t('newScenarioName'), currentDomain) || currentDomain;
          chrome.runtime.sendMessage({type: 'SAVE_ACTIONS', actions: recordedActions, domain: currentDomain, name}, () => {
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
  if (!searchDiv) {
    searchDiv = document.createElement('div');
    searchDiv.id = 'searchDiv';
    searchDiv.style.margin = '10px 0';
    searchDiv.innerHTML = '<input id="scenario-search" type="text" placeholder="Поиск сценария по имени..." style="width:95%">';
    document.body.insertBefore(searchDiv, scenarioList);
  }
  searchInput = document.getElementById('scenario-search');
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
      delBtn.title = t('deleteScenario', { name });
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
      renameBtn.title = t('renameScenario');
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
        statusDiv.textContent = t('selectScenario') + ': ' + selectedName + ' (' + domain + '). ' + t('statusStopped', { count: recordedActions.length });
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
      setSelectScenario();
      return;
    }
    if (!confirm(t('playActions') + ': ' + (selectedName || selectedDomain) + '?')) return;
    chrome.tabs.query({active: true, currentWindow: true}, tabs => {
      sendMessageWithRetry(tabs[0].id, {type: 'PLAY_ACTIONS', actions: recordedActions}, (resp, err) => {
        if (err) {
          statusDiv.textContent = 'Ошибка: расширение не может работать на этой странице.\n' + err;
          return;
        }
        setStatusPlaying();
      });
    });
  };

  // --- UI для расписания ---
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
    document.body.appendChild(autoRunSwitchDiv);
  }
  autoRunAllSwitch = document.getElementById('autoRunAllSwitch');
  chrome.storage.local.get('autoRunAllEnabled', data => {
    autoRunAllSwitch.checked = !!data.autoRunAllEnabled;
  });
  autoRunAllSwitch.onchange = () => {
    chrome.storage.local.set({ autoRunAllEnabled: autoRunAllSwitch.checked });
  };

  // Локализация кнопок и статусов
  startBtn.textContent = t('startRecording');
  stopBtn.textContent = t('stopRecording');
  playBtn.textContent = t('playActions');
  if (exportBtn) exportBtn.textContent = t('exportScenarios');
  if (importBtn) importBtn.textContent = t('importScenarios');
  if (searchInput) searchInput.placeholder = t('searchScenario');
  if (autoRunAllSwitch) autoRunAllSwitch.parentElement.querySelector('span:last-child').textContent = t('autoRunAll');
  if (setScheduleBtn) setScheduleBtn.textContent = t('setSchedule') || 'Установить';
  if (scheduleDiv) scheduleDiv.querySelector('b').textContent = t('autoRunSchedule') || 'Автозапуск по расписанию:';

  // Локализация тултипов для кнопок
  if (exportBtn) exportBtn.title = t('exportScenarios');
  if (importBtn) importBtn.title = t('importScenarios');
  if (startBtn) startBtn.title = t('startRecording');
  if (stopBtn) stopBtn.title = t('stopRecording');
  if (playBtn) playBtn.title = t('playActions');
  if (setScheduleBtn) setScheduleBtn.title = t('setSchedule') || 'Установить';
  if (autoRunAllSwitch) autoRunAllSwitch.title = t('autoRunAll');
});

// Локализация статусов и сообщений
function setStatusRecording() { statusDiv.textContent = t('statusRecording'); }
function setStatusStopped(count) { statusDiv.textContent = t('statusStopped', { count }); }
function setStatusPlaying() { statusDiv.textContent = t('statusPlaying'); }
function setDomainStatus(domain) { statusDiv.textContent = t('domain', { domain }); }
function setSelectScenario() { statusDiv.textContent = t('selectScenario'); }

// Все функции (updateScenarioList, renderActionsList, sendMessageWithRetry и т.д.) объявлены вне DOMContentLoaded, чтобы не было дублирования и ошибок вложенности.

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
    delBtn.title = t('deleteScenario', { name });
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
    renameBtn.title = t('renameScenario');
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
      statusDiv.textContent = t('selectScenario') + ': ' + selectedName + ' (' + domain + '). ' + t('statusStopped', { count: recordedActions.length });
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
    setSelectScenario();
    return;
  }
  if (!confirm(t('playActions') + ': ' + (selectedName || selectedDomain) + '?')) return;
  chrome.tabs.query({active: true, currentWindow: true}, tabs => {
    sendMessageWithRetry(tabs[0].id, {type: 'PLAY_ACTIONS', actions: recordedActions}, (resp, err) => {
      if (err) {
        statusDiv.textContent = 'Ошибка: расширение не может работать на этой странице.\n' + err;
        return;
      }
      setStatusPlaying();
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
autoRunSwitchDiv = document.getElementById('autoRunSwitchDiv');
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
  document.body.appendChild(autoRunSwitchDiv);
}
autoRunAllSwitch = document.getElementById('autoRunAllSwitch');
chrome.storage.local.get('autoRunAllEnabled', data => {
  autoRunAllSwitch.checked = !!data.autoRunAllEnabled;
});
autoRunAllSwitch.onchange = () => {
  chrome.storage.local.set({ autoRunAllEnabled: autoRunAllSwitch.checked });
};

  // Onboarding: показать приветствие при первом запуске
  chrome.storage.local.get('onboardingShown', data => {
    if (!data.onboardingShown) {
      const onboardingDiv = document.createElement('div');
      onboardingDiv.id = 'onboardingDiv';
      onboardingDiv.style.position = 'fixed';
      onboardingDiv.style.top = '0';
      onboardingDiv.style.left = '0';
      onboardingDiv.style.width = '100%';
      onboardingDiv.style.height = '100%';
      onboardingDiv.style.background = 'rgba(255,255,255,0.97)';
      onboardingDiv.style.zIndex = '9999';
      onboardingDiv.style.display = 'flex';
      onboardingDiv.style.flexDirection = 'column';
      onboardingDiv.style.justifyContent = 'center';
      onboardingDiv.style.alignItems = 'center';
      onboardingDiv.innerHTML = `
        <div style="max-width:320px;padding:24px 18px 18px 18px;border-radius:10px;box-shadow:0 2px 12px #0001;background:#fff;text-align:center;">
          <h3 style="color:#1976d2;">👋 ${t('appName')}</h3>
          <p style="font-size:15px;line-height:1.5;margin:10px 0 18px 0;">${t('onboardingWelcome') || 'This extension helps you automate daily actions on your favorite sites!'}<br><br>
          <b>${t('startRecording') || 'Start recording'}</b> — ${t('onboardingRecord') || 'Record your actions on the site.'}<br>
          <b>${t('playActions') || 'Play actions'}</b> — ${t('onboardingPlay') || 'Replay your scenario.'}<br>
          <b>${t('autoRunAll') || 'Automatically run all scenarios'}</b> — ${t('onboardingAuto') || 'Enable daily automation.'}</p>
          <button id="onboardingCloseBtn" style="margin-top:10px;padding:8px 24px;font-size:15px;background:#1976d2;color:#fff;border:none;border-radius:5px;">OK</button>
        </div>
      `;
      document.body.appendChild(onboardingDiv);
      document.getElementById('onboardingCloseBtn').onclick = () => {
        onboardingDiv.remove();
        chrome.storage.local.set({ onboardingShown: true });
      };
    }
  });
