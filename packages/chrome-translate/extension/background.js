/**
 * background.js — Service Worker
 *
 * 双通道同步核心：
 *   通道① HTTP 实时推送：翻译完成立即 POST 到 lo 插件端点
 *   通道② 本地兜底：每条记录写入 chrome.storage.local，可导出 records.json
 *
 * 防丢失策略：
 *   - 每条记录先写本地（通道②），再尝试 HTTP（通道①）
 *   - HTTP 失败不影响本地存储，数据不丢
 *   - lo 插件端通过 discover 全量校验补录本地遗漏
 *   - recordId 全局唯一，两通道都用它去重
 */

// ── 消息分发 ──

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.type === 'TRANSLATION_DONE') {
    handleTranslationRecord(msg.record)
      .then(result => sendResponse({ ok: true, result }))
      .catch(e => sendResponse({ ok: false, error: e.message }));
    return true; // 异步响应
  }

  if (msg.type === 'GET_STATS') {
    getStats().then(stats => sendResponse({ ok: true, stats }));
    return true;
  }

  if (msg.type === 'EXPORT_RECORDS') {
    exportRecords().then(json => sendResponse({ ok: true, json }));
    return true;
  }

  if (msg.type === 'CLEAR_LOCAL') {
    chrome.storage.local.set({ records: [], stats: defaultStats() }, () => {
      sendResponse({ ok: true });
    });
    return true;
  }

  if (msg.type === 'RETRY_HTTP') {
    retryAllLocal();
    sendResponse({ ok: true });
    return false;
  }
});

// ── 核心逻辑 ──

/**
 * 处理一条翻译记录：先存本地，再推 HTTP
 */
async function handleTranslationRecord(record) {
  // 生成 recordId（去重唯一键）
  if (!record.recordId) {
    record.recordId = generateRecordId();
  }
  // 补全时间戳
  record.timestamp = record.timestamp || new Date().toISOString();

  // 通道②：先写本地（兜底，保证不丢）
  await saveToLocal(record);

  // 通道①：HTTP 实时推送（失败不阻塞）
  const httpResult = await pushViaHttp(record);

  return { local: true, http: httpResult };
}

/**
 * 通道②：写入 chrome.storage.local
 */
async function saveToLocal(record) {
  const { records = [] } = await chrome.storage.local.get('records');

  // 本地也去重（同一 recordId 不重复存）
  if (records.some(r => r.recordId === record.recordId)) {
    return; // 已存在，跳过
  }

  records.push(record);
  await chrome.storage.local.set({ records });

  // 更新统计
  const stats = await getStats();
  stats.localCount = records.length;
  await chrome.storage.local.set({ stats });
}

/**
 * 通道①：HTTP POST 到 lo 插件端点
 */
async function pushViaHttp(record) {
  const { endpoint, httpEnabled } = await chrome.storage.local.get([
    'endpoint', 'httpEnabled'
  ]);

  if (!httpEnabled) {
    return { ok: false, reason: 'disabled' };
  }
  if (!endpoint) {
    return { ok: false, reason: 'no_endpoint' };
  }

  try {
    const url = endpoint.replace(/\/$/, '') +
      '/api/plugins/chrome-translate/records';
    const resp = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(record),
    });

    const data = await resp.json();

    // 更新统计
    const stats = await getStats();
    if (data.ok) {
      stats.httpSuccess = (stats.httpSuccess || 0) + (data.created || 0);
      stats.httpSkipped = (stats.httpSkipped || 0) + (data.skipped || 0);
      stats.lastHttpAt = new Date().toISOString();
    }
    await chrome.storage.local.set({ stats });

    return { ok: true, data };
  } catch (e) {
    // HTTP 失败不影响本地存储，数据已兜底
    const stats = await getStats();
    stats.httpFail = (stats.httpFail || 0) + 1;
    stats.lastHttpError = e.message;
    await chrome.storage.local.set({ stats });
    return { ok: false, error: e.message };
  }
}

/**
 * 重试推送所有本地记录（HTTP 恢复后手动触发）
 */
async function retryAllLocal() {
  const { records = [] } = await chrome.storage.local.get('records');
  for (const record of records) {
    await pushViaHttp(record);
  }
}

/**
 * 导出本地所有记录为 JSON（供 lo 插件 discover 校验补录）
 */
async function exportRecords() {
  const { records = [] } = await chrome.storage.local.get('records');
  return JSON.stringify(records, null, 2);
}

// ── 工具函数 ──

function generateRecordId() {
  return 'tr_' + Date.now().toString(36) + '_' +
    Math.random().toString(36).slice(2, 8);
}

function defaultStats() {
  return {
    localCount: 0,
    httpSuccess: 0,
    httpSkipped: 0,
    httpFail: 0,
    lastHttpAt: null,
    lastHttpError: null,
  };
}

async function getStats() {
  const { stats } = await chrome.storage.local.get('stats');
  return stats || defaultStats();
}

// ── 右键菜单：划词翻译 ──

chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: 'lo-translate',
    title: '用 lo 翻译 "%s"',
    contexts: ['selection'],
  });
});

chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId === 'lo-translate' && info.selectionText) {
    chrome.tabs.sendMessage(tab.id, {
      type: 'TRANSLATE_SELECTION',
      text: info.selectionText,
    });
  }
});
