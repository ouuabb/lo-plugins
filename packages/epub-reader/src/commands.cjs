/**
 * commands — EPUB 阅读插件的 CLI 命令处理
 *
 * 通过 commands 扩展点注册，用户通过 `lo ext epub:<name>` 调用。
 * 命令 handler 签名：async run(args, ctx)，ctx = { repo, logger, args }
 *
 * 命令列表：
 *   epub:open <rid>                 — 在浏览器中打开 Web 阅读器
 *   epub:info <rid>                 — 显示 EPUB 元信息与阅读状态
 *   epub:note <rid> [--quote <text>] — 创建笔记 Resource + 来源关系
 *   epub:notes <rid>                — 列出关联笔记
 *   epub:highlight <rid> <loc> <text> — 添加高亮
 *   epub:highlights <rid>           — 列出高亮
 *   epub:bookmark <rid> <loc> [title] — 添加书签
 *   epub:bookmarks <rid>            — 列出书签
 */

const path = require('path');
const readline = require('readline');
const { parseEpub } = require('./epubParser.cjs');
const { createStore } = require('./store.cjs');

/**
 * 获取数据目录路径
 */
function getDataDir(repo) {
  const dataDir = '.lo/plugins/epub-reader';
  return path.join(repo.repoPath, dataDir);
}

/**
 * 获取 EPUB 文件绝对路径
 */
function getEpubFilePath(repo, resource) {
  if (!resource) throw new Error('资源不存在');
  if (resource.type !== 'epub') throw new Error(`资源类型不是 epub: ${resource.type}`);
  const filePath = resource.path || resource.filePath || '';
  if (!filePath) throw new Error('资源缺少文件路径');
  return path.isAbsolute(filePath) ? filePath : path.join(repo.repoPath, filePath);
}

// ── epub:info — 显示元信息 ──

async function info(args, ctx) {
  const { repo, logger } = ctx;
  const rid = args[0];
  if (!rid) {
    logger.log('用法: lo ext epub:info <rid>');
    return;
  }

  const resource = await repo.getResource(rid);
  const filePath = getEpubFilePath(repo, resource);
  const book = parseEpub(filePath);

  logger.log(`\n《${book.title}》`);
  logger.log(`  作者: ${book.author || '未知'}`);
  logger.log(`  出版社: ${book.publisher || '未知'}`);
  logger.log(`  语言: ${book.language || '未知'}`);
  logger.log(`  章节: ${book.chapters.length}`);
  logger.log(`  总字数: ${book.chapters.reduce((s, c) => s + c.charCount, 0)}`);

  // 阅读状态
  const store = createStore(getDataDir(repo));
  const state = await store.getReadingState(rid);
  if (state) {
    logger.log(`\n阅读状态:`);
    logger.log(`  进度: ${(state.progress * 100).toFixed(1)}%`);
    logger.log(`  位置: ${state.location}`);
    logger.log(`  更新: ${state.updatedAt}`);
  } else {
    logger.log('\n阅读状态: 尚未开始阅读');
  }

  // 标注统计
  const highlights = await store.getHighlights(rid);
  const bookmarks = await store.getBookmarks(rid);
  logger.log(`\n标注: ${highlights.length} 条高亮, ${bookmarks.length} 个书签`);

  // 章节列表
  logger.log(`\n目录:`);
  book.chapters.forEach((c, i) => {
    logger.log(`  ${i + 1}. ${c.title} (${c.charCount} 字)`);
  });
}

// ── epub:note — 创建笔记 ──

async function note(args, ctx) {
  const { repo, logger } = ctx;
  const rid = args[0];
  if (!rid) {
    logger.log('用法: lo ext epub:note <rid> [--quote <引用文本>] [--location <位置>]');
    return;
  }

  // 解析参数
  const quoteIdx = args.indexOf('--quote');
  const locIdx = args.indexOf('--location');
  const quote = quoteIdx >= 0 ? args[quoteIdx + 1] : '';
  const location = locIdx >= 0 ? args[locIdx + 1] : '';

  // 确认 EPUB 资源存在
  const epubResource = await repo.getResource(rid);
  if (!epubResource) {
    logger.log('错误: EPUB 资源不存在');
    return;
  }

  // 读取笔记内容
  let content = '';
  if (process.stdin.isTTY) {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    logger.log('请输入笔记内容（Markdown 格式，空行结束）:');
    const lines = [];
    await new Promise((resolve) => {
      rl.on('line', (line) => {
        if (line === '') {
          rl.close();
          resolve();
        } else {
          lines.push(line);
        }
      });
    });
    content = lines.join('\n');
  } else {
    // 非交互模式：从 stdin 读取
    content = await readStdin();
  }

  if (!content.trim()) {
    logger.log('笔记内容为空，已取消');
    return;
  }

  // 创建笔记 Resource（2.md §5.2 阅读笔记）
  const noteResource = await repo.createResource('note', content, {
    title: `笔记: ${epubResource.title || epubResource.name || rid}`,
    metadata: {
      sourceResource: rid,
      location: location,
      quote: quote,
    },
  });

  // 建立来源关系（2.md §9 数据关系）
  const noteRid = noteResource.rid || noteResource.id || noteResource;
  await repo.createRelation(rid, noteRid, 'source-of', {
    location: location,
    quote: quote,
  });

  logger.log(`\n笔记已创建: ${noteRid}`);
  logger.log(`已关联到 EPUB: ${rid} (source-of)`);
}

// ── epub:notes — 列出关联笔记 ──

async function notes(args, ctx) {
  const { repo, logger } = ctx;
  const rid = args[0];
  if (!rid) {
    logger.log('用法: lo ext epub:notes <rid>');
    return;
  }

  // 通过 outgoing links 查找 source-of 关系的笔记
  const links = await repo.getOutgoingLinks(rid);
  const noteLinks = (links || []).filter(l => l.type === 'source-of');

  if (noteLinks.length === 0) {
    logger.log('暂无关联笔记');
    return;
  }

  logger.log(`\n关联笔记 (${noteLinks.length} 条):\n`);
  for (const link of noteLinks) {
    const noteRid = link.to;
    const note = await repo.getResource(noteRid);
    const meta = note && note.metadata ? note.metadata : {};
    logger.log(`  ${noteRid}  ${note ? (note.title || note.name || '') : '(已删除)'}`);
    if (meta.quote) logger.log(`    引用: ${meta.quote.substring(0, 50)}...`);
    if (meta.location) logger.log(`    位置: ${meta.location}`);
    if (note && note.updatedAt) logger.log(`    时间: ${note.updatedAt}`);
    logger.log('');
  }
}

// ── epub:highlight — 添加高亮 ──

async function highlight(args, ctx) {
  const { repo, logger } = ctx;
  const rid = args[0];
  const location = args[1];
  const text = args.slice(2).join(' ');

  if (!rid || !location || !text) {
    logger.log('用法: lo ext epub:highlight <rid> <location> <text>');
    logger.log('  location 格式: epubcfi(<spineIndex>!<start>:<offset>,<end>:<offset>)');
    return;
  }

  const store = createStore(getDataDir(repo));
  const entry = await store.addHighlight(rid, { location, text });
  logger.log(`高亮已添加: ${entry.id}`);
  logger.log(`  位置: ${entry.location}`);
  logger.log(`  文本: ${entry.text.substring(0, 50)}${entry.text.length > 50 ? '...' : ''}`);
}

// ── epub:highlights — 列出高亮 ──

async function highlights(args, ctx) {
  const { repo, logger } = ctx;
  const rid = args[0];
  if (!rid) {
    logger.log('用法: lo ext epub:highlights <rid>');
    return;
  }

  const store = createStore(getDataDir(repo));
  const list = await store.getHighlights(rid);

  if (list.length === 0) {
    logger.log('暂无高亮');
    return;
  }

  logger.log(`\n高亮列表 (${list.length} 条):\n`);
  for (const h of list) {
    logger.log(`  [${h.id}] ${h.location}`);
    logger.log(`    ${h.text.substring(0, 80)}${h.text.length > 80 ? '...' : ''}`);
    if (h.note) logger.log(`    笔记: ${h.note}`);
    logger.log(`    时间: ${h.createdAt}`);
    logger.log('');
  }
}

// ── epub:bookmark — 添加书签 ──

async function bookmark(args, ctx) {
  const { repo, logger } = ctx;
  const rid = args[0];
  const location = args[1];
  const title = args.slice(2).join(' ') || '';

  if (!rid || !location) {
    logger.log('用法: lo ext epub:bookmark <rid> <location> [title]');
    return;
  }

  const store = createStore(getDataDir(repo));
  const entry = await store.addBookmark(rid, { location, title });
  logger.log(`书签已添加: ${entry.id}`);
  logger.log(`  位置: ${entry.location}`);
  if (entry.title) logger.log(`  标题: ${entry.title}`);
}

// ── epub:bookmarks — 列出书签 ──

async function bookmarks(args, ctx) {
  const { repo, logger } = ctx;
  const rid = args[0];
  if (!rid) {
    logger.log('用法: lo ext epub:bookmarks <rid>');
    return;
  }

  const store = createStore(getDataDir(repo));
  const list = await store.getBookmarks(rid);

  if (list.length === 0) {
    logger.log('暂无书签');
    return;
  }

  logger.log(`\n书签列表 (${list.length} 个):\n`);
  for (const b of list) {
    logger.log(`  [${b.id}] ${b.location}`);
    if (b.title) logger.log(`    ${b.title}`);
    logger.log(`    时间: ${b.createdAt}`);
    logger.log('');
  }
}

// ── 工具函数 ──

function readStdin() {
  return new Promise((resolve) => {
    let data = '';
    process.stdin.setEncoding('utf8');
    process.stdin.on('data', (chunk) => { data += chunk; });
    process.stdin.on('end', () => resolve(data));
  });
}

// ── epub:open — 浏览器打开 Web 阅读器 ──

async function open(args, ctx) {
  const { repo, logger } = ctx;
  const rid = args[0];
  if (!rid) {
    logger.log('用法: lo ext epub:open <rid>');
    return;
  }

  // 确认资源存在
  const resource = await repo.getResource(rid);
  if (!resource) {
    logger.log('错误: 资源不存在');
    return;
  }
  if (resource.type !== 'epub') {
    logger.log(`错误: 资源类型不是 epub: ${resource.type}`);
    return;
  }

  const url = `http://127.0.0.1:8765/api/plugins/epub-reader/reader?rid=${rid}`;
  const { exec } = require('child_process');
  const platform = process.platform;
  let cmd;
  if (platform === 'darwin') {
    cmd = `open "${url}"`;
  } else if (platform === 'win32') {
    cmd = `start "" "${url}"`;
  } else {
    cmd = `xdg-open "${url}"`;
  }
  exec(cmd, (err) => {
    if (err) {
      logger.log(`无法自动打开浏览器，请手动访问:\n  ${url}`);
    } else {
      logger.log(`已在浏览器中打开: ${resource.title || resource.name || rid}`);
    }
  });
}

// ── 命令注册表 ──

const commands = {
  'epub:open':      { run: open,       description: '在浏览器中打开 Web 阅读器' },
  'epub:info':      { run: info,       description: '显示 EPUB 元信息与阅读状态' },
  'epub:note':      { run: note,       description: '创建阅读笔记 Resource 并关联到 EPUB' },
  'epub:notes':     { run: notes,      description: '列出 EPUB 的关联笔记' },
  'epub:highlight': { run: highlight,  description: '添加高亮标注' },
  'epub:highlights':{ run: highlights, description: '列出高亮标注' },
  'epub:bookmark':  { run: bookmark,   description: '添加书签' },
  'epub:bookmarks': { run: bookmarks,  description: '列出书签' },
};

module.exports = { commands, getDataDir, getEpubFilePath };
