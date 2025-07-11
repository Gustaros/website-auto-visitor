// Скрипт для popup.html: управление кнопками и взаимодействие сbackground.js

console.log('[Website Auto Visitor] popup.js loaded');
function t(key, vars) {
  try {
    if (typeof chrome !== 'undefined' && chrome.i18n) {
      let msg = chrome.i18n.getMessage(key);
      if (vars && msg) {
        Object.keys(vars).forEach(k => {
          msg = msg.replace(new RegExp('{' + k + '}', 'g'), vars[k]);
        });
      }
      return msg || key;
    }
  } catch (e) {
    console.warn('t() error', e);
  }
  return key;
}
console.log('t(startRecording):', t('startRecording'));
document.addEventListener('DOMContentLoaded', () => {
  console.log('DOMContentLoaded');
  const startBtn = document.getElementById('start-record');
  const stopBtn = document.getElementById('stop-record');
  const playBtn = document.getElementById('play-actions');
  const statusDiv = document.getElementById('status');
  const scenarioList = document.getElementById('scenario-list');

  let recordedActions = [];
  let currentDomain = '';
  let currentUrl = '';
  let scenarios = {};
  let selectedDomain = '';
  let selectedName = '';
  let selectedArr = null;
  let selectedIndex = -1;

  // Вспомогательные DOM-элементы объявляются один раз
  let actionsDiv, scheduleDiv, scheduleInput, setScheduleBtn, exportBtn, importBtn, autoRunSwitchDiv, autoRunAllSwitch, searchDiv, searchInput;
  let scenarioFilter = '';

  // Получаем домен текущей вкладки
  chrome.tabs.query({active: true, currentWindow: true}, tabs => {
    let url = '';
    try {
      url = tabs[0].url || '';
      if (!url.startsWith('http')) {
        statusDiv.textContent = t('errorHttpOnly');
        startBtn.disabled = true;
        stopBtn.disabled = true;
        playBtn.disabled = true;
        return;
      }
      const parsed = new URL(url);
      currentDomain = parsed.hostname;
      currentUrl = url;
      statusDiv.textContent = t('domain', {domain: currentDomain});
    } catch {
      statusDiv.textContent = t('errorDomainDetect');
      startBtn.disabled = true;
      stopBtn.disabled = true;
      playBtn.disabled = true;
      return;
    }
    // Загружаем сценарии
    chrome.runtime.sendMessage({type: 'GET_SCENARIOS'}, resp => {
      scenarios = resp.scenarios || {};
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
          statusDiv.textContent = t('errorOnPage') + '\n' + err;
          return;
        }
        statusDiv.textContent = t('statusRecording');
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
          statusDiv.textContent = t('errorOnPage') + '\n' + err;
          return;
        }
        recordedActions = resp.actions || [];
        setStatusStopped(recordedActions.length);
        startBtn.disabled = false;
        stopBtn.disabled = true;
        playBtn.disabled = recordedActions.length === 0;
        if (currentDomain) {
          // Формируем имя сценария: domain + path + номер
          const parsed = new URL(currentUrl);
          let baseName = parsed.hostname + parsed.pathname;
          // Считаем сколько уже сценариев для этого url
          const existing = Object.values(scenarios).filter(s => s.url === currentUrl);
          let name = baseName;
          if (existing.length > 0) name += ` [${existing.length + 1}]`;
          let desc = '';
          if (descTextarea) desc = descTextarea.value;
          chrome.runtime.sendMessage({type: 'SAVE_ACTIONS', actions: recordedActions, domain: currentDomain, name, desc, url: currentUrl}, () => {
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
    searchDiv.innerHTML = `<input id="scenario-search" type="text" placeholder="${t('searchScenario')}" style="width:95%">`;
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
    let allScenarios = [];
    Object.entries(scenarios).forEach(([key, arr]) => {
      if (Array.isArray(arr)) {
        arr.forEach((scenario, idx) => {
          allScenarios.push({ scenario, idx, arr, key });
        });
      }
    });
    if (allScenarios.length === 0) {
      const li = document.createElement('li');
      li.textContent = t('noActions');
      li.style.color = '#888';
      scenarioList.appendChild(li);
      renderActionsList();
      return;
    }
    allScenarios.forEach(({ scenario, idx, arr, key }) => {
      const name = scenario.name || (scenario.domain + scenario.url);
      const li = document.createElement('li');
      li.textContent = name + (scenario.url === currentUrl ? ' (' + t('current') + ')' : '');
      li.style.cursor = 'pointer';
      li.style.padding = '2px 4px';
      li.style.borderRadius = '4px';
      // Выделение выбранного сценария
      if (arr === selectedArr && idx === selectedIndex) {
        li.classList.add('selected');
      }
      // Drag&drop
      li.setAttribute('draggable', 'true');
      li.ondragstart = (e) => {
        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData('text/plain', idx);
        li.classList.add('dragging');
      };
      li.ondragend = () => {
        li.classList.remove('dragging');
        scenarioList.querySelectorAll('.drag-over').forEach(el => el.classList.remove('drag-over'));
      };
      li.ondragover = (e) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
        li.classList.add('drag-over');
      };
      li.ondragleave = () => {
        li.classList.remove('drag-over');
      };
      li.ondrop = (e) => {
        e.preventDefault();
        li.classList.remove('drag-over');
        const fromIdx = Number(e.dataTransfer.getData('text/plain'));
        const toIdx = idx;
        if (fromIdx === toIdx || arr !== selectedArr) return;
        // Переставляем сценарии внутри массива
        const moved = arr.splice(fromIdx, 1)[0];
        arr.splice(toIdx, 0, moved);
        chrome.storage.local.set({ scenarios }, () => updateScenarioList());
      };
      // Кнопка удаления
      const delBtn = document.createElement('button');
      delBtn.innerHTML = '';
      delBtn.appendChild(createIcon('delete'));
      delBtn.title = t('deleteScenario', { name });
      delBtn.style.marginLeft = '8px';
      delBtn.onclick = (e) => {
        e.stopPropagation();
        arr.splice(idx, 1);
        chrome.storage.local.set({ scenarios }, () => {
          // Если удалили выбранный — сбросить выбор
          if (arr === selectedArr && idx === selectedIndex) {
            selectedArr = null;
            selectedIndex = -1;
          }
          updateScenarioList();
        });
      };
      // Кнопка переименования
      const renameBtn = document.createElement('button');
      renameBtn.innerHTML = '';
      renameBtn.appendChild(createIcon('edit'));
      renameBtn.title = t('renameScenario');
      renameBtn.style.marginLeft = '4px';
      renameBtn.onclick = (e) => {
        e.stopPropagation();
        const newName = prompt(t('renameScenarioPrompt'), scenario.name);
        if (newName && newName !== scenario.name) {
          chrome.runtime.sendMessage({ type: 'RENAME_SCENARIO', domain: scenario.domain, name: newName, url: scenario.url, index: idx }, () => {
            scenario.name = newName;
            updateScenarioList();
          });
        }
      };
      // Кнопка/иконка для редактирования описания
      const descBtn = document.createElement('button');
      descBtn.innerHTML = '';
      descBtn.appendChild(createIcon('description'));
      descBtn.title = t('tooltipDesc');
      descBtn.onclick = (e) => {
        e.stopPropagation();
        showScenarioDesc(scenario.desc);
        descTextarea.focus();
        descTextarea.onblur = () => {
          const newDesc = descTextarea.value;
          if (newDesc !== scenario.desc) {
            chrome.runtime.sendMessage({ type: 'RENAME_SCENARIO', domain: scenario.domain, name: scenario.name, desc: newDesc, url: scenario.url, index: idx }, () => {
              scenario.desc = newDesc;
              updateScenarioList();
            });
          }
        };
      };
      li.onclick = () => {
        selectedArr = arr;
        selectedIndex = idx;
        recordedActions = scenario.actions || [];
        playBtn.disabled = !recordedActions.length;
        updateScenarioList();
        statusDiv.textContent = t('selectScenarioStatus', { name: scenario.name, domain: scenario.domain, count: recordedActions.length });
        renderActionsList();
        showScenarioDesc(scenario.desc);
      };
      li.appendChild(renameBtn);
      li.appendChild(delBtn);
      li.appendChild(descBtn);
      scenarioList.appendChild(li);
    });
    renderActionsList();
  }

  playBtn.onclick = () => {
    if (!selectedArr || selectedIndex === -1 || !selectedArr[selectedIndex]) {
      setSelectScenario();
      return;
    }
    const scenario = selectedArr[selectedIndex];
    if (!scenario.actions || !scenario.actions.length) return;
    if (!confirm(t('playActionsConfirm', { name: scenario.name }))) return;
    chrome.tabs.query({active: true, currentWindow: true}, tabs => {
      sendMessageWithRetry(tabs[0].id, {type: 'PLAY_ACTIONS', actions: scenario.actions}, (resp, err) => {
        if (err) {
          statusDiv.textContent = t('errorOnPage') + '\n' + err;
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
    scheduleDiv.innerHTML = `<b>${t('autoRunSchedule')}</b><br><input id="schedule-time" type="time"> <button id="set-schedule">${t('setSchedule')}</button>`;
    document.body.appendChild(scheduleDiv);
  }
  scheduleInput = document.getElementById('schedule-time');
  setScheduleBtn = document.getElementById('set-schedule');
  setScheduleBtn.onclick = () => {
    if (!currentDomain || !scheduleInput.value) return;
    chrome.runtime.sendMessage({ type: 'SCHEDULE_SCENARIO', domain: currentDomain, time: scheduleInput.value }, resp => {
      statusDiv.textContent = t('scheduleSet', { domain: currentDomain, time: scheduleInput.value });
    });
  };
  // Показываем текущее расписание
  chrome.runtime.sendMessage({ type: 'GET_SCHEDULED_TASKS' }, resp => {
    const scheduled = resp.scheduledTasks || {};
    if (scheduled[currentDomain]) {
      scheduleInput.value = scheduled[currentDomain];
      statusDiv.textContent += '\n' + t('autoRunSet', { time: scheduled[currentDomain] });
    }
  });

  // --- Экспорт/импорт сценариев ---
  exportBtn = document.getElementById('exportBtn');
  if (!exportBtn) {
    exportBtn = document.createElement('button');
    exportBtn.id = 'exportBtn';
    exportBtn.textContent = t('exportScenarios');
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
    importBtn.textContent = t('importScenarios');
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
            statusDiv.textContent = t('importSuccess');
          } catch {
            statusDiv.textContent = t('importError');
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
        <span style="margin-left:12px;font-size:14px;">${t('autoRunAll')}</span>
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
  if (startBtn) startBtn.textContent = t('startRecording');
  if (stopBtn) stopBtn.textContent = t('stopRecording');
  if (playBtn) playBtn.textContent = t('playActions');
  if (exportBtn) exportBtn.textContent = t('exportScenarios');
  if (importBtn) importBtn.textContent = t('importScenarios');
  if (searchInput) searchInput.placeholder = t('searchScenario');
  if (autoRunAllSwitch && autoRunAllSwitch.parentElement) autoRunAllSwitch.parentElement.querySelector('span:last-child').textContent = t('autoRunAll');
  if (setScheduleBtn) setScheduleBtn.textContent = t('setSchedule') || 'Установить';
  if (scheduleDiv && scheduleDiv.querySelector('b')) scheduleDiv.querySelector('b').textContent = t('autoRunSchedule') || 'Автозапуск по расписанию:';

  // Локализация тултипов для кнопок
  if (exportBtn) exportBtn.title = t('exportScenarios');
  if (importBtn) importBtn.title = t('importScenarios');
  if (startBtn) startBtn.title = t('startRecording');
  if (stopBtn) stopBtn.title = t('stopRecording');
  if (playBtn) playBtn.title = t('playActions');
  if (setScheduleBtn) setScheduleBtn.title = t('setSchedule') || 'Установить';
  if (autoRunAllSwitch) autoRunAllSwitch.title = t('autoRunAll');

  // Локализация label и placeholder для описания
  const descDiv = document.getElementById('descDiv');
  const descLabel = document.getElementById('descLabel');
  const descTextarea = document.getElementById('scenario-desc');
  if (descLabel) descLabel.textContent = t('descLabel');
  if (descTextarea) descTextarea.placeholder = t('descPlaceholder');

  // --- Описание сценария ---
  function showScenarioDesc(desc) {
    if (!descDiv || !descTextarea) return;
    descDiv.style.display = 'block';
    descTextarea.value = desc || '';
  }
  function hideScenarioDesc() {
    if (!descDiv) return;
    descDiv.style.display = 'none';
  }

  // Theme switch logic
  const themeSwitch = document.getElementById('themeSwitch');
  const themeSwitchLabel = document.getElementById('themeSwitchLabel');
  if (themeSwitch && themeSwitchLabel) {
    chrome.storage.local.get('theme', data => {
      let theme = data.theme || 'auto';
      if (theme === 'dark') themeSwitch.checked = true;
      else themeSwitch.checked = false;
      applyTheme(theme);
    });
    themeSwitch.onchange = () => {
      const theme = themeSwitch.checked ? 'dark' : 'light';
      chrome.storage.local.set({ theme });
      applyTheme(theme);
    };
  }
  function applyTheme(theme) {
    if (theme === 'dark') {
      document.documentElement.setAttribute('data-theme', 'dark');
    } else if (theme === 'light') {
      document.documentElement.setAttribute('data-theme', 'light');
    } else {
      document.documentElement.removeAttribute('data-theme');
    }
  }
  // Автоопределение темы
  if (!localStorage.getItem('theme')) {
    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    applyTheme(prefersDark ? 'dark' : 'light');
  }

  // Пошаговый интерактивный onboarding (примерная реализация)
  function runOnboarding() {
    const steps = [
      { el: startBtn, msg: t('onboardingStep1') },
      { el: stopBtn, msg: t('onboardingStep2') },
      { el: playBtn, msg: t('onboardingStep3') },
      { el: scheduleDiv, msg: t('onboardingStep4') },
      { el: descDiv, msg: t('onboardingStep5') }
    ];
    let idx = 0;
    function showStep(i) {
      if (i >= steps.length) return;
      const { el, msg } = steps[i];
      if (!el) return showStep(i + 1);
      const rect = el.getBoundingClientRect();
      const overlay = document.createElement('div');
      overlay.style.position = 'fixed';
      overlay.style.left = rect.left + 'px';
      overlay.style.top = rect.top + 'px';
      overlay.style.width = rect.width + 'px';
      overlay.style.height = rect.height + 'px';
      overlay.style.background = 'rgba(25,118,210,0.15)';
      overlay.style.zIndex = 9999;
      overlay.style.borderRadius = '8px';
      overlay.style.pointerEvents = 'none';
      document.body.appendChild(overlay);
      const tip = document.createElement('div');
      tip.textContent = msg;
      tip.style.position = 'fixed';
      tip.style.left = (rect.left + rect.width + 10) + 'px';
      tip.style.top = rect.top + 'px';
      tip.style.background = '#fff';
      tip.style.border = '1px solid #1976d2';
      tip.style.borderRadius = '8px';
      tip.style.padding = '12px 18px';
      tip.style.boxShadow = '0 2px 8px #0002';
      tip.style.zIndex = 10000;
      tip.style.maxWidth = '260px';
      tip.style.fontSize = '15px';
      tip.style.color = '#1976d2';
      tip.style.lineHeight = '1.4';
      tip.style.pointerEvents = 'auto';
      const nextBtn = document.createElement('button');
      nextBtn.textContent = t('onboardingOk');
      nextBtn.style.marginTop = '10px';
      nextBtn.style.background = '#1976d2';
      nextBtn.style.color = '#fff';
      nextBtn.style.border = 'none';
      nextBtn.style.borderRadius = '5px';
      nextBtn.style.padding = '6px 18px';
      nextBtn.onclick = () => {
        overlay.remove();
        tip.remove();
        showStep(i + 1);
      };
      tip.appendChild(document.createElement('br'));
      tip.appendChild(nextBtn);
      document.body.appendChild(tip);
    }
    showStep(0);
  }

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
          <p style="font-size:15px;line-height:1.5;margin:10px 0 18px 0;">${t('onboardingWelcome')}<br><br>
          <b>${t('startRecording')}</b> — ${t('onboardingRecord')}<br>
          <b>${t('playActions')}</b> — ${t('onboardingPlay')}<br>
          <b>${t('autoRunAll')}</b> — ${t('onboardingAuto')}</p>
          <button id="onboardingCloseBtn" style="margin-top:10px;padding:8px 24px;font-size:15px;background:#1976d2;color:#fff;border:none;border-radius:5px;">${t('onboardingOk')}</button>
        </div>
      `;
      document.body.appendChild(onboardingDiv);
      document.getElementById('onboardingCloseBtn').onclick = () => {
        onboardingDiv.remove();
        chrome.storage.local.set({ onboardingShown: true });
      };
    }
  });

  // Tooltips для всех кнопок
  if (startBtn) startBtn.title = t('tooltipStart');
  if (stopBtn) stopBtn.title = t('tooltipStop');
  if (playBtn) playBtn.title = t('tooltipPlay');
  if (exportBtn) exportBtn.title = t('tooltipExport');
  if (importBtn) importBtn.title = t('tooltipImport');
  if (autoRunAllSwitch) autoRunAllSwitch.title = t('tooltipAutoRun');
  if (setScheduleBtn) setScheduleBtn.title = t('tooltipSchedule');
  // --- Clear all scenarios button ---
  const clearAllBtn = document.getElementById('clearAllBtn');
  if (clearAllBtn) {
    clearAllBtn.textContent = t('clearAllScenarios');
    clearAllBtn.disabled = false;
    clearAllBtn.style.margin = '10px 0 0 0';
    clearAllBtn.style.background = '#e57373';
    clearAllBtn.style.color = '#fff';
    clearAllBtn.style.fontWeight = 'bold';
    clearAllBtn.onclick = () => {
      if (confirm(t('clearAllConfirm'))) {
        chrome.storage.local.set({ scenarios: {} }, () => {
          scenarios = {};
          updateScenarioList();
          statusDiv.textContent = t('clearAllDone');
        });
      }
    };
  }
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
  let allScenarios = [];
  Object.entries(scenarios).forEach(([key, arr]) => {
    if (Array.isArray(arr)) {
      arr.forEach((scenario, idx) => {
        allScenarios.push({ scenario, idx, arr, key });
      });
    }
  });
  if (allScenarios.length === 0) {
    const li = document.createElement('li');
    li.textContent = t('noActions');
    li.style.color = '#888';
    scenarioList.appendChild(li);
    renderActionsList();
    return;
  }
  allScenarios.forEach(({ scenario, idx, arr, key }) => {
    const name = scenario.name || (scenario.domain + scenario.url);
    const li = document.createElement('li');
    li.textContent = name + (scenario.url === currentUrl ? ' (' + t('current') + ')' : '');
    li.style.cursor = 'pointer';
    li.style.padding = '2px 4px';
    li.style.borderRadius = '4px';
    // Выделение выбранного сценария
    if (arr === selectedArr && idx === selectedIndex) {
      li.classList.add('selected');
    }
    // Drag&drop
    li.setAttribute('draggable', 'true');
    li.ondragstart = (e) => {
      e.dataTransfer.effectAllowed = 'move';
      e.dataTransfer.setData('text/plain', idx);
      li.classList.add('dragging');
    };
    li.ondragend = () => {
      li.classList.remove('dragging');
      scenarioList.querySelectorAll('.drag-over').forEach(el => el.classList.remove('drag-over'));
    };
    li.ondragover = (e) => {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
      li.classList.add('drag-over');
    };
    li.ondragleave = () => {
      li.classList.remove('drag-over');
    };
    li.ondrop = (e) => {
      e.preventDefault();
      li.classList.remove('drag-over');
      const fromIdx = Number(e.dataTransfer.getData('text/plain'));
      const toIdx = idx;
      if (fromIdx === toIdx || arr !== selectedArr) return;
      // Переставляем сценарии внутри массива
      const moved = arr.splice(fromIdx, 1)[0];
      arr.splice(toIdx, 0, moved);
      chrome.storage.local.set({ scenarios }, () => updateScenarioList());
    };
    // Кнопка удаления
    const delBtn = document.createElement('button');
    delBtn.innerHTML = '';
    delBtn.appendChild(createIcon('delete'));
    delBtn.title = t('deleteScenario', { name });
    delBtn.style.marginLeft = '8px';
    delBtn.onclick = (e) => {
      e.stopPropagation();
      arr.splice(idx, 1);
      chrome.storage.local.set({ scenarios }, () => {
        // Если удалили выбранный — сбросить выбор
        if (arr === selectedArr && idx === selectedIndex) {
          selectedArr = null;
          selectedIndex = -1;
        }
        updateScenarioList();
      });
    };
    // Кнопка переименования
    const renameBtn = document.createElement('button');
    renameBtn.innerHTML = '';
    renameBtn.appendChild(createIcon('edit'));
    renameBtn.title = t('renameScenario');
    renameBtn.style.marginLeft = '4px';
    renameBtn.onclick = (e) => {
      e.stopPropagation();
      const newName = prompt(t('renameScenarioPrompt'), scenario.name);
      if (newName && newName !== scenario.name) {
        chrome.runtime.sendMessage({ type: 'RENAME_SCENARIO', domain: scenario.domain, name: newName, url: scenario.url, index: idx }, () => {
          scenario.name = newName;
          updateScenarioList();
        });
      }
    };
    // Кнопка/иконка для редактирования описания
    const descBtn = document.createElement('button');
    descBtn.innerHTML = '';
    descBtn.appendChild(createIcon('description'));
    descBtn.title = t('tooltipDesc');
    descBtn.onclick = (e) => {
      e.stopPropagation();
      showScenarioDesc(scenario.desc);
      descTextarea.focus();
      descTextarea.onblur = () => {
        const newDesc = descTextarea.value;
        if (newDesc !== scenario.desc) {
          chrome.runtime.sendMessage({ type: 'RENAME_SCENARIO', domain: scenario.domain, name: scenario.name, desc: newDesc, url: scenario.url, index: idx }, () => {
            scenario.desc = newDesc;
            updateScenarioList();
          });
        }
      };
    };
    li.onclick = () => {
      selectedArr = arr;
      selectedIndex = idx;
      recordedActions = scenario.actions || [];
      playBtn.disabled = !recordedActions.length;
      updateScenarioList();
      statusDiv.textContent = t('selectScenarioStatus', { name: scenario.name, domain: scenario.domain, count: recordedActions.length });
      renderActionsList();
      showScenarioDesc(scenario.desc);
    };
    li.appendChild(renameBtn);
    li.appendChild(delBtn);
    li.appendChild(descBtn);
    scenarioList.appendChild(li);
  });
  renderActionsList();
}

playBtn.onclick = () => {
  if (!selectedArr || selectedIndex === -1 || !selectedArr[selectedIndex]) {
    setSelectScenario();
    return;
  }
  const scenario = selectedArr[selectedIndex];
  if (!scenario.actions || !scenario.actions.length) return;
  if (!confirm(t('playActionsConfirm', { name: scenario.name }))) return;
  chrome.tabs.query({active: true, currentWindow: true}, tabs => {
    sendMessageWithRetry(tabs[0].id, {type: 'PLAY_ACTIONS', actions: scenario.actions}, (resp, err) => {
      if (err) {
        statusDiv.textContent = t('errorOnPage') + '\n' + err;
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
  scheduleDiv.innerHTML = `<b>${t('autoRunSchedule')}</b><br><input id="schedule-time" type="time"> <button id="set-schedule">${t('setSchedule')}</button>`;
  document.body.appendChild(scheduleDiv);
}
scheduleInput = document.getElementById('schedule-time');
setScheduleBtn = document.getElementById('set-schedule');
setScheduleBtn.onclick = () => {
  if (!currentDomain || !scheduleInput.value) return;
  chrome.runtime.sendMessage({ type: 'SCHEDULE_SCENARIO', domain: currentDomain, time: scheduleInput.value }, resp => {
    statusDiv.textContent = t('scheduleSet', { domain: currentDomain, time: scheduleInput.value });
  });
};
// Показываем текущее расписание
chrome.runtime.sendMessage({ type: 'GET_SCHEDULED_TASKS' }, resp => {
  const scheduled = resp.scheduledTasks || {};
  if (scheduled[currentDomain]) {
    scheduleInput.value = scheduled[currentDomain];
    statusDiv.textContent += '\n' + t('autoRunSet', { time: scheduled[currentDomain] });
  }
});

// --- Экспорт/импорт сценариев ---
exportBtn = document.getElementById('exportBtn');
if (!exportBtn) {
  exportBtn = document.createElement('button');
  exportBtn.id = 'exportBtn';
  exportBtn.textContent = t('exportScenarios');
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
  importBtn.textContent = t('importScenarios');
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
          statusDiv.textContent = t('importSuccess');
        } catch {
          statusDiv.textContent = t('importError');
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
      <span style="margin-left:12px;font-size:14px;">${t('autoRunAll')}</span>
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

// --- Clear all scenarios button ---
let clearAllBtn = document.getElementById('clearAllBtn');
if (!clearAllBtn) {
  clearAllBtn = document.createElement('button');
  clearAllBtn.id = 'clearAllBtn';
  clearAllBtn.textContent = t('clearAllScenarios');
  clearAllBtn.style.margin = '10px 0 0 0';
  clearAllBtn.style.background = '#e57373';
  clearAllBtn.style.color = '#fff';
  clearAllBtn.style.fontWeight = 'bold';
  clearAllBtn.onclick = () => {
    if (confirm(t('clearAllConfirm'))) {
      chrome.storage.local.set({ scenarios: {} }, () => {
        scenarios = {};
        updateScenarioList();
        statusDiv.textContent = t('clearAllDone');
      });
    }
  };
  document.body.appendChild(clearAllBtn);
}

// Пошаговый интерактивный onboarding (примерная реализация)
function runOnboarding() {
  const steps = [
    { el: startBtn, msg: t('onboardingStep1') },
    { el: stopBtn, msg: t('onboardingStep2') },
    { el: playBtn, msg: t('onboardingStep3') },
    { el: scheduleDiv, msg: t('onboardingStep4') },
    { el: descDiv, msg: t('onboardingStep5') }
  ];
  let idx = 0;
  function showStep(i) {
    if (i >= steps.length) return;
    const { el, msg } = steps[i];
    if (!el) return showStep(i + 1);
    const rect = el.getBoundingClientRect();
    const overlay = document.createElement('div');
    overlay.style.position = 'fixed';
    overlay.style.left = rect.left + 'px';
    overlay.style.top = rect.top + 'px';
    overlay.style.width = rect.width + 'px';
    overlay.style.height = rect.height + 'px';
    overlay.style.background = 'rgba(25,118,210,0.15)';
    overlay.style.zIndex = 9999;
    overlay.style.borderRadius = '8px';
    overlay.style.pointerEvents = 'none';
    document.body.appendChild(overlay);
    const tip = document.createElement('div');
    tip.textContent = msg;
    tip.style.position = 'fixed';
    tip.style.left = (rect.left + rect.width + 10) + 'px';
    tip.style.top = rect.top + 'px';
    tip.style.background = '#fff';
    tip.style.border = '1px solid #1976d2';
    tip.style.borderRadius = '8px';
    tip.style.padding = '12px 18px';
    tip.style.boxShadow = '0 2px 8px #0002';
    tip.style.zIndex = 10000;
    tip.style.maxWidth = '260px';
    tip.style.fontSize = '15px';
    tip.style.color = '#1976d2';
    tip.style.lineHeight = '1.4';
    tip.style.pointerEvents = 'auto';
    const nextBtn = document.createElement('button');
    nextBtn.textContent = t('onboardingOk');
    nextBtn.style.marginTop = '10px';
    nextBtn.style.background = '#1976d2';
    nextBtn.style.color = '#fff';
    nextBtn.style.border = 'none';
    nextBtn.style.borderRadius = '5px';
    nextBtn.style.padding = '6px 18px';
    nextBtn.onclick = () => {
      overlay.remove();
      tip.remove();
      showStep(i + 1);
    };
    tip.appendChild(document.createElement('br'));
    tip.appendChild(nextBtn);
    document.body.appendChild(tip);
  }
  showStep(0);
}

// Onboarding запускать при первом запуске
chrome.storage.local.get('onboardingV2Shown', data => {
  if (!data.onboardingV2Shown) {
    runOnboarding();
    chrome.storage.local.set({ onboardingV2Shown: true });
  }
});

// Material Icons for scenario list actions
function createIcon(name) {
  const i = document.createElement('span');
  i.className = 'material-icons';
  i.style.fontSize = '18px';
  i.style.verticalAlign = 'middle';
  i.textContent = name;
  return i;
}

// Add new localization keys for scheduleSet and autoRunSet if not present in locales
