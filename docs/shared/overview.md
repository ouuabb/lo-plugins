# 共享工具概览

`shared/` 目录包含跨插件复用的工具函数，通过 `@lo-plugins/shared` 模块导入。

## 模块导出

```javascript
const { dedup, generateRecordId } = require('@lo-plugins/shared');
```

## 工具列表

### dedup

通用去重工具，按指定 key 去重。

```javascript
const { dedup } = require('@lo-plugins/shared');

const records = [
  { recordId: 'r1', original: 'hello' },
  { recordId: 'r2', original: 'world' },
  { recordId: 'r1', original: 'hello' }, // 重复
];

const unique = dedup(records, 'recordId');
// → [{ recordId: 'r1', ... }, { recordId: 'r2', ... }]
```

### generateRecordId

生成唯一记录 ID，格式 `tr_{timestamp}_{random}`。

```javascript
const { generateRecordId } = require('@lo-plugins/shared');

const id = generateRecordId();
// → 'tr_1722499200000_a1b2c3'
```

## 添加新工具

1. 在 `shared/utils/` 下创建新文件
2. 在 `shared/index.cjs` 中导出

```javascript
// shared/utils/myTool.cjs
function myTool() { /* ... */ }
module.exports = { myTool };

// shared/index.cjs
module.exports = {
  ...require('./utils/dedup.cjs'),
  ...require('./utils/recordId.cjs'),
  ...require('./utils/myTool.cjs'),
};
```
