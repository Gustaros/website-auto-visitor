// Контент-скрипт для записи и воспроизведения действий пользователя
console.log('[Website Auto Visitor] content.js script injected at', new Date().toISOString(), window.location.href);
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
    chrome.storage.local.set({ recording: true });
    sendResponse({status: 'recording'});
  } else if (msg.type === 'STOP_RECORDING') {
    isRecording = false;
    window.removeEventListener('click', handleClick, true);
    window.removeEventListener('input', handleInput, true);
    chrome.storage.local.set({ recording: false });
    // Сохраняем сценарий всегда (как при хоткее)
    chrome.storage.local.get('scenarios', data => {
      let url = window.location.href;
      if (!/^https?:\/\//i.test(url)) {
        url = 'https://' + url.replace(/^\/*/, '');
      }
      const domain = window.location.hostname;
      let scenarios = data.scenarios || {};
      const key = url || domain;
      const existing = (scenarios[key] || []);
      let baseName = '';
      try {
        const parsed = new URL(url);
        baseName = parsed.hostname + parsed.pathname;
      } catch { baseName = domain; }
      let name = baseName;
      if (existing.length > 0) name += ` [${existing.length + 1}]`;
      chrome.runtime.sendMessage({type: 'SAVE_ACTIONS', actions: recordedActions, domain, name, url}, () => {
        sendResponse({status: 'stopped', actions: recordedActions});
      });
    });
    return true;
  } else if (msg.type === 'PLAY_ACTIONS') {
    console.log('[Website Auto Visitor] PLAY_ACTIONS received:', msg.actions);
    playActions(msg.actions || []);
    sendResponse({status: 'playing'});
  } else if (msg.type === 'GET_RECORDING_STATUS') {
    sendResponse({ recording: isRecording });
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
  } else if (clickable.type === 'checkbox' || clickable.getAttribute('role') === 'switch' || clickable.type === 'radio') {
    recordedActions.push({
      type: 'click',
      selector,
      checked: clickable.checked,
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
      return;
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
      if ((el.type === 'checkbox' || el.getAttribute('role') === 'switch' || el.type === 'radio') && typeof action.checked !== 'undefined') {
        el.focus();
        el.checked = action.checked;
        el.dispatchEvent(new Event('input', { bubbles: true }));
        el.dispatchEvent(new Event('change', { bubbles: true }));
        await new Promise(r => setTimeout(r, 100));
        if (typeof el.click === 'function') el.click();
        el.dispatchEvent(new Event('input', { bubbles: true }));
        el.dispatchEvent(new Event('change', { bubbles: true }));
        ['mousedown','mouseup','click'].forEach(evt => {
          el.dispatchEvent(new MouseEvent(evt, { bubbles: true, cancelable: true, view: window }));
        });
        await new Promise(r => setTimeout(r, 100));
        el.blur();
      } else {
        // Обычный клик
        ['mousedown','mouseup','click'].forEach(evt => {
          el.dispatchEvent(new MouseEvent(evt, { bubbles: true, cancelable: true, view: window }));
        });
        // Для других элементов с onChange/onInput
        if (el.type === 'button' || el.type === 'submit') {
          el.dispatchEvent(new Event('change', { bubbles: true }));
        }
      }
    } else if (action.type === 'input') {
      if ('value' in el && typeof el.dispatchEvent === 'function') {
        el.value = action.value;
        el.dispatchEvent(new Event('input', { bubbles: true }));
        el.dispatchEvent(new Event('change', { bubbles: true }));
      } else {
        console.warn('Element does not support input:', el, action.selector);
      }
    }
    await new Promise(r => setTimeout(r, 500));
  }
}

// Генерация уникального CSS-селектора для элемента
function getUniqueSelector(el) {
  if (el.id && /^[A-Za-z0-9_-]+$/.test(el.id)) return `#${cssEscape(el.id)}`;
  let path = [];
  let current = el;
  while (current && current.nodeType === 1 && path.length < 6) {
    let selector = current.nodeName.toLowerCase();
    // Добавляем data-testid или data-qa, если есть
    if (current.hasAttribute('data-testid')) {
      selector += `[data-testid='${cssEscape(current.getAttribute('data-testid'))}']`;
    } else if (current.hasAttribute('data-qa')) {
      selector += `[data-qa='${cssEscape(current.getAttribute('data-qa'))}']`;
    } else if (current.classList && current.classList.length > 0) {
      // Берём только первый валидный класс
      const validClass = Array.from(current.classList).find(c => /^[A-Za-z0-9_-]+$/.test(c));
      if (validClass) selector += '.' + cssEscape(validClass);
    }
    // Для ссылок добавляем [href] если оно простое
    if (current.tagName === 'A' && current.getAttribute('href')) {
      const href = current.getAttribute('href');
      if (/^[^\s'"<>]+$/.test(href)) selector += `[href='${cssEscape(href)}']`;
    }
    // Добавляем индекс среди однотипных siblings
    if (current.parentElement) {
      const siblings = Array.from(current.parentElement.children).filter(e => e.nodeName === current.nodeName);
      if (siblings.length > 1) {
        const idx = siblings.indexOf(current) + 1;
        selector += `:nth-of-type(${idx})`;
      }
    }
    path.unshift(selector);
    current = current.parentElement;
  }
  const result = path.join(' > ');
  // Проверяем валидность селектора
  try {
    const found = document.querySelectorAll(result);
    if (found.length === 1) return result;
    // Если не уникально — fallback на старый способ
    if (el.id && /^[A-Za-z0-9_-]+$/.test(el.id)) return `#${cssEscape(el.id)}`;
    // Если всё равно не уникально — alert
    alert('Failed to record action: element selector is not unique.');
    return null;
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
    chrome.storage.local.set({ recording: false });
    // Получаем все сценарии для подсчёта номера
    chrome.storage.local.get('scenarios', data => {
      const url = window.location.href;
      const domain = window.location.hostname;
      let scenarios = data.scenarios || {};
      const key = url || domain;
      const existing = (scenarios[key] || []);
      let baseName = '';
      try {
        const parsed = new URL(url);
        baseName = parsed.hostname + parsed.pathname;
      } catch { baseName = domain; }
      let name = baseName;
      if (existing.length > 0) name += ` [${existing.length + 1}]`;
      chrome.runtime.sendMessage({type: 'SAVE_ACTIONS', actions: recordedActions, domain, name, url}, () => {
        if (typeof chrome !== 'undefined' && chrome.i18n) {
          alert(chrome.i18n.getMessage('recordStoppedAlert'));
        } else {
          alert('Recording stopped (Ctrl+Shift+S).');
        }
      });
    });
  }
});
