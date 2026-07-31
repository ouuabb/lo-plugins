/**
 * content.js — 划词翻译
 *
 * 交互流程：
 *   选中文字 → mouseup → 弹出翻译结果 → 发送给 background（双通道同步）
 *
 * 翻译 API：Lingva（免费、无需 key）
 *   GET https://lingva.ml/api/v1/{source}/{target}/{text}
 */

let popup = null;
let hideTimer = null;

// 选中文字后 mouseup 触发翻译
document.addEventListener('mouseup', (e) => {
  const selection = window.getSelection().toString().trim();
  if (!selection) {
    return;
  }
  // 忽略过长的选区（可能是整页复制）
  if (selection.length > 500) return;

  clearTimeout(hideTimer);
  // 延迟显示，避免选区还在变化
  setTimeout(() => showTranslatePopup(selection, e), 150);
});

// 接收右键菜单翻译请求
chrome.runtime.onMessage.addListener((msg) => {
  if (msg.type === 'TRANSLATE_SELECTION' && msg.text) {
    showTranslatePopup(msg.text, { pageX: window.innerWidth / 2, pageY: 100 });
  }
});

/**
 * 显示翻译弹窗
 */
async function showTranslatePopup(text, e) {
  ensurePopup();
  positionPopup(e);

  popup.innerHTML =
    '<div class="lo-tr-loading">翻译中...</div>';
  popup.style.display = 'block';

  try {
    const { sourceLang = 'auto', targetLang = 'zh' } =
      await chrome.storage.local.get(['sourceLang', 'targetLang']);

    const translation = await translateText(text, sourceLang, targetLang);

    popup.innerHTML = `
      <div class="lo-tr-original">${escapeHtml(text)}</div>
      <div class="lo-tr-divider"></div>
      <div class="lo-tr-result">${escapeHtml(translation)}</div>
      <div class="lo-tr-hint">已同步到 lo</div>
    `;

    // 发送翻译记录给 background（双通道同步）
    chrome.runtime.sendMessage({
      type: 'TRANSLATION_DONE',
      record: {
        original: text,
        translation: translation,
        sourceLang: sourceLang,
        targetLang: targetLang,
        context: getContextSentence(text),
        url: location.href,
        pageTitle: document.title,
      },
    });
  } catch (err) {
    popup.innerHTML =
      `<div class="lo-tr-error">翻译失败: ${escapeHtml(err.message)}</div>`;
  }
}

/**
 * 调用 Lingva 翻译 API
 */
async function translateText(text, source, target) {
  const src = source === 'auto' ? 'auto' : source;
  const url = `https://lingva.ml/api/v1/${src}/${target}/` +
    encodeURIComponent(text);

  const resp = await fetch(url);
  if (!resp.ok) {
    throw new Error(`HTTP ${resp.status}`);
  }
  const data = await resp.json();
  return data.text || '';
}

/**
 * 获取选中词所在的句子（上下文）
 */
function getContextSentence(word) {
  const selection = window.getSelection();
  if (!selection.anchorNode) return '';

  const fullText = selection.anchorNode.textContent || '';
  const idx = fullText.indexOf(word);
  if (idx === -1) return '';

  // 取词前 30 字 + 词 + 词后 30 字
  const start = Math.max(0, idx - 30);
  const end = Math.min(fullText.length, idx + word.length + 30);
  return fullText.slice(start, end).trim();
}

// ── 弹窗管理 ──

function ensurePopup() {
  if (popup) return;
  popup = document.createElement('div');
  popup.id = 'lo-translate-popup';
  popup.className = 'lo-tr-popup';
  document.body.appendChild(popup);

  // 点击弹窗外部隐藏
  document.addEventListener('mousedown', (e) => {
    if (popup && popup.style.display === 'block' &&
        !popup.contains(e.target)) {
      hideTimer = setTimeout(() => {
        if (popup) popup.style.display = 'none';
      }, 200);
    }
  });
}

function positionPopup(e) {
  const x = e.pageX || (window.innerWidth / 2);
  const y = e.pageY || 100;
  popup.style.left = `${Math.min(x, window.innerWidth - 320)}px`;
  popup.style.top = `${y + 16}px`;
}

function escapeHtml(s) {
  const div = document.createElement('div');
  div.textContent = s;
  return div.innerHTML;
}
