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

## 插件列表

| 插件 | 说明 |
|------|------|
| chrome-translate | Chrome 划词翻译，同步翻译记录到 lo 仓库 |
