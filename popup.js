// Скрипт для popup.html: управление кнопками и взаимодействие с background.js

document.addEventListener('DOMContentLoaded', () => {
  const startBtn = document.getElementById('start-record');
  const stopBtn = document.getElementById('stop-record');
  const playBtn = document.getElementById('play-actions');
  const statusDiv = document.getElementById('status');

  let recordedActions = [];

  startBtn.onclick = () => {
    chrome.tabs.query({active: true, currentWindow: true}, tabs => {
      chrome.tabs.sendMessage(tabs[0].id, {type: 'START_RECORDING'}, resp => {
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
        recordedActions = resp.actions || [];
        statusDiv.textContent = 'Запись остановлена. Действий: ' + recordedActions.length;
        startBtn.disabled = false;
        stopBtn.disabled = true;
        playBtn.disabled = recordedActions.length === 0;
        // Сохраняем действия
        chrome.runtime.sendMessage({type: 'SAVE_ACTIONS', actions: recordedActions});
      });
    });
  };

  playBtn.onclick = () => {
    if (!recordedActions.length) return;
    chrome.tabs.query({active: true, currentWindow: true}, tabs => {
      chrome.tabs.sendMessage(tabs[0].id, {type: 'PLAY_ACTIONS', actions: recordedActions}, resp => {
        statusDiv.textContent = 'Воспроизведение...';
      });
    });
  };

  // При открытии popup загружаем сохранённые действия
  chrome.runtime.sendMessage({type: 'GET_ACTIONS'}, resp => {
    recordedActions = resp.actions || [];
    playBtn.disabled = recordedActions.length === 0;
  });
});
