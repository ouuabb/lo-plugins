# lo-plugins

lo 官方插件源码仓库（monorepo）。

## 结构

```
lo-plugins/
  packages/
    chrome-translate/    # Chrome 划词翻译插件
  shared/
    utils/               # 共享工具
    index.cjs            # 共享模块入口
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
