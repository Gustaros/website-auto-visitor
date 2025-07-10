// Контент-скрипт для записи и воспроизведения действий пользователя
console.log('[Website Auto Visitor] content.js загружен на', window.location.href);

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
  // Если клик по ссылке (a[href]) — записываем как переход
  if (e.target.tagName === 'A' && e.target.href) {
    recordedActions.push({
      type: 'link',
      selector,
      href: e.target.href,
      timestamp: Date.now()
    });
  } else {
    recordedActions.push({
      type: 'click',
      selector,
      timestamp: Date.now()
    });
  }
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

// Добавляем обработку прокрутки (scroll)
let lastScrollTop = window.scrollY;
window.addEventListener('scroll', function() {
  if (!isRecording) return;
  const scrollTop = window.scrollY;
  if (Math.abs(scrollTop - lastScrollTop) > 10) { // фиксируем только значимые прокрутки
    recordedActions.push({
      type: 'scroll',
      scrollTop,
      timestamp: Date.now()
    });
    lastScrollTop = scrollTop;
  }
}, true);

// Воспроизведение действий
async function playActions(actions) {
  for (const action of actions) {
    if (action.type === 'scroll') {
      window.scrollTo({ top: action.scrollTop, behavior: 'smooth' });
      await new Promise(r => setTimeout(r, 700));
      continue;
    }
    if (action.type === 'link') {
      window.location.href = action.href;
      return; // дальнейшие действия будут невозможны после перехода
    }
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
    // Для ссылок добавляем [href] для надёжности
    if (el.tagName === 'A' && el.getAttribute('href')) selector += `[href='${el.getAttribute('href')}']`;
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
    chrome.runtime.sendMessage({type: 'SAVE_ACTIONS', actions: recordedActions, domain: window.location.hostname}, () => {
      if (typeof chrome !== 'undefined' && chrome.i18n) {
        alert(chrome.i18n.getMessage('recordStoppedAlert'));
      } else {
        alert('Recording stopped (Ctrl+Shift+S).');
      }
    });
  }
});
