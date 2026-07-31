# 插件目录结构

每个插件位于 `packages/{plugin-id}/` 下，包含以下文件：

```
packages/{plugin-id}/
  plugin.json            # 插件清单（id, name, version, main）
  src/
    index.cjs            # 入口导出
    manifest.cjs         # manifest() 返回的清单对象
    plugin.cjs           # 插件主类（继承 ResourceProvider 或 Plugin）
  test/
    plugin.test.cjs      # 单元测试
  package.json           # 包配置（可选，用于独立发布）
```

## plugin.json

插件清单文件，由 lo Core 的 PluginLoader 读取：

```json
{
  "id": "chrome-translate",
  "name": "Chrome 划词翻译",
  "version": "1.0.0",
  "main": "src/index.cjs"
}
```

## src/manifest.cjs

manifest() 方法返回的清单对象，声明插件的扩展点和资源类型：

```javascript
module.exports = {
  id: 'chrome-translate',
  name: 'Chrome 划词翻译',
  version: '1.0.0',
  role: 'discovery',
  extensions: ['resourceProviders', 'commands'],
  contributes: {
    resourceTypes: [
      {
        type: 'vocabulary',
        metadataSchema: {
          recordId:    { type: 'string' },
          original:    { type: 'string' },
          translation: { type: 'string' },
          // ...
        },
      },
    ],
  },
};
```

## src/plugin.cjs

插件主类，继承 `@lo/sdk` 的基类：

```javascript
const { ResourceProvider } = require('@lo/sdk');

class MyPlugin extends ResourceProvider {
  manifest() { return require('./manifest.cjs'); }

  register(context) {
    super.register(context);
    // 注册额外扩展点
  }

  async discover(ctx, source) {
    // 资源发现逻辑
  }
}

module.exports = MyPlugin;
```

## 扩展文件

部分插件可能包含非 Node.js 文件（如 Chrome 扩展的 HTML/CSS/JS），放在子目录中：

```
packages/chrome-translate/
  extension/             # Chrome 扩展文件
    manifest.json        # Chrome 扩展清单
    popup.html
    popup.js
    content.js
    background.js
    options.html
    options.js
    content.css
```
