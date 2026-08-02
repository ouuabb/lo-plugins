/**
 * commands 单元测试
 *
 * 测试 EPUB 阅读插件的 8 个 CLI 命令 handler：
 *   epub:open / epub:info / epub:note / epub:notes
 *   epub:highlight / epub:highlights / epub:bookmark / epub:bookmarks
 *
 * Mock 策略：
 *   - store.cjs 的 createStore → 内存假 store
 *   - epubParser.cjs 的 parseEpub → 假 book
 *   - repo / logger / child_process.exec → jest.fn 假对象
 */

const path = require('path');

jest.mock('readline', () => ({
  createInterface: jest.fn(),
}));

jest.mock('../src/store.cjs', () => ({
  createStore: jest.fn(),
}));

jest.mock('../src/epubParser.cjs', () => ({
  parseEpub: jest.fn(),
}));

const { commands, getDataDir, getEpubFilePath } = require('../src/commands.cjs');
const store = require('../src/store.cjs');
const { parseEpub } = require('../src/epubParser.cjs');
const childProcess = require('child_process');
const { EventEmitter } = require('events');

// ── 测试数据 ──

const fakeBook = {
  title: '测试书',
  author: '作者',
  publisher: '出版社',
  language: 'zh-CN',
  chapters: [
    { title: '第一章', charCount: 100 },
    { title: '第二章', charCount: 200 },
  ],
};

// ── Mock 工厂 ──

function createMockStore() {
  const data = { readingState: null, highlights: [], bookmarks: [] };
  const s = {
    _data: data,
    getReadingState: jest.fn(async () => data.readingState),
    getHighlights: jest.fn(async () => data.highlights),
    getBookmarks: jest.fn(async () => data.bookmarks),
    addHighlight: jest.fn(async (rid, h) => {
      const entry = {
        id: 'hl_1',
        ...h,
        style: 'yellow',
        note: '',
        createdAt: '2026-01-01T00:00:00.000Z',
      };
      data.highlights.push(entry);
      return entry;
    }),
    addBookmark: jest.fn(async (rid, b) => {
      const entry = {
        id: 'bm_1',
        ...b,
        createdAt: '2026-01-01T00:00:00.000Z',
      };
      data.bookmarks.push(entry);
      return entry;
    }),
  };
  store.createStore.mockReturnValue(s);
  return s;
}

function createMockRepo(overrides = {}) {
  return {
    repoPath: path.join('C:', 'test', 'lo-repo'),
    getResource: jest.fn(),
    createResource: jest.fn(async () => ({ rid: 'note-001' })),
    createRelation: jest.fn(async () => ({})),
    getOutgoingLinks: jest.fn(async () => []),
    ...overrides,
  };
}

function createMockLogger() {
  return {
    log: jest.fn(),
    info: jest.fn(),
    debug: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  };
}

function epubResource(overrides = {}) {
  return {
    rid: 'res-1',
    type: 'epub',
    name: 'book.epub',
    title: '测试书',
    path: path.join('C:', 'books', 'book.epub'),
    metadata: { title: '测试书', author: '作者' },
    ...overrides,
  };
}

// 非 TTY stdin：读 stdin 时喂入 data + end
// 注意 process.stdin 是 configurable getter，直接赋值无效，需 defineProperty 覆盖
const stdinDescriptor = Object.getOwnPropertyDescriptor(process, 'stdin');

function overrideStdin(value) {
  Object.defineProperty(process, 'stdin', {
    configurable: true,
    enumerable: true,
    writable: true,
    value,
  });
}

function restoreStdin() {
  Object.defineProperty(process, 'stdin', stdinDescriptor);
}

function setupNonTTYStdin(data) {
  const fake = new EventEmitter();
  fake.setEncoding = jest.fn();
  fake.isTTY = false;
  overrideStdin(fake);
  return {
    restore: restoreStdin,
    feed() {
      setImmediate(() => {
        fake.emit('data', data);
        fake.emit('end');
      });
    },
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  parseEpub.mockReturnValue(fakeBook);
});

// ── getDataDir / getEpubFilePath ──

describe('getDataDir / getEpubFilePath', () => {
  const repo = createMockRepo();

  test('getDataDir 基于 repoPath 拼接', () => {
    expect(getDataDir(repo)).toBe(path.join(repo.repoPath, '.lo', 'plugins', 'epub-reader'));
  });

  test('getEpubFilePath: 资源不存在抛错', () => {
    expect(() => getEpubFilePath(repo, null)).toThrow('资源不存在');
    expect(() => getEpubFilePath(repo, undefined)).toThrow('资源不存在');
  });

  test('getEpubFilePath: 非 epub 类型抛错', () => {
    expect(() => getEpubFilePath(repo, { type: 'note', path: 'x' })).toThrow('资源类型不是 epub');
  });

  test('getEpubFilePath: 缺少文件路径抛错', () => {
    expect(() => getEpubFilePath(repo, { type: 'epub' })).toThrow('资源缺少文件路径');
  });

  test('getEpubFilePath: 绝对路径原样返回', () => {
    const abs = path.join('C:', 'books', 'a.epub');
    expect(getEpubFilePath(repo, { type: 'epub', path: abs })).toBe(abs);
  });

  test('getEpubFilePath: 相对路径拼接到 repoPath', () => {
    const rel = 'books/a.epub';
    expect(getEpubFilePath(repo, { type: 'epub', path: rel }))
      .toBe(path.join(repo.repoPath, rel));
  });

  test('getEpubFilePath: 回退到 filePath 字段', () => {
    const abs = path.join('C:', 'books', 'b.epub');
    expect(getEpubFilePath(repo, { type: 'epub', filePath: abs })).toBe(abs);
  });
});

// ── epub:info ──

describe('epub:info', () => {
  test('无参数时打印用法', async () => {
    const repo = createMockRepo();
    const logger = createMockLogger();
    await commands['epub:info'].run([], { repo, logger });

    expect(logger.info).toHaveBeenCalledWith('用法: lo ext epub:info <rid>');
    expect(repo.getResource).not.toHaveBeenCalled();
  });

  test('打印书籍元信息与阅读状态', async () => {
    const repo = createMockRepo({ getResource: jest.fn(async () => epubResource()) });
    const storeMock = createMockStore();
    storeMock._data.readingState = { location: 'epubcfi(2!/2:0,/2:0)', progress: 0.5, updatedAt: '2026-01-01T00:00:00.000Z' };
    storeMock._data.highlights = [{ id: 'h1', location: 'l1', text: 't', createdAt: 'c' }];
    storeMock._data.bookmarks = [{ id: 'b1', location: 'l2', createdAt: 'c' }];
    const logger = createMockLogger();

    await commands['epub:info'].run(['res-1'], { repo, logger });

    expect(parseEpub).toHaveBeenCalled();
    expect(logger.info).toHaveBeenCalledWith(expect.stringContaining('《测试书》'));
    expect(logger.info).toHaveBeenCalledWith(expect.stringContaining('作者'));
    expect(logger.info).toHaveBeenCalledWith(expect.stringContaining('出版社'));
    expect(logger.info).toHaveBeenCalledWith(expect.stringContaining('语言'));
    expect(logger.info).toHaveBeenCalledWith(expect.stringContaining('章节'));
    expect(logger.info).toHaveBeenCalledWith(expect.stringContaining('300'));
    expect(logger.info).toHaveBeenCalledWith(expect.stringContaining('50.0%'));
    expect(logger.info).toHaveBeenCalledWith(expect.stringContaining('1 条高亮, 1 个书签'));
    expect(logger.info).toHaveBeenCalledWith(expect.stringContaining('第一章'));
  });

  test('未开始阅读时提示', async () => {
    const repo = createMockRepo({ getResource: jest.fn(async () => epubResource()) });
    createMockStore();
    const logger = createMockLogger();

    await commands['epub:info'].run(['res-1'], { repo, logger });

    expect(logger.info).toHaveBeenCalledWith('\n阅读状态: 尚未开始阅读');
  });
});

// ── epub:open ──

describe('epub:open', () => {
  test('无参数时打印用法', async () => {
    const repo = createMockRepo();
    const logger = createMockLogger();
    await commands['epub:open'].run([], { repo, logger });

    expect(logger.info).toHaveBeenCalledWith('用法: lo ext epub:open <rid>');
  });

  test('资源不存在时报错', async () => {
    const repo = createMockRepo({ getResource: jest.fn(async () => null) });
    const logger = createMockLogger();
    await commands['epub:open'].run(['res-1'], { repo, logger });

    expect(logger.info).toHaveBeenCalledWith('错误: 资源不存在');
  });

  test('非 epub 类型时报错', async () => {
    const repo = createMockRepo({ getResource: jest.fn(async () => ({ rid: 'x', type: 'note' })) });
    const logger = createMockLogger();
    await commands['epub:open'].run(['res-1'], { repo, logger });

    expect(logger.info).toHaveBeenCalledWith(expect.stringContaining('资源类型不是 epub'));
  });

  test('有效资源时调用浏览器打开', async () => {
    const repo = createMockRepo({ getResource: jest.fn(async () => epubResource()) });
    const logger = createMockLogger();
    let capturedCmd = null;
    const spy = jest.spyOn(childProcess, 'exec').mockImplementation((cmd, cb) => {
      capturedCmd = cmd;
      cb(null);
    });

    await commands['epub:open'].run(['res-1'], { repo, logger });

    expect(capturedCmd).toContain('res-1');
    expect(logger.info).toHaveBeenCalledWith(expect.stringContaining('已在浏览器中打开'));
    spy.mockRestore();
  });

  test('exec 失败时提示手动访问', async () => {
    const repo = createMockRepo({ getResource: jest.fn(async () => epubResource()) });
    const logger = createMockLogger();
    const spy = jest.spyOn(childProcess, 'exec').mockImplementation((cmd, cb) => {
      cb(new Error('spawn failed'));
    });

    await commands['epub:open'].run(['res-1'], { repo, logger });

    expect(logger.info).toHaveBeenCalledWith(expect.stringContaining('无法自动打开浏览器'));
    spy.mockRestore();
  });
});

// ── epub:note ──

describe('epub:note', () => {
  test('无参数时打印用法', async () => {
    const repo = createMockRepo();
    const logger = createMockLogger();
    await commands['epub:note'].run([], { repo, logger });

    expect(logger.info).toHaveBeenCalledWith(expect.stringContaining('用法'));
    expect(repo.createResource).not.toHaveBeenCalled();
  });

  test('EPUB 资源不存在时报错', async () => {
    const repo = createMockRepo({ getResource: jest.fn(async () => null) });
    const logger = createMockLogger();
    const stdinMock = setupNonTTYStdin('笔记内容');
    const p = commands['epub:note'].run(['res-1'], { repo, logger });
    stdinMock.feed();
    await p;
    stdinMock.restore();

    expect(logger.info).toHaveBeenCalledWith('错误: EPUB 资源不存在');
    expect(repo.createResource).not.toHaveBeenCalled();
  });

  test('从非交互 stdin 读取内容并创建笔记 Resource + 关系', async () => {
    const repo = createMockRepo({ getResource: jest.fn(async () => epubResource()) });
    const logger = createMockLogger();
    const stdinMock = setupNonTTYStdin('这是笔记内容');
    const p = commands['epub:note'].run(['res-1'], { repo, logger });
    stdinMock.feed();
    await p;
    stdinMock.restore();

    expect(repo.createResource).toHaveBeenCalledWith(
      'note',
      '这是笔记内容',
      expect.objectContaining({
        title: '笔记: 测试书',
        metadata: expect.objectContaining({ sourceResource: 'res-1' }),
      })
    );
    expect(repo.createRelation).toHaveBeenCalledWith(
      'res-1',
      'note-001',
      'source-of',
      expect.objectContaining({ location: '', quote: '' })
    );
    expect(logger.info).toHaveBeenCalledWith(expect.stringContaining('笔记已创建: note-001'));
  });

  test('--quote / --location 参数透传到 metadata 与关系', async () => {
    const repo = createMockRepo({ getResource: jest.fn(async () => epubResource()) });
    const logger = createMockLogger();
    const stdinMock = setupNonTTYStdin('内容');
    const args = ['res-1', '--quote', '引用文本', '--location', 'epubcfi(2!/2:0,/2:0)'];
    const p = commands['epub:note'].run(args, { repo, logger });
    stdinMock.feed();
    await p;
    stdinMock.restore();

    const createCall = repo.createResource.mock.calls[0][2];
    expect(createCall.metadata.quote).toBe('引用文本');
    expect(createCall.metadata.location).toBe('epubcfi(2!/2:0,/2:0)');

    const relCall = repo.createRelation.mock.calls[0][3];
    expect(relCall.quote).toBe('引用文本');
    expect(relCall.location).toBe('epubcfi(2!/2:0,/2:0)');
  });

  test('交互模式（TTY）通过 readline 读取多行', async () => {
    const rl = new EventEmitter();
    rl.close = jest.fn();
    require('readline').createInterface.mockReturnValue(rl);

    const repo = createMockRepo({ getResource: jest.fn(async () => epubResource()) });
    const logger = createMockLogger();
    overrideStdin({ isTTY: true });
    const p = commands['epub:note'].run(['res-1'], { repo, logger });
    setImmediate(() => {
      rl.emit('line', '第一行');
      rl.emit('line', '第二行');
      rl.emit('line', '');
    });
    await p;
    restoreStdin();

    expect(repo.createResource).toHaveBeenCalledWith(
      'note',
      '第一行\n第二行',
      expect.anything()
    );
    expect(rl.close).toHaveBeenCalled();
  });

  test('内容为空时取消创建', async () => {
    const repo = createMockRepo({ getResource: jest.fn(async () => epubResource()) });
    const logger = createMockLogger();
    const stdinMock = setupNonTTYStdin('   \n');
    const p = commands['epub:note'].run(['res-1'], { repo, logger });
    stdinMock.feed();
    await p;
    stdinMock.restore();

    expect(logger.info).toHaveBeenCalledWith('笔记内容为空，已取消');
    expect(repo.createResource).not.toHaveBeenCalled();
  });
});

// ── epub:notes ──

describe('epub:notes', () => {
  test('无参数时打印用法', async () => {
    const repo = createMockRepo();
    const logger = createMockLogger();
    await commands['epub:notes'].run([], { repo, logger });

    expect(logger.info).toHaveBeenCalledWith('用法: lo ext epub:notes <rid>');
  });

  test('无 source-of 关系时提示暂无笔记', async () => {
    const repo = createMockRepo({
      getOutgoingLinks: jest.fn(async () => [
        { from: 'res-1', to: 'note-x', type: 'highlight-of' },
      ]),
    });
    const logger = createMockLogger();
    await commands['epub:notes'].run(['res-1'], { repo, logger });

    expect(logger.info).toHaveBeenCalledWith('暂无关联笔记');
  });

  test('列出关联笔记', async () => {
    const repo = createMockRepo({
      getOutgoingLinks: jest.fn(async () => [
        { from: 'res-1', to: 'note-1', type: 'source-of', metadata: {} },
      ]),
      getResource: jest.fn(async () => ({
        rid: 'note-1',
        title: '笔记标题',
        metadata: { quote: '引用原文内容', location: 'epubcfi(2!/2:0,/2:0)' },
        updatedAt: '2026-01-01T00:00:00.000Z',
      })),
    });
    const logger = createMockLogger();

    await commands['epub:notes'].run(['res-1'], { repo, logger });

    expect(logger.info).toHaveBeenCalledWith(expect.stringContaining('关联笔记 (1 条)'));
    expect(logger.info).toHaveBeenCalledWith(expect.stringContaining('note-1'));
    expect(logger.info).toHaveBeenCalledWith(expect.stringContaining('引用原文内容'));
    expect(logger.info).toHaveBeenCalledWith(expect.stringContaining('epubcfi(2!/2:0,/2:0)'));
  });

  test('笔记资源已删除时显示 (已删除)', async () => {
    const repo = createMockRepo({
      getOutgoingLinks: jest.fn(async () => [
        { from: 'res-1', to: 'note-gone', type: 'source-of' },
      ]),
      getResource: jest.fn(async () => null),
    });
    const logger = createMockLogger();

    await commands['epub:notes'].run(['res-1'], { repo, logger });

    expect(logger.info).toHaveBeenCalledWith(expect.stringContaining('(已删除)'));
  });
});

// ── epub:highlight ──

describe('epub:highlight', () => {
  test('参数缺失时打印用法', async () => {
    const repo = createMockRepo();
    const logger = createMockLogger();
    await commands['epub:highlight'].run(['res-1'], { repo, logger });

    expect(logger.info).toHaveBeenCalledWith(expect.stringContaining('用法'));
  });

  test('添加高亮', async () => {
    const repo = createMockRepo();
    createMockStore();
    const logger = createMockLogger();

    await commands['epub:highlight'].run(['res-1', 'epubcfi(2!/2:0,/2:0)', '高亮文本'], { repo, logger });

    expect(store.createStore).toHaveBeenCalled();
    expect(logger.info).toHaveBeenCalledWith('高亮已添加: hl_1');
    expect(logger.info).toHaveBeenCalledWith(expect.stringContaining('epubcfi(2!/2:0,/2:0)'));
  });
});

// ── epub:highlights ──

describe('epub:highlights', () => {
  test('无参数时打印用法', async () => {
    const repo = createMockRepo();
    const logger = createMockLogger();
    await commands['epub:highlights'].run([], { repo, logger });

    expect(logger.info).toHaveBeenCalledWith('用法: lo ext epub:highlights <rid>');
  });

  test('无高亮时提示', async () => {
    const repo = createMockRepo();
    createMockStore();
    const logger = createMockLogger();

    await commands['epub:highlights'].run(['res-1'], { repo, logger });

    expect(logger.info).toHaveBeenCalledWith('暂无高亮');
  });

  test('列出高亮', async () => {
    const repo = createMockRepo();
    const storeMock = createMockStore();
    storeMock._data.highlights = [
      { id: 'h1', location: 'loc-1', text: '文本内容', note: '', createdAt: '2026-01-01T00:00:00.000Z' },
    ];
    const logger = createMockLogger();

    await commands['epub:highlights'].run(['res-1'], { repo, logger });

    expect(logger.info).toHaveBeenCalledWith(expect.stringContaining('高亮列表 (1 条)'));
    expect(logger.info).toHaveBeenCalledWith(expect.stringContaining('[h1] loc-1'));
    expect(logger.info).toHaveBeenCalledWith(expect.stringContaining('文本内容'));
  });
});

// ── epub:bookmark ──

describe('epub:bookmark', () => {
  test('参数缺失时打印用法', async () => {
    const repo = createMockRepo();
    const logger = createMockLogger();
    await commands['epub:bookmark'].run(['res-1'], { repo, logger });

    expect(logger.info).toHaveBeenCalledWith(expect.stringContaining('用法'));
  });

  test('添加书签', async () => {
    const repo = createMockRepo();
    createMockStore();
    const logger = createMockLogger();

    await commands['epub:bookmark'].run(['res-1', 'epubcfi(2!/2:0,/2:0)', '我的书签'], { repo, logger });

    expect(logger.info).toHaveBeenCalledWith('书签已添加: bm_1');
    expect(logger.info).toHaveBeenCalledWith(expect.stringContaining('我的书签'));
  });
});

// ── epub:bookmarks ──

describe('epub:bookmarks', () => {
  test('无参数时打印用法', async () => {
    const repo = createMockRepo();
    const logger = createMockLogger();
    await commands['epub:bookmarks'].run([], { repo, logger });

    expect(logger.info).toHaveBeenCalledWith('用法: lo ext epub:bookmarks <rid>');
  });

  test('无书签时提示', async () => {
    const repo = createMockRepo();
    createMockStore();
    const logger = createMockLogger();

    await commands['epub:bookmarks'].run(['res-1'], { repo, logger });

    expect(logger.info).toHaveBeenCalledWith('暂无书签');
  });

  test('列出书签', async () => {
    const repo = createMockRepo();
    const storeMock = createMockStore();
    storeMock._data.bookmarks = [
      { id: 'b1', location: 'loc-1', title: '章节标题', createdAt: '2026-01-01T00:00:00.000Z' },
    ];
    const logger = createMockLogger();

    await commands['epub:bookmarks'].run(['res-1'], { repo, logger });

    expect(logger.info).toHaveBeenCalledWith(expect.stringContaining('书签列表 (1 个)'));
    expect(logger.info).toHaveBeenCalledWith(expect.stringContaining('[b1] loc-1'));
    expect(logger.info).toHaveBeenCalledWith(expect.stringContaining('章节标题'));
  });
});

// ── 命令注册表 ──

describe('commands 注册表', () => {
  test('注册 8 个 CLI 命令', () => {
    expect(Object.keys(commands)).toHaveLength(8);
    for (const [key, entry] of Object.entries(commands)) {
      expect(typeof entry.run).toBe('function');
      expect(typeof entry.description).toBe('string');
    }
  });

  test('命令键名符合 epub: 前缀约定', () => {
    const keys = Object.keys(commands).sort();
    expect(keys).toEqual([
      'epub:bookmark', 'epub:bookmarks', 'epub:highlight', 'epub:highlights',
      'epub:info', 'epub:note', 'epub:notes', 'epub:open',
    ]);
  });
});
