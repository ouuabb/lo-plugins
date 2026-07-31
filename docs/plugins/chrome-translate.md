# Chrome 划词翻译插件

## 概述

`chrome-translate` 是一个 Chrome 浏览器划词翻译插件，将翻译记录同步到 lo 仓库，支持双通道同步和去重。

## 工作原理

### 双通道同步

| 通道 | 方式 | 触发时机 | 用途 |
|------|------|---------|------|
| ① discover | 文件读取 | `lo plugin discover` 命令 | 兜底校验，补录遗漏 |
| ② HTTP | POST 推送 | Chrome 扩展实时翻译 | 即时写入 |

两通道通过 `recordId` 去重，确保数据不丢失。

### 数据流

```
Chrome 扩展
  ├── chrome.storage.local → records.json → discover 通道（兜底）
  └── HTTP POST → /api/plugins/chrome-translate/records → 即时写入
                                                    ↓
                                              lo Core 数据库
```

## Resource 模型

| 字段 | 类型 | 说明 |
|------|------|------|
| type | `vocabulary` | 资源类型 |
| name | string | 原文（选中词/短语） |
| metadata.recordId | string | 唯一记录 ID（去重用） |
| metadata.original | string | 原文 |
| metadata.translation | string | 译文 |
| metadata.sourceLang | string | 源语言 |
| metadata.targetLang | string | 目标语言 |
| metadata.context | string | 上下文（选中词所在句子） |
| metadata.url | string | 页面 URL |
| metadata.pageTitle | string | 页面标题 |
| metadata.timestamp | string | 翻译时间 ISO 8601 |

## discover 通道

从导出文件（`records.json`）读取翻译记录，全量校验并补录：

```javascript
async discover(ctx, source) {
  const filePath = source || this._exportFilePath;
  // 1. 读取 JSON 文件
  const records = JSON.parse(await fs.readFile(filePath, 'utf-8'));
  // 2. 查询已有 recordId 去重
  const existing = await this._getExistingRecordIds(ctx);
  const unsynced = records.filter(r => r.recordId && !existing.has(r.recordId));
  // 3. 转换为 Resource 候选
  return unsynced.map(r => this._recordToCandidate(r));
}
```

## HTTP 通道

注册 `commands` 扩展点，接收 Chrome 扩展 POST 推送：

```javascript
register(context) {
  super.register(context);
  context.extensions.register(manifest.id, 'commands', 'chrome-translate:receive', {
    method: 'POST',
    path: '/api/plugins/chrome-translate/records',
    handler: this._handleHttpPost.bind(this),
  });
}
```

## watch 增量监听

监听导出文件变化，自动触发 discover 补录：

```javascript
async watch(source, onChange) {
  const watcher = fs.watch(filePath, { persistent: false }, (eventType) => {
    // 防抖 500ms
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(async () => {
      const candidates = await this.discover(ctx, filePath);
      if (candidates.length > 0) onChange(candidates);
    }, 500);
  });
  // 返回 dispose 函数
  return () => { watcher.close(); };
}
```

## Chrome 扩展

扩展文件位于 `extension/` 目录：

| 文件 | 说明 |
|------|------|
| `manifest.json` | Chrome 扩展清单（Manifest V3） |
| `popup.html/js` | 弹窗界面 |
| `options.html/js` | 选项页 |
| `content.js/css` | 内容脚本（划词翻译） |
| `background.js` | 后台 Service Worker |

## 配置

在 lo 仓库的插件配置中设置 `exportFilePath`：

```json
{
  "exportFilePath": "/path/to/records.json"
}
```
