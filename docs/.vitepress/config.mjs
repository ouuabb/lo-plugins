import { defineConfig } from 'vitepress';

export default defineConfig({
  title: 'lo-plugins',
  description: 'lo 官方插件源码仓库',
  lang: 'zh-CN',
  cleanUrls: true,
  lastUpdated: true,

  themeConfig: {
    nav: [
      { text: '指南', link: '/guide/getting-started' },
      { text: '插件', link: '/plugins/chrome-translate' },
    ],

    sidebar: {
      '/guide/': [
        {
          text: '指南',
          items: [
            { text: '快速开始', link: '/guide/getting-started' },
            { text: '插件目录结构', link: '/guide/plugin-structure' },
            { text: '开发指南', link: '/guide/development' },
          ],
        },
      ],
      '/plugins/': [
        {
          text: '插件列表',
          items: [
            { text: 'Chrome 划词翻译', link: '/plugins/chrome-translate' },
            { text: 'EPUB 阅读', link: '/plugins/epub-reader' },
            { text: 'EPUB 书库', link: '/plugins/epub-library' },
          ],
        },
      ],
    },

    socialLinks: [
      { icon: 'github', link: 'https://github.com/ouuabb/lo-plugins' },
    ],

    footer: {
      message: '基于 MIT 协议发布',
      copyright: 'Copyright © 2026 lo Project',
    },
  },
});
