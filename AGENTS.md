# AGENTS.md — lo-plugins（Core 插件仓库）

本文件供 AI 编码助手（opencode 等）理解本项目规范。
lo 生态总纲是**独立文档**（不依赖任何本地目录布局），定义跨仓库边界与契约铁律；
如与本文档同处一个工作区，先读生态总纲再进入本仓库。

## 项目是什么

`lo-plugins` 是 **lo Core 插件源码 + 分发仓库**：
- 存放插件源码（`packages/<id>/`，含 `plugin.json` manifest + `src/`）。
- `scripts/build.cjs` 打包 tar.gz + `index.json` 分发清单（GitHub Pages 发布）。
- **本身不是运行环境**——插件运行发生在 lo Core 插件系统内。

## 包

| 包 | 说明 |
|---|---|
| `packages/epub-reader` | EPUB 阅读插件（commands + HTTP 阅读器 + 笔记/标注） |
| `packages/epub-library` | EPUB 书库展示（HTTP 页面 + JSON） |
| `packages/chrome-translate` | Chrome 划词翻译（content/background script） |

## 技术栈与命令

- 纯 CommonJS；Node >= 20；Yarn（包管理器）。
- `yarn test` / `npm test`：Jest（`jest.config.js`，测试 209+ 用例）。
- `yarn run build`：打包插件分发产物。
- `yarn run docs:build`：vitepress 文档。

## 契约铁律（插件收敛）

**epub-reader 是 facade 收敛的基准实现，其他插件必须照此**：
- 插件代码**只经 SDK facade**：`ctx.resources / ctx.relations / ctx.config / ctx.repoPath / ctx.logger`。
- **禁止**：`ctx.getRepository()`、裸 `repo`、`resourceService`/`relationService` 直连、
  插件内嵌 `@lo/client`、硬编码端口（如 reader 8765 须经 `ctx.config('readerBaseUrl')` 下发）。
- CLI 命令 handler 签名：`async run(args, ctx)`；ctx 为 `PluginContext` facade。
- 文件路径用 `path.join(__dirname, ...)` / `os.tmpdir()`，**禁止 `path.join('C:', ...)` 硬编码盘符**（Linux CI 会失败）。

## 测试

- 单测在 `packages/<id>/test/`；epub-reader 有 commands/reader/store/epubParser/plugin 测试。
- Mock 用 SDK facade 形状（resources/relations/config/repoPath/logger），不 mock 裸 repo。
- CI：ubuntu + windows × Node 20/22；需检出同级 `lo-plugins-sdk`。

## 提交规范

- Conventional Commits（type 英文小写 + subject 中文），header ≤ 72 字符。
- husky `pre-commit` 跑 `yarn test`，`commit-msg` 校验。
- 不提交 `dist/`、`node_modules/`、`coverage/`。
