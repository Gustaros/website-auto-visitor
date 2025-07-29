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
  const runAllBtn = document.getElementById('run-all-btn');

  let recordedActions = [];
  let currentDomain = '';
  let currentUrl = '';
  let scenarios = {};
  let selectedDomain = '';
  let selectedName = '';
  let selectedArr = null;
  let selectedIndex = -1;
  let scheduledTasks = {};

  // Вспомогательные DOM-элементы объявляются один раз
  let actionsDiv, scheduleDiv, scheduleInput, setScheduleBtn, exportBtn, importBtn, autoRunSwitchDiv, autoRunAllSwitch, searchDiv, searchInput;
  let scenarioFilter = '';

  // Назначаем только один обработчик Stop Recording
  stopBtn.onclick = () => {
    chrome.tabs.query({active: true, currentWindow: true}, tabs2 => {
      sendMessageWithRetry(tabs2[0].id, {type: 'STOP_RECORDING'}, (resp2, err2) => {
        if (err2) {
          statusDiv.textContent = t('errorOnPage') + '\n' + err2;
          return;
        }
        recordedActions = resp2.actions || [];
        setStatusStopped(recordedActions.length);
        startBtn.disabled = false;
        stopBtn.disabled = true;
        playBtn.disabled = recordedActions.length === 0;
        chrome.storage.local.set({ recording: false });
        // После остановки всегда обновляем сценарии и UI
        chrome.runtime.sendMessage({type: 'GET_SCENARIOS'}, resp => {
          scenarios = resp.scenarios || {};
          updateScenarioList();
        });
      });
    });
  };

  // Получаем домен текущей вкладки и статус записи
  chrome.tabs.query({active: true, currentWindow: true}, tabs => {
    const tabId = tabs[0]?.id;
    if (!tabId) return;
    chrome.tabs.sendMessage(tabId, { type: 'GET_RECORDING_STATUS' }, resp => {
      if (resp && resp.recording) {
        statusDiv.textContent = t('statusRecording');
        startBtn.disabled = true;
        stopBtn.disabled = false;
        stopBtn.style.border = '';
        playBtn.disabled = true;
        showHotkeyHint();
        // Показываем список сценариев даже во время записи
        chrome.runtime.sendMessage({type: 'GET_SCENARIOS'}, resp => {
          scenarios = resp.scenarios || {};
          updateScenarioList();
        });
      } else {
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
        stopBtn.disabled = true;
      }
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
        statusDiv.textContent = t('statusRecording') + ' (Ctrl+Shift+S)';
        startBtn.disabled = true;
        stopBtn.disabled = false;
        playBtn.disabled = true;
        showHotkeyHint();
      });
    });
  };

  stopBtn.onclick = () => {
    chrome.tabs.query({active: true, currentWindow: true}, tabs2 => {
      sendMessageWithRetry(tabs2[0].id, {type: 'STOP_RECORDING'}, (resp2, err2) => {
        if (err2) {
          statusDiv.textContent = t('errorOnPage') + '\n' + err2;
          return;
        }
        recordedActions = resp2.actions || [];
        setStatusStopped(recordedActions.length);
        startBtn.disabled = false;
        stopBtn.disabled = true;
        playBtn.disabled = recordedActions.length === 0;
        chrome.storage.local.set({ recording: false });
        // После остановки всегда обновляем сценарии и UI
        chrome.runtime.sendMessage({type: 'GET_SCENARIOS'}, resp => {
          scenarios = resp.scenarios || {};
          updateScenarioList();
        });
      });
    });
  };

  // --- Поиск по имени сценария ---
  searchDiv = document.getElementById('searchDiv');
  searchInput = document.getElementById('scenario-search');
  if (searchInput) {
    searchInput.oninput = () => {
      scenarioFilter = searchInput.value.trim().toLowerCase();
      updateScenarioList();
    };
  }

  chrome.runtime.sendMessage({ type: 'GET_SCHEDULED_TASKS' }, resp => {
    scheduledTasks = resp.scheduledTasks || {};
    updateScenarioList();
  });

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
      
      // Create name span with proper CSS class
      const nameSpan = document.createElement('span');
      nameSpan.className = 'scenario-name';
      nameSpan.textContent = name + (scenario.url === currentUrl ? ' (' + t('current') + ')' : '');
      nameSpan.onclick = () => {
        selectedArr = arr;
        selectedIndex = idx;
        recordedActions = scenario.actions || [];
        playBtn.disabled = !recordedActions.length;
        updateScenarioList();
        statusDiv.textContent = t('selectScenarioStatus', { name: scenario.name, domain: scenario.domain, count: recordedActions.length });
        renderActionsList();
        // Show scenario description
        const descDiv = document.getElementById('descDiv');
        const descTextarea = document.getElementById('scenario-desc');
        if (descDiv && scenario.desc) {
          descDiv.style.display = 'block';
          if (descTextarea) descTextarea.value = scenario.desc;
        }
      };
      li.appendChild(nameSpan);
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
      // Create controls container
      const controlsDiv = document.createElement('div');
      controlsDiv.className = 'scenario-controls';
      
      // Кнопка переименования
      const renameBtn = document.createElement('button');
      renameBtn.className = 'btn-sm btn-edit';
      renameBtn.appendChild(createIcon('edit'));
      renameBtn.title = t('renameScenario');
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
      descBtn.className = 'btn-sm btn-desc';
      descBtn.appendChild(createIcon('description'));
      descBtn.title = t('tooltipDesc');
      descBtn.onclick = (e) => {
        e.stopPropagation();
        const descDiv = document.getElementById('descDiv');
        const descTextarea = document.getElementById('scenario-desc');
        if (descDiv) descDiv.style.display = 'block';
        if (descTextarea) {
          descTextarea.value = scenario.desc || '';
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
        }
      };
      
      // Кнопка удаления
      const delBtn = document.createElement('button');
      delBtn.className = 'btn-sm btn-delete';
      delBtn.appendChild(createIcon('delete'));
      delBtn.title = t('deleteScenario', { name });
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
      
      controlsDiv.appendChild(renameBtn);
      controlsDiv.appendChild(descBtn);
      controlsDiv.appendChild(delBtn);
      // --- Индивидуальное расписание ---
      const scheduleWrap = document.createElement('span');
      scheduleWrap.style.marginLeft = '10px';
      const timeInput = document.createElement('input');
      timeInput.type = 'time';
      timeInput.style.width = '80px';
      // Открывать time picker по любому клику
      timeInput.onclick = () => { if (timeInput.showPicker) timeInput.showPicker(); };
      const schedKey = scenario.url + '__' + idx;
      timeInput.value = scheduledTasks[schedKey] || '';
      timeInput.title = t('autoRunSchedule');
      const setBtn = document.createElement('button');
      setBtn.textContent = t('setSchedule');
      setBtn.style.marginLeft = '2px';
      setBtn.onclick = (e) => {
        e.stopPropagation();
        if (!timeInput.value) return;
        chrome.runtime.sendMessage({ type: 'SCHEDULE_SCENARIO', url: scenario.url, index: idx, time: timeInput.value }, resp => {
          scheduledTasks[schedKey] = timeInput.value;
          statusDiv.textContent = t('scheduleSet', { domain: name, time: timeInput.value });
        });
      };
      scheduleWrap.appendChild(timeInput);
      scheduleWrap.appendChild(setBtn);
      controlsDiv.appendChild(scheduleWrap);
      
      li.appendChild(controlsDiv);
      scenarioList.appendChild(li);
    });
    renderActionsList();
  }

  if (playBtn) playBtn.onclick = () => {
    if (!selectedArr || selectedIndex === -1 || !selectedArr[selectedIndex]) {
      setSelectScenario();
      return;
    }
    const scenario = selectedArr[selectedIndex];
    if (!scenario.actions || !scenario.actions.length) return;
    if (!confirm(t('playActionsConfirm', { name: scenario.name }))) return;
    chrome.tabs.query({active: true, currentWindow: true}, tabs => {
      const tab = tabs[0];
      // Проверяем, совпадает ли url активной вкладки с url сценария
      if (tab && tab.url && tab.url.split('#')[0].split('?')[0] === scenario.url.split('#')[0].split('?')[0]) {
        // На нужной странице — проиграть сценарий и не закрывать вкладку
        sendMessageWithRetry(tab.id, {type: 'PLAY_ACTIONS', actions: scenario.actions}, (resp, err) => {
          if (err) {
            statusDiv.textContent = t('errorOnPage') + '\n' + err;
            return;
          }
          setStatusPlaying();
        });
      } else {
        // Не на нужной странице — открыть новую вкладку, проиграть сценарий и закрыть
        chrome.tabs.create({ url: scenario.url, active: false }, newTab => {
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
      }
    });
  };

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

  // Кнопка "Запустить все сценарии"
  if (runAllBtn) {
    runAllBtn.textContent = t('runAllScenarios') || 'Запустить все сценарии';
    runAllBtn.title = t('runAllScenarios') || 'Запустить все сценарии';
    runAllBtn.onclick = () => {
      runAllBtn.disabled = true;
      chrome.storage.local.get('scenarios', data => {
        const scenarios = data.scenarios || {};
        let total = 0;
        Object.entries(scenarios).forEach(([url, arr]) => {
          if (!Array.isArray(arr)) return;
          arr.forEach((scenario, idx) => {
            if (!scenario.url) return;
            total++;
            chrome.tabs.create({ url: scenario.url, active: false }, newTab => {
              const listener = function(tabId, info) {
                if (tabId === newTab.id && info.status === 'complete') {
                  console.log('[Website Auto Visitor] Tab loaded, waiting before sending PLAY_ACTIONS', tabId, scenario.url);
                  setTimeout(() => {
                    console.log('[Website Auto Visitor] Sending PLAY_ACTIONS to tab', tabId, scenario.url, scenario.actions);
                    chrome.tabs.sendMessage(tabId, { type: 'PLAY_ACTIONS', actions: scenario.actions || [] }, (resp) => {
                      console.log('[Website Auto Visitor] PLAY_ACTIONS sendMessage callback', resp);
                    });
                    setTimeout(() => chrome.tabs.remove(tabId), 10000);
                    chrome.tabs.onUpdated.removeListener(listener);
                  }, 1500);
                }
              };
              chrome.tabs.onUpdated.addListener(listener);
            });
          });
        });
        statusDiv.textContent = t('runAllStarted') || `Запущено сценариев: ${total}`;
        setTimeout(() => { runAllBtn.disabled = false; }, 5000);
      });
    };
  }

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

  // --- Advanced Section Toggle ---
  const advancedDiv = document.getElementById('advancedDiv');
  if (advancedDiv) {
    const toggleBtn = advancedDiv.querySelector('.toggle-button');
    const contentDiv = advancedDiv.querySelector('.content');
    const arrowIcon = toggleBtn ? toggleBtn.querySelector('.material-icons') : null;
    
    let expanded = false;
    
    if (toggleBtn && contentDiv) {
      // Update button text with localization
      const textSpan = toggleBtn.querySelector('span:first-child');
      if (textSpan) textSpan.textContent = t('advancedSection') || 'Advanced';
      
      // Toggle functionality
      toggleBtn.onclick = () => {
        expanded = !expanded;
        contentDiv.style.display = expanded ? 'block' : 'none';
        
        // Rotate arrow icon
        if (arrowIcon) {
          arrowIcon.style.transform = expanded ? 'rotate(180deg)' : 'rotate(0deg)';
        }
        
        // Update button border radius
        toggleBtn.style.borderRadius = expanded ? 'var(--radius-lg) var(--radius-lg) 0 0' : 'var(--radius-lg)';
      };
    }
  }

  // === Feedback & Rate Extension ===
  (function addFeedbackAndRate() {
    if (document.getElementById('rateExtBtn')) return;
    const container = document.createElement('div');
    container.style.display = 'flex';
    container.style.justifyContent = 'center';
    container.style.alignItems = 'center';
    container.style.gap = '10px';
    container.style.margin = '18px 0 0 0';

    // Rate button
    const rateBtn = document.createElement('button');
    rateBtn.id = 'rateExtBtn';
    rateBtn.innerHTML = '<span class="material-icons" style="vertical-align:middle;font-size:18px;">star_rate</span> ' + (typeof chrome !== 'undefined' && chrome.i18n ? chrome.i18n.getMessage('rateExtension') || 'Rate extension' : 'Rate extension');
    rateBtn.style.background = '#ffd54f';
    rateBtn.style.color = '#333';
    rateBtn.style.fontWeight = 'bold';
    rateBtn.style.border = 'none';
    rateBtn.style.borderRadius = '5px';
    rateBtn.style.padding = '6px 16px';
    rateBtn.style.cursor = 'pointer';
    rateBtn.onclick = () => {
      // Открыть страницу расширения в магазине (Chrome Web Store, Edge Addons, AMO)
      const urls = [
        'https://chrome.google.com/webstore/detail/website-auto-visitor/','https://microsoftedge.microsoft.com/addons/detail/','https://addons.mozilla.org/firefox/addon/'
      ];
      // Можно заменить на актуальный id/ссылку
      window.open(urls[0], '_blank');
    };

    // Feedback link
    const feedbackLink = document.createElement('a');
    feedbackLink.id = 'feedbackLink';
    feedbackLink.href = 'https://github.com/Gustaros/website-auto-visitor/issues';
    feedbackLink.target = '_blank';
    feedbackLink.rel = 'noopener noreferrer';
    feedbackLink.style.color = '#1976d2';
    feedbackLink.style.fontSize = '14px';
    feedbackLink.style.textDecoration = 'none';
    feedbackLink.style.display = 'flex';
    feedbackLink.style.alignItems = 'center';
    feedbackLink.innerHTML = '<span class="material-icons" style="font-size:18px;vertical-align:middle;">feedback</span> <span style="margin-left:4px;">Feedback</span>';

    container.appendChild(rateBtn);
    container.appendChild(feedbackLink);
    document.body.appendChild(container);

    // === Privacy Policy link (добавляем в самый низ) ===
    if (!document.getElementById('privacyPolicyLink')) {
      const privacyDiv = document.createElement('div');
      privacyDiv.style.textAlign = 'center';
      privacyDiv.style.margin = '18px 0 0 0';
      privacyDiv.style.fontSize = '13px';
      const privacyLink = document.createElement('a');
      privacyLink.id = 'privacyPolicyLink';
      privacyLink.href = 'privacy.html';
      privacyLink.target = '_blank';
      privacyLink.style.color = '#1976d2';
      privacyLink.style.textDecoration = 'underline';
      privacyLink.textContent = 'Privacy Policy';
      privacyDiv.appendChild(privacyLink);
      document.body.appendChild(privacyDiv);
    }
  })();

  function setStatusRecording() { statusDiv.textContent = t('statusRecording'); }
  function setStatusStopped(count) { statusDiv.textContent = t('statusStopped', { count }); }
  function setStatusPlaying() { statusDiv.textContent = t('statusPlaying'); }
  function setDomainStatus(domain) { statusDiv.textContent = t('domain', { domain }); }
  function setSelectScenario() { statusDiv.textContent = t('selectScenario'); }
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
    // Вместо textContent используем span для имени
    const nameSpan = document.createElement('span');
    nameSpan.textContent = name + (scenario.url === currentUrl ? ' (' + t('current') + ')' : '');
    nameSpan.style.flex = '1 1 auto';
    nameSpan.style.cursor = 'pointer';
    nameSpan.onclick = () => {
      selectedArr = arr;
      selectedIndex = idx;
      recordedActions = scenario.actions || [];
      playBtn.disabled = !recordedActions.length;
      updateScenarioList();
      statusDiv.textContent = t('selectScenarioStatus', { name: scenario.name, domain: scenario.domain, count: recordedActions.length });
      renderActionsList();
      showScenarioDesc(scenario.desc);
    };
    li.appendChild(nameSpan);
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
    // --- Индивидуальное расписание ---
    const scheduleWrap = document.createElement('span');
    scheduleWrap.style.marginLeft = '10px';
    const timeInput = document.createElement('input');
    timeInput.type = 'time';
    timeInput.style.width = '80px';
    // Открывать time picker по любому клику
    timeInput.onclick = () => { if (timeInput.showPicker) timeInput.showPicker(); };
    const schedKey = scenario.url + '__' + idx;
    timeInput.value = scheduledTasks[schedKey] || '';
    timeInput.title = t('autoRunSchedule');
    const setBtn = document.createElement('button');
    setBtn.textContent = t('setSchedule');
    setBtn.style.marginLeft = '2px';
    setBtn.onclick = (e) => {
      e.stopPropagation();
      if (!timeInput.value) return;
      chrome.runtime.sendMessage({ type: 'SCHEDULE_SCENARIO', url: scenario.url, index: idx, time: timeInput.value }, resp => {
        scheduledTasks[schedKey] = timeInput.value;
        statusDiv.textContent = t('scheduleSet', { domain: name, time: timeInput.value });
      });
    };
    scheduleWrap.appendChild(timeInput);
    scheduleWrap.appendChild(setBtn);
    li.appendChild(scheduleWrap);
    li.appendChild(renameBtn);
    li.appendChild(delBtn);
    li.appendChild(descBtn);
    scenarioList.appendChild(li);
  });
  renderActionsList();
}

// Global helper functions that may be called from within the DOMContentLoaded event listener

// Material Icons for scenario list actions
function createIcon(name) {
  const i = document.createElement('span');
  i.className = 'material-icons';
  i.style.fontSize = '18px';
  i.style.verticalAlign = 'middle';
  i.textContent = name;
  return i;
}

// Всплывающая подсказка о горячей клавише
function showHotkeyHint() {
  if (document.getElementById('hotkeyHint')) return;
  const hint = document.createElement('div');
  hint.id = 'hotkeyHint';
  hint.textContent = t('hotkeyHintStopRecording');
  hint.style.position = 'fixed';
  hint.style.bottom = '18px';
  hint.style.left = '50%';
  hint.style.transform = 'translateX(-50%)';
  hint.style.background = 'var(--color-accent)';
  hint.style.color = '#fff';
  hint.style.padding = '10px 18px';
  hint.style.borderRadius = '8px';
  hint.style.boxShadow = 'var(--shadow-md)';
  hint.style.zIndex = 10001;
  hint.style.fontSize = '15px';
  hint.style.textAlign = 'center';
  document.body.appendChild(hint);
  setTimeout(() => { hint.remove(); }, 5000);
}

// Placeholder for renderActionsList function
function renderActionsList() {
  // This function is called but not fully implemented in the original code
}
