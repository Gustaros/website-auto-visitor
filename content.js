// Контент-скрипт для записи и воспроизведения действий пользователя
console.log('[Website Auto Visitor] content.js loaded on', window.location.href);

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

function findClickableAncestor(el) {
  while (el && el !== document.body) {
    if (
      el.tagName === 'BUTTON' ||
      el.tagName === 'A' ||
      (el.tagName === 'INPUT' && ['button','submit','reset'].includes((el.type||'').toLowerCase())) ||
      el.getAttribute('role') === 'button' ||
      el.tabIndex >= 0
    ) {
      return el;
    }
    el = el.parentElement;
  }
  return null;
}

function handleClick(e) {
  if (!isRecording) return;
  let target = e.target;
  // Если клик по SVG/path/иконке — ищем ближайший кликaбельный родитель
  const clickable = findClickableAncestor(target) || target;
  const selector = getUniqueSelector(clickable);
  if (!selector) return;
  if (clickable.tagName === 'A' && clickable.href) {
    recordedActions.push({
      type: 'link',
      selector,
      href: clickable.href,
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
  if (!selector) return;
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
  // scroll не требует селектора
  const scrollTop = window.scrollY;
  if (Math.abs(scrollTop - lastScrollTop) > 10) {
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
    let el = null;
    try {
      el = document.querySelector(action.selector);
    } catch (e) {
      console.warn('Invalid selector:', action.selector, e);
      continue;
    }
    if (!el) continue;
    if (action.type === 'click') {
      if (typeof el.click === 'function') {
        el.click();
      } else {
        console.warn('Element does not support click():', el, action.selector);
      }
    } else if (action.type === 'input') {
      if ('value' in el && typeof el.dispatchEvent === 'function') {
        el.value = action.value;
        el.dispatchEvent(new Event('input', { bubbles: true }));
      } else {
        console.warn('Element does not support input:', el, action.selector);
      }
    }
    await new Promise(r => setTimeout(r, 500)); // задержка между действиями
  }
}

// Генерация уникального CSS-селектора для элемента
function getUniqueSelector(el) {
  if (el.id && /^[A-Za-z0-9_-]+$/.test(el.id)) return `#${cssEscape(el.id)}`;
  let path = [];
  let current = el;
  while (current && current.nodeType === 1 && path.length < 5) {
    let selector = current.nodeName.toLowerCase();
    // Берём только первый валидный класс (без : и /)
    if (current.classList && current.classList.length > 0) {
      const validClass = Array.from(current.classList).find(c => /^[A-Za-z0-9_-]+$/.test(c));
      if (validClass) selector += '.' + cssEscape(validClass);
    }
    // Для ссылок добавляем [href] если оно простое
    if (current.tagName === 'A' && current.getAttribute('href')) {
      const href = current.getAttribute('href');
      if (/^[^\s'"<>]+$/.test(href)) selector += `[href='${cssEscape(href)}']`;
    }
    path.unshift(selector);
    current = current.parentElement;
  }
  const result = path.join(' > ');
  // Проверяем валидность селектора
  try {
    document.querySelector(result);
    return result;
  } catch {
    alert('Failed to record action: element has too complex selector.');
    return null;
  }
}

// Экранирование спецсимволов для CSS-селекторов
function cssEscape(str) {
  if (!str) return '';
  return str.replace(/([\.\#\:\[\]\,\>\+\~\=\'\"\!\$\^\|\?\*\(\)\{\}\/ ])/g, '\\$1');
}

// Обработка горячей клавиши для остановки записи (Ctrl+Shift+S)
document.addEventListener('keydown', function(e) {
  if (isRecording && e.ctrlKey && e.shiftKey && e.code === 'KeyS') {
    isRecording = false;
    window.removeEventListener('click', handleClick, true);
    window.removeEventListener('input', handleInput, true);
    // Отправляем сообщение в background для сохранения
    chrome.runtime.sendMessage({type: 'SAVE_ACTIONS', actions: recordedActions, domain: window.location.hostname, url: window.location.href}, () => {
      if (typeof chrome !== 'undefined' && chrome.i18n) {
        alert(chrome.i18n.getMessage('recordStoppedAlert'));
      } else {
        alert('Recording stopped (Ctrl+Shift+S).');
      }
    });
  }
});
