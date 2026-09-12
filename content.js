let timer = null;

// ---- コンソールキャプチャ機能 ----
let consoleLogs = [];
const MAX_CONSOLE_LOGS = 500;
let consolePort = null;

// オリジナルのコンソールメソッドを保持
const origConsole = {
  log: console.log,
  error: console.error,
  warn: console.warn,
  info: console.info,
  debug: console.debug
};

// 引数をシリアライズ
function serializeArg(arg) {
  if (arg === undefined) return 'undefined';
  if (arg === null) return 'null';
  if (arg instanceof Error) {
    return arg.stack || arg.message;
  }
  if (typeof arg === 'object') {
    try {
      return JSON.stringify(arg, null, 2);
    } catch (_) {
      return String(arg);
    }
  }
  return String(arg);
}

// コンソールメソッドをフック
function hookConsoleMethod(level) {
  console[level] = function(...args) {
    // オリジナルを呼び出し（実際のコンソールにも出力）
    origConsole[level](...args);

    // ログエントリを作成
    const entry = {
      level: level,
      args: args.map(serializeArg),
      timestamp: Date.now()
    };

    // 履歴に保存（上限あり）
    consoleLogs.push(entry);
    if (consoleLogs.length > MAX_CONSOLE_LOGS) {
      consoleLogs.shift();
    }

    // ポートが開いていればリアルタイム送信
    if (consolePort) {
      try {
        consolePort.postMessage({ type: 'log', entry: entry });
      } catch (_) {}
    }
  };
}

// 全メソッドをフック
hookConsoleMethod('log');
hookConsoleMethod('error');
hookConsoleMethod('warn');
hookConsoleMethod('info');
hookConsoleMethod('debug');

// コンソールポートの接続待機
chrome.runtime.onConnect.addListener((port) => {
  if (port.name === 'console') {
    consolePort = port;

    // 初期ログ（全履歴）を送信
    port.postMessage({ type: 'initial', logs: consoleLogs });

    port.onDisconnect.addListener(() => {
      consolePort = null;
    });
  }
});

// ---- 要素スキャン機能（既存） ----
function fastScanElements() {
  if (!chrome.storage || !chrome.storage.local) return;

  const targetElements = document.querySelectorAll('[id], [class*="modal"], [class*="toast"], [class*="hidden"]');
  const elementList = [];

  targetElements.forEach(el => {
    if (el.tagName === 'SCRIPT' || el.tagName === 'STYLE' || el.tagName === 'HTML' || el.tagName === 'BODY') return;
    const rawName = el.id ? el.id : el.className.split(' ')[0];
    if (!rawName) return;
    elementList.push({
      id: el.id || '',
      className: el.className || '',
      tagName: el.tagName.toLowerCase(),
      defaultVisible: !el.classList.contains('hidden') && window.getComputedStyle(el).display !== 'none'
    });
  });

  const uniqueList = Array.from(new Set(elementList.map(a => JSON.stringify(a)))).map(a => JSON.parse(a));

  try {
    chrome.storage.local.get(["user_states"], (data) => {
      if (chrome.runtime.lastError) return;
      const userStates = data.user_states || {};
      chrome.storage.local.set({ cached_elements: uniqueList }, () => {
        if (chrome.runtime.lastError) return;
        applyUserStates(uniqueList, userStates);
      });
    });
  } catch (_) {}
}

function applyUserStates(elements, userStates) {
  elements.forEach(item => {
    const key = item.id || item.className;
    if (userStates[key] !== undefined) {
      let el = item.id ? document.getElementById(item.id) : document.querySelector('.' + item.className.split(' ')[0]);
      if (el) {
        el.classList.toggle('hidden', !userStates[key]);
        el.style.display = userStates[key] ? 'flex' : 'none';
      }
    }
  });
}

if (document.body) {
  fastScanElements();
}

if (document.body) {
  const observer = new MutationObserver(() => {
    clearTimeout(timer);
    timer = setTimeout(() => {
      if (chrome.runtime && chrome.runtime.id) {
        fastScanElements();
      }
    }, 500);
  });
  observer.observe(document.body, { childList: true, subtree: true });
}

chrome.storage.onChanged.addListener((changes, namespace) => {
  if (namespace === 'local' && changes.user_states) {
    try {
      chrome.storage.local.get(["cached_elements"], (data) => {
        if (chrome.runtime.lastError) return;
        const elements = data.cached_elements || [];
        const userStates = changes.user_states.newValue || {};
        applyUserStates(elements, userStates);
      });
    } catch (_) {}
  }
});