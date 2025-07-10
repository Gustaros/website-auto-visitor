// Скрипт для popup.html: управление кнопками и взаимодействие с background.js

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
      updateScenarioList();
    });
  });

  startBtn.onclick = () => {
    chrome.tabs.query({active: true, currentWindow: true}, tabs => {
      chrome.tabs.sendMessage(tabs[0].id, {type: 'START_RECORDING'}, resp => {
        if (chrome.runtime.lastError) {
          statusDiv.textContent = 'Ошибка: расширение не может работать на этой странице.';
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
    chrome.tabs.query({active: true, currentWindow: true}, tabs => {
      chrome.tabs.sendMessage(tabs[0].id, {type: 'STOP_RECORDING'}, resp => {
        if (chrome.runtime.lastError) {
          statusDiv.textContent = 'Ошибка: расширение не может работать на этой странице.';
          return;
        }
        recordedActions = resp.actions || [];
        statusDiv.textContent = 'Запись остановлена. Действий: ' + recordedActions.length;
        startBtn.disabled = false;
        stopBtn.disabled = true;
        playBtn.disabled = recordedActions.length === 0;
        // Сохраняем сценарий по домену
        chrome.runtime.sendMessage({type: 'SAVE_ACTIONS', actions: recordedActions, domain: currentDomain}, () => {
          // Обновляем список сценариев
          chrome.runtime.sendMessage({type: 'GET_SCENARIOS'}, resp => {
            scenarios = resp.scenarios || {};
            updateScenarioList();
          });
        });
      });
    });
  };

  playBtn.onclick = () => {
    if (!recordedActions.length) return;
    chrome.tabs.query({active: true, currentWindow: true}, tabs => {
      chrome.tabs.sendMessage(tabs[0].id, {type: 'PLAY_ACTIONS', actions: recordedActions}, resp => {
        if (chrome.runtime.lastError) {
          statusDiv.textContent = 'Ошибка: расширение не может работать на этой странице.';
          return;
        }
        statusDiv.textContent = 'Воспроизведение...';
      });
    });
  };

  function updateScenarioList() {
    if (!scenarioList) return;
    scenarioList.innerHTML = '';
    Object.keys(scenarios).forEach(domain => {
      if (!domain) return;
      const li = document.createElement('li');
      li.textContent = domain + (domain === currentDomain ? ' (текущий)' : '');
      li.style.cursor = 'pointer';
      li.onclick = () => {
        recordedActions = scenarios[domain];
        playBtn.disabled = !recordedActions.length;
        statusDiv.textContent = 'Выбран сценарий для: ' + domain;
      };
      scenarioList.appendChild(li);
    });
  }
});
