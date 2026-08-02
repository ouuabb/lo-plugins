---
layout: home

hero:
  name: lo-plugins
  text: lo 官方插件源码仓库
  tagline: monorepo 架构，包含 Chrome 划词翻译等插件
  actions:
    - theme: brand
      text: 快速开始
      link: /guide/getting-started
    - theme: alt
      text: 插件列表
      link: /plugins/chrome-translate

features:
  - title: 双通道同步
    details: Chrome 扩展本地存储兜底 + HTTP 实时推送，recordId 去重确保数据一致性
  - title: Monorepo 架构
    details: 多插件统一管理依赖和测试
  - title: 基于 lo-sdk
    details: 所有插件基于 @lo/sdk 开发，与 lo Core 解耦
  - title: VitePress 文档
    details: 独立文档系统，涵盖指南、插件 API 与插件列表
---
