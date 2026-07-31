# 开发指南

## 基于 lo-sdk 开发

所有插件基于 `@lo/sdk` 开发，与 lo Core 解耦。SDK 提供以下核心模块：

| 模块 | 说明 |
|------|------|
| `Plugin` | 插件基类，定义生命周期方法 |
| `ResourceProvider` | 资源发现抽象基类（继承自 Plugin） |
| `PluginContext` | 插件上下文，注入运行时服务 |
| `ResourceBuilder` | 资源候选对象构造器 |
| `RelationBuilder` | 关系候选对象构造器 |
| `Logger` | 统一日志接口 |
| `EventApi` | 插件间事件总线 |

## 插件生命周期

```
created → loaded → initialized → enabled → disabled → disposed
```

- `register(context)` — 注册扩展点
- `initialize()` — 初始化资源
- `enable()` — 启用插件
- `disable()` — 禁用插件
- `dispose()` — 销毁清理

## ResourceProvider 模式

资源发现插件继承 `ResourceProvider`，实现 `discover()` 方法：

```javascript
const { ResourceProvider, ResourceBuilder } = require('@lo/sdk');

class MyPlugin extends ResourceProvider {
  async discover(ctx, source) {
    // 1. 从 source 读取数据
    const data = await readData(source);

    // 2. 去重：查询已有资源
    const existing = await this._getExistingIds(ctx);

    // 3. 转换为 Resource 候选
    return data
      .filter(r => !existing.has(r.id))
      .map(r => ResourceBuilder.of('myType')
        .name(r.name)
        .meta('sourceId', r.id)
        .build());
  }

  // 可选：增量监听
  async watch(source, onChange) {
    // 监听 source 变化，触发 discover
    // 返回 dispose 函数
  }
}
```

## metadataSchema 声明

插件通过 `contributes.resourceTypes[].metadataSchema` 声明自定义 metadata 字段。lo Core 在激活插件时自动注册这些字段到 metadata 校验系统。

支持的类型：`string` | `number` | `boolean` | `array`

```javascript
contributes: {
  resourceTypes: [{
    type: 'vocabulary',
    metadataSchema: {
      recordId:    { type: 'string' },
      translation: { type: 'string' },
      timestamp:   { type: 'string' },
    },
  }],
}
```

## 共享工具

跨插件复用的工具放在 `shared/` 目录：

```javascript
const { dedup, generateRecordId } = require('@lo-plugins/shared');
```

详见 [共享工具概览](../shared/overview.md)。

## 测试规范

- 测试文件放在 `test/` 目录，命名 `*.test.cjs`
- 使用 Jest 测试框架
- Mock PluginContext 避免依赖真实 lo Core
- 覆盖正常路径和边缘情况

```javascript
function createMockContext(existingResources = []) {
  return {
    config: () => ({}),
    logger: { log: () => {}, error: () => {}, debug: () => {}, warn: () => {} },
    extensions: { register: () => {} },
    resources: {
      async create(candidate) { /* ... */ },
      async list(filter) { /* ... */ },
    },
    hooks: { register: () => {} },
    events: { on: () => {}, emit: () => {} },
  };
}
```

## 提交规范

提交信息格式：`<type>(<scope>): <中文描述>`

- type: `feat` | `fix` | `docs` | `refactor` | `test` | `chore` | `ci` | `build`
- scope: 可选，如 `plugin`、`shared`、`project`
- subject: 必须包含中文

```bash
feat(plugin): 实现划词翻译双通道同步
fix(shared): 修复去重逻辑边界情况
docs: 更新插件开发指南
```

Husky 钩子会在提交前自动运行测试和校验提交信息。
