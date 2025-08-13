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

document.addEventListener('DOMContentLoaded', () => {
  console.log('DOMContentLoaded');
  const startBtn = document.getElementById('start-record');
  const stopBtn = document.getElementById('stop-record');
  const playBtn = document.getElementById('play-actions');
  const statusDiv = document.getElementById('status');
  const scenarioList = document.getElementById('scenario-list');
  const runAllBtn = document.getElementById('run-all-btn');
  
  // --- Custom Modal Elements ---
  const modalOverlay = document.getElementById('custom-modal-overlay');
  const modalTitle = document.getElementById('modal-title');
  const modalMessage = document.getElementById('modal-message');
  const modalButtons = document.getElementById('modal-buttons');
  const modalInputContainer = document.getElementById('modal-input-container');
  const modalInput = document.getElementById('modal-input');

  let recordedActions = [];
  let currentDomain = '';
  let currentUrl = '';
  let scenarios = {};
  let selectedArr = null;
  let selectedIndex = -1;
  let scheduledTasks = {};

  // --- Custom Dialog Function ---
  function showCustomDialog(options) {
    modalTitle.textContent = options.title || '';
    modalMessage.textContent = options.message || '';
    modalButtons.innerHTML = '';

    if (options.input) {
      modalInputContainer.style.display = 'block';
      modalInput.value = options.input.defaultValue || '';
      modalInput.placeholder = options.input.placeholder || '';
    } else {
      modalInputContainer.style.display = 'none';
    }

    options.buttons.forEach(btnInfo => {
      const button = document.createElement('button');
      button.textContent = btnInfo.text;
      button.className = btnInfo.class || 'btn-secondary';
      button.onclick = () => {
        modalOverlay.style.display = 'none';
        if (btnInfo.onClick) {
          const inputValue = options.input ? modalInput.value : null;
          btnInfo.onClick(inputValue);
        }
      };
      modalButtons.appendChild(button);
    });

    modalOverlay.style.display = 'flex';
    if (options.input) {
      modalInput.focus();
    }
  }

  function getValidUrl(url) {
    if (typeof url !== 'string') return null;
    let fixedUrl = url.trim();
    fixedUrl = fixedUrl.replace(/^(https?:\/\/)+/gi, '').replace(/^https?:\/\//gi, '');
    fixedUrl = 'https://' + fixedUrl;
    try {
      new URL(fixedUrl);
      return fixedUrl;
    } catch (e) {
      console.warn('[getValidUrl] Invalid URL after fixing:', fixedUrl, e);
      return null;
    }
  }

  let scenarioFilter = '';

  stopBtn.onclick = () => {
    chrome.tabs.query({active: true, currentWindow: true}, tabs2 => {
      sendMessageWithRetry(tabs2[0].id, {type: 'STOP_RECORDING'}, (resp2, err2) => {
        if (err2) {
          showCustomDialog({ title: t('errorOnPage'), message: err2, buttons: [{ text: 'OK' }] });
          return;
        }
        recordedActions = resp2.actions || [];
        setStatusStopped(recordedActions.length);
        startBtn.disabled = false;
        stopBtn.disabled = true;
        playBtn.disabled = recordedActions.length === 0;
        chrome.storage.local.set({ recording: false });
        chrome.runtime.sendMessage({type: 'GET_SCENARIOS'}, resp => {
          scenarios = resp.scenarios || {};
          updateScenarioList();
        });
      });
    });
  };

  chrome.tabs.query({active: true, currentWindow: true}, tabs => {
    const tabId = tabs[0]?.id;
    if (!tabId) return;
    chrome.tabs.sendMessage(tabId, { type: 'GET_RECORDING_STATUS' }, resp => {
      if (resp && resp.recording) {
        statusDiv.textContent = t('statusRecording');
        startBtn.disabled = true;
        stopBtn.disabled = false;
        playBtn.disabled = true;
        showHotkeyHint();
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
            statusDiv.className = 'header-status error';
            startBtn.disabled = true;
            stopBtn.disabled = true;
            playBtn.disabled = true;
            return;
          }
          const parsed = new URL(url);
          currentDomain = parsed.hostname;
          currentUrl = url;
          statusDiv.textContent = t('currentSite') + ' ' + currentDomain;
          statusDiv.className = 'header-status success';
        } catch {
          statusDiv.textContent = t('errorDomainDetect');
          statusDiv.className = 'header-status error';
          startBtn.disabled = true;
          stopBtn.disabled = true;
          playBtn.disabled = true;
          return;
        }
        chrome.runtime.sendMessage({type: 'GET_SCENARIOS'}, resp => {
          scenarios = resp.scenarios || {};
          updateScenarioList();
        });
        stopBtn.disabled = true;
      }
    });
  });

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
          showCustomDialog({ title: t('errorOnPage'), message: err, buttons: [{ text: 'OK' }] });
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

  const searchInput = document.getElementById('scenario-search');
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

  let draggedItem = null;
  let draggedItemData = {};

  function updateScenarioList() {
    if (!scenarioList) return;
    const scrollTop = scenarioList.scrollTop;
    scenarioList.innerHTML = '';
    let allScenarios = [];
    
    // Собираем все сценарии в один плоский массив для удобства
    Object.entries(scenarios).forEach(([key, arr]) => {
      if (Array.isArray(arr)) {
        arr.forEach((scenario, idx) => {
          if (!scenarioFilter || scenario.name.toLowerCase().includes(scenarioFilter)) {
            allScenarios.push({ scenario, originalIndex: idx, originalArray: arr, originalKey: key });
          }
        });
      }
    });

    if (allScenarios.length === 0) {
      scenarioList.innerHTML = '<li class="empty-list-message">' + t('noScenariosFound') + '</li>';
      return;
    }

    allScenarios.forEach(({ scenario, originalIndex, originalArray, originalKey }, displayIndex) => {
      const name = scenario.name || (scenario.domain + scenario.url);
      const li = document.createElement('li');
      li.draggable = true;
      li.dataset.key = originalKey;
      li.dataset.index = originalIndex;
      
      li.onclick = () => {
        selectedArr = originalArray;
        selectedIndex = originalIndex;
        recordedActions = scenario.actions || [];
        playBtn.disabled = !recordedActions.length;
        updateScenarioList();
        statusDiv.textContent = t('selectScenarioStatus', { name: scenario.name });
        renderActionsList();
        const descDiv = document.getElementById('descDiv');
        const descTextarea = document.getElementById('scenario-desc');
        if (descDiv && scenario.desc) {
          descDiv.style.display = 'block';
          if (descTextarea) descTextarea.value = scenario.desc;
        } else if (descDiv) {
          descDiv.style.display = 'none';
        }
      };
      
      const nameSpan = document.createElement('span');
      nameSpan.className = 'scenario-name';
      nameSpan.textContent = name + (scenario.url === currentUrl ? ' (' + t('current') + ')' : '');
      li.appendChild(nameSpan);

      if (originalArray === selectedArr && originalIndex === selectedIndex) {
        li.classList.add('selected');
      }

      const controlsDiv = document.createElement('div');
      controlsDiv.className = 'scenario-controls';
      
      const renameBtn = document.createElement('button');
      renameBtn.className = 'btn-sm btn-edit';
      renameBtn.appendChild(createIcon('edit'));
      renameBtn.title = t('renameScenario');
      renameBtn.onclick = (e) => {
        e.stopPropagation();
        showCustomDialog({
          title: t('renameScenario'),
          message: t('renameScenarioPrompt'),
          input: { defaultValue: scenario.name },
          buttons: [
            { text: t('onboardingOk'), class: 'btn-primary', onClick: (newName) => {
              if (newName && newName !== scenario.name) {
                chrome.runtime.sendMessage({ type: 'RENAME_SCENARIO', domain: scenario.domain, name: newName, url: scenario.url, index: originalIndex }, () => {
                  scenario.name = newName;
                  updateScenarioList();
                });
              }
            }},
            { text: 'Cancel' }
          ]
        });
      };

      const descBtn = document.createElement('button');
      descBtn.className = 'btn-sm btn-desc';
      descBtn.appendChild(createIcon('description'));
      descBtn.title = t('tooltipDesc');
      descBtn.onclick = (e) => {
        e.stopPropagation();
        showCustomDialog({
          title: t('descLabel'),
          message: t('descPlaceholder'),
          input: { defaultValue: scenario.desc || '', placeholder: t('descPlaceholder') },
          buttons: [
            { text: t('onboardingOk'), class: 'btn-primary', onClick: (newDesc) => {
              if (newDesc !== scenario.desc) {
                chrome.runtime.sendMessage({ type: 'RENAME_SCENARIO', domain: scenario.domain, name: scenario.name, desc: newDesc, url: scenario.url, index: originalIndex }, () => {
                  scenario.desc = newDesc;
                  updateScenarioList();
                });
              }
            }},
            { text: 'Cancel' }
          ]
        });
      };
      
      const delBtn = document.createElement('button');
      delBtn.className = 'btn-sm btn-delete';
      delBtn.appendChild(createIcon('delete'));
      delBtn.title = t('deleteScenario', { name });
      delBtn.onclick = (e) => {
        e.stopPropagation();
        showCustomDialog({
          title: t('deleteScenario', { name }),
          message: t('deleteScenarioConfirm', { name }),
          buttons: [
            { text: t('deleteAction'), class: 'btn-danger', onClick: () => {
              originalArray.splice(originalIndex, 1);
              chrome.storage.local.set({ scenarios }, () => {
                if (originalArray === selectedArr && originalIndex === selectedIndex) {
                  selectedArr = null;
                  selectedIndex = -1;
                }
                updateScenarioList();
              });
            }},
            { text: 'Cancel' }
          ]
        });
      };

      const scheduleWrap = document.createElement('span');
      scheduleWrap.style.marginLeft = '4px';
      const timeInput = document.createElement('input');
      timeInput.type = 'time';
      timeInput.style.width = '60px';
      timeInput.style.fontSize = '10px';
      timeInput.style.height = '20px';
      timeInput.onclick = (e) => { e.stopPropagation(); if (timeInput.showPicker) timeInput.showPicker(); };
      const schedKey = scenario.url + '__' + originalIndex;
      timeInput.value = scheduledTasks[schedKey] || '';
      timeInput.title = t('autoRunSchedule');
      const setBtn = document.createElement('button');
      setBtn.textContent = t('setSchedule');
      setBtn.style.marginLeft = '2px';
      setBtn.style.fontSize = '10px';
      setBtn.style.padding = '2px 4px';
      setBtn.style.height = '20px';
      setBtn.onclick = (e) => {
        e.stopPropagation();
        if (!timeInput.value) return;
        chrome.runtime.sendMessage({ type: 'SCHEDULE_SCENARIO', url: scenario.url, index: originalIndex, time: timeInput.value }, resp => {
          scheduledTasks[schedKey] = timeInput.value;
          statusDiv.textContent = t('scheduleSet', { domain: name, time: timeInput.value });
        });
      };
      scheduleWrap.appendChild(timeInput);
      scheduleWrap.appendChild(setBtn);
      
      controlsDiv.appendChild(scheduleWrap);
      controlsDiv.appendChild(renameBtn);
      controlsDiv.appendChild(descBtn);
      controlsDiv.appendChild(delBtn);
      li.appendChild(controlsDiv);
      scenarioList.appendChild(li);

      // --- Drag and Drop Event Listeners ---
      li.addEventListener('dragstart', (e) => {
        draggedItem = li;
        draggedItemData = { key: originalKey, index: originalIndex };
        e.dataTransfer.effectAllowed = 'move';
        setTimeout(() => li.classList.add('dragging'), 0);
      });

      li.addEventListener('dragend', () => {
        li.classList.remove('dragging');
        draggedItem = null;
      });
    });

    renderActionsList();
    scenarioList.scrollTop = scrollTop;
  }

  // --- Drag and Drop Handlers for the list ---
  scenarioList.addEventListener('dragover', (e) => {
    e.preventDefault();
    const target = e.target.closest('li');
    if (target && target !== draggedItem) {
      // Remove from others
      Array.from(scenarioList.children).forEach(child => child.classList.remove('drag-over'));
      target.classList.add('drag-over');
    }
  });

  scenarioList.addEventListener('dragleave', (e) => {
    const target = e.target.closest('li');
    if (target) {
      target.classList.remove('drag-over');
    }
  });

  scenarioList.addEventListener('drop', (e) => {
    e.preventDefault();
    const target = e.target.closest('li');
    if (!target || target === draggedItem) {
      Array.from(scenarioList.children).forEach(child => child.classList.remove('drag-over'));
      return;
    }

    const fromKey = draggedItemData.key;
    const fromIndex = draggedItemData.index;
    const toKey = target.dataset.key;
    const toIndex = parseInt(target.dataset.index, 10);

    // Remove styling
    target.classList.remove('drag-over');

    // Perform the reorder
    const itemToMove = scenarios[fromKey].splice(fromIndex, 1)[0];
    scenarios[toKey].splice(toIndex, 0, itemToMove);

    // If an item was selected, update its index
    if (selectedArr && selectedIndex !== -1) {
        const selectedScenario = selectedArr[selectedIndex];
        // Find the new position of the selected scenario
        Object.values(scenarios).forEach(arr => {
            const newIndex = arr.findIndex(s => s === selectedScenario);
            if (newIndex !== -1) {
                selectedArr = arr;
                selectedIndex = newIndex;
            }
        });
    }

    // Save and re-render
    chrome.storage.local.set({ scenarios }, () => {
      updateScenarioList();
    });
  });

  if (playBtn) playBtn.onclick = () => {
    if (!selectedArr || selectedIndex === -1 || !selectedArr[selectedIndex]) {
      setSelectScenario();
      return;
    }
    const scenario = selectedArr[selectedIndex];
    if (!scenario.actions || !scenario.actions.length) return;
    
    const openUrl = getValidUrl(scenario.url);
    if (!openUrl) {
      showCustomDialog({ title: 'Invalid URL', message: 'Invalid URL for scenario: ' + scenario.url, buttons: [{ text: 'OK' }] });
      return;
    }

    showCustomDialog({
      title: t('playActions'),
      message: t('playActionsConfirm', { name: scenario.name }),
      buttons: [
        { text: t('playActions'), class: 'btn-primary', onClick: () => {
          chrome.tabs.query({active: true, currentWindow: true}, tabs => {
            const tab = tabs[0];
            if (tab && tab.url && tab.url.split('#')[0].split('?')[0] === openUrl.split('#')[0].split('?')[0]) {
              sendMessageWithRetry(tab.id, {type: 'PLAY_ACTIONS', actions: scenario.actions}, (resp, err) => {
                if (err) {
                  showCustomDialog({ title: t('errorOnPage'), message: err, buttons: [{ text: 'OK' }] });
                  return;
                }
                setStatusPlaying();
              });
            } else {
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
            }
          });
        }},
        { text: 'Cancel' }
      ]
    });
  };

  const exportBtn = document.getElementById('exportBtn');
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

  const importBtn = document.getElementById('importBtn');
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
          showCustomDialog({ title: t('importError'), message: 'Could not parse the file.', buttons: [{ text: 'OK' }] });
        }
      };
      reader.readAsText(file);
    };
    input.click();
  };

  const autoRunAllSwitch = document.getElementById('autoRunAllSwitch');
  chrome.storage.local.get('autoRunAllEnabled', data => {
    autoRunAllSwitch.checked = !!data.autoRunAllEnabled;
  });
  autoRunAllSwitch.onchange = () => {
    chrome.storage.local.set({ autoRunAllEnabled: autoRunAllSwitch.checked });
  };

  if (runAllBtn) {
    runAllBtn.onclick = () => {
      runAllBtn.disabled = true;
      chrome.storage.local.get('scenarios', data => {
        const scenarios = data.scenarios || {};
        let total = 0;
        Object.entries(scenarios).forEach(([url, arr]) => {
          if (!Array.isArray(arr)) return;
          arr.forEach((scenario, idx) => {
            const openUrl = getValidUrl(scenario.url);
            if (!openUrl) {
                console.warn('[RunAll] Skipping invalid URL:', scenario.url);
                return;
            }
            total++;
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
        statusDiv.textContent = t('runAllStarted') || `Запущено сценариев: ${total}`;
        setTimeout(() => { runAllBtn.disabled = false; }, 5000);
      });
    };
  }

  const clearAllBtn = document.getElementById('clearAllBtn');
  if (clearAllBtn) {
    clearAllBtn.onclick = () => {
      showCustomDialog({
        title: t('clearAllScenarios'),
        message: t('clearAllConfirm'),
        buttons: [
          { text: t('clearAllScenarios'), class: 'btn-danger', onClick: () => {
            chrome.storage.local.set({ scenarios: {} }, () => {
              scenarios = {};
              updateScenarioList();
              statusDiv.textContent = t('clearAllDone');
            });
          }},
          { text: 'Cancel' }
        ]
      });
    };
  }

  const advancedDiv = document.getElementById('advancedDiv');
  if (advancedDiv) {
    const toggleBtn = advancedDiv.querySelector('.toggle-button');
    const contentDiv = advancedDiv.querySelector('.content');
    const arrowIcon = toggleBtn ? toggleBtn.querySelector('.material-icons') : null;
    let expanded = false;
    if (toggleBtn && contentDiv) {
      const textSpan = toggleBtn.querySelector('span:first-child');
      if (textSpan) textSpan.textContent = t('advancedSection') || 'Advanced';
      toggleBtn.onclick = () => {
        expanded = !expanded;
        contentDiv.style.display = expanded ? 'block' : 'none';
        if (arrowIcon) {
          arrowIcon.style.transform = expanded ? 'rotate(180deg)' : 'rotate(0deg)';
        }
      };
    }
  }

  function setStatusRecording() { statusDiv.textContent = t('statusRecording'); }
  function setStatusStopped(count) { statusDiv.textContent = t('statusStopped', { count }); }
  function setStatusPlaying() { statusDiv.textContent = t('statusPlaying'); }
  function setSelectScenario() { statusDiv.textContent = t('selectScenario'); }
});

function createIcon(name) {
  const i = document.createElement('span');
  i.className = 'material-icons';
  i.style.fontSize = '18px';
  i.style.verticalAlign = 'middle';
  i.textContent = name;
  return i;
}

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

function renderActionsList() {
  // This function is called but not fully implemented in the original code
}