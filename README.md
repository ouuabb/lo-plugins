# lo-plugins

lo 官方插件源码仓库（monorepo）。

## 结构

```
lo-plugins/
  packages/
    chrome-translate/    # Chrome 划词翻译插件
    epub-reader/         # EPUB 阅读插件（Web 阅读器 + CLI 命令）
    epub-library/        # EPUB 书库展示插件（3D 书架）
  docs/                  # VitePress 文档
```

## 开发

```bash
npm install
npm test
```

## 构建插件包（分发）

将插件源码打包为可分发的 tar.gz 插件包与 `index.json` 分发清单（供 lo 插件仓库分发安装）：

```bash
npm run build            # 打包全部插件 → dist/
npm run build:packages -- --plugin <id>   # 只打包指定插件
```

详见 [docs/guide/development.md](docs/guide/development.md)。

## 插件列表

| 插件 | 说明 |
|------|------|
| chrome-translate | Chrome 划词翻译，同步翻译记录到 lo 仓库 |
| epub-reader | EPUB 阅读、标注、笔记（Web 阅读器 + CLI 命令） |
| epub-library | EPUB 书库展示，读取 epub Resource 渲染 3D 书架 |
