// Контент-скрипт для записи и воспроизведения действий пользователя

// Глобальные переменные для хранения состояния записи и списка действий
let isRecording = false;
let recordedActions = [];

// Слушаем сообщения от popup/background
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.type === 'START_RECORDING') {
    isRecording = true;
    recordedActions = [];
    window.addEventListener('click', handleClick, true);
    window.addEventListener('input', handleInput, true);
    sendResponse({status: 'recording'});
  } else if (msg.type === 'STOP_RECORDING') {
    isRecording = false;
    window.removeEventListener('click', handleClick, true);
    window.removeEventListener('input', handleInput, true);
    sendResponse({status: 'stopped', actions: recordedActions});
  } else if (msg.type === 'PLAY_ACTIONS') {
    playActions(msg.actions || []);
    sendResponse({status: 'playing'});
  }
});

function handleClick(e) {
  if (!isRecording) return;
  const selector = getUniqueSelector(e.target);
  recordedActions.push({
    type: 'click',
    selector,
    timestamp: Date.now()
  });
}

function handleInput(e) {
  if (!isRecording) return;
  const selector = getUniqueSelector(e.target);
  recordedActions.push({
    type: 'input',
    selector,
    value: e.target.value,
    timestamp: Date.now()
  });
}

// Воспроизведение действий
async function playActions(actions) {
  for (const action of actions) {
    const el = document.querySelector(action.selector);
    if (!el) continue;
    if (action.type === 'click') {
      el.click();
    } else if (action.type === 'input') {
      el.value = action.value;
      el.dispatchEvent(new Event('input', { bubbles: true }));
    }
    await new Promise(r => setTimeout(r, 500)); // задержка между действиями
  }
}

// Генерация уникального CSS-селектора для элемента
function getUniqueSelector(el) {
  if (el.id) return `#${el.id}`;
  let path = [];
  while (el && el.nodeType === 1 && path.length < 5) {
    let selector = el.nodeName.toLowerCase();
    if (el.className) selector += '.' + Array.from(el.classList).join('.');
    path.unshift(selector);
    el = el.parentElement;
  }
  return path.join(' > ');
}

// Обработка горячей клавиши для остановки записи (Ctrl+Shift+S)
document.addEventListener('keydown', function(e) {
  if (isRecording && e.ctrlKey && e.shiftKey && e.code === 'KeyS') {
    isRecording = false;
    window.removeEventListener('click', handleClick, true);
    window.removeEventListener('input', handleInput, true);
    // Отправляем сообщение в background для сохранения
    chrome.runtime.sendMessage({type: 'SAVE_ACTIONS', actions: recordedActions});
    alert('Запись остановлена (Ctrl+Shift+S).');
  }
});
