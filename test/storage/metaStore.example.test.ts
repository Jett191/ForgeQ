/**
 * EXAMPLE - MetaStore 原子写 / 损坏检测（Task 9.3）
 *
 * 该用例集合是 `MetaStore`（Task 9.2）与底层 `atomicFs.writeAtomicJson`
 * （Task 9.1）的最小 EXAMPLE 验证，覆盖 design.md > Storage Facade 与子层 >
 * "tmp + rename" 原子语义、以及 "meta.json 损坏 → META_CORRUPT" 的两条核心
 * 不变量：
 *
 *   1. **写读 round-trip**：`writeAtomic(meta)` 之后 `read()` 返回深度等价值；
 *      `meta.json.tmp` 在写入完成后不应残留（rename 已把它消费掉）。
 *
 *   2. **`meta.json.tmp` 残留场景**：在调用 `writeAtomic` 之前先手工写入一份
 *      历史 `.tmp`（模拟上一次进程在 rename 之前 crash），新一轮原子写应当
 *      正常完成——目标 `meta.json` 内容来自本次写入而非 tmp 残留，
 *      且最终 tmp 文件不再存在（被 rename 消费）。
 *
 *   3. **JSON 损坏检测**：当磁盘上的 `meta.json` 不是合法 JSON 时,`read()`
 *      抛出 `MetaCorruptError`，且 `code === 'META_CORRUPT'`、`reason` 提示
 *      `'invalid JSON'`。
 *
 *   4. **结构损坏检测（缺 schemaVersion）**：合法 JSON 但缺失顶层
 *      `schemaVersion` 也视为损坏，`reason === 'missing schemaVersion'`。
 *
 *   5. **toDomainError 转换**：`MetaCorruptError.toDomainError()` 产出
 *      `{ code: 'META_CORRUPT', cause: <reason> }`，便于上层 Storage Facade
 *      转译为 `DomainError` 联合（design.md > Error Handling）。
 *
 *   6. **文件不存在透传**：`read()` 在 `meta.json` 不存在时透出
 *      `vscode.FileSystemError` 的 `FileNotFound`，**不**视为 META_CORRUPT，
 *      让上层 `Storage.bootstrap` 自行决定写默认值还是报错。
 *
 * **Validates: Requirements 11.5（损坏自愈：以错误形式向上层暴露）, 11.6（写入
 * 原子语义：tmp 残留可被覆盖、目标文件保持上一次稳定值）**
 */

import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import type { MemFsHarness } from '../harness/memFsHarness.js';

// `vi.mock` 工厂在 vitest 运行时会被提升到文件顶部，普通的顶层 const 在那一刻
// 还没有完成初始化（会触发 "Cannot access 'harness' before initialization"）。
// 解法：用 `vi.hoisted` 让 harness 的构造也被提升；factory 写成 async + 动态
// import 以避开 require 在 ESM-only ts 源上的解析问题，返回值是 `Promise<...>`，
// 避免在模块顶层使用 `await`（Node16 module 模式下不允许）。
const hoistedHarness = vi.hoisted(async () => {
  const mod = await import('../harness/memFsHarness.js');
  return mod.createMemFsHarness();
});

// `MetaStore` 与 `atomicFs` 在运行时 `import * as vscode from 'vscode'`，
// 因此必须在所有真实模块的 import 之前替换该模块。`vi.mock` 工厂同样被
// hoist，但运行顺序晚于 `vi.hoisted`，因此可以安全地 `await hoistedHarness`。
vi.mock('vscode', async () => {
  const mod = await import('../harness/memFsHarness.js');
  const harness = await hoistedHarness;
  return mod.createVscodeModuleMock(harness);
});

// 注：mock 必须先于真实模块的 import，下面这些 import 才能拿到桩实现。
// eslint-disable-next-line import/first
import { HarnessFileSystemError, HarnessUri } from '../harness/memFsHarness.js';
// eslint-disable-next-line import/first
import { MetaCorruptError, MetaStore } from '../../src/storage/metaStore.js';
// eslint-disable-next-line import/first
import type { BankMeta } from '../../src/types/bankMeta.js';

// 测试体中需要同步访问 harness。`beforeAll` 在所有 it 之前 await 一次拿到
// 同一份实例并赋值；`!:` 让 TS 信任 setup 总会执行成功。
let harness!: MemFsHarness;

/** 构造测试用的 meta URI（`<globalStorageUri>/meta.json`），与生产形态一致。 */
function metaUri(): HarnessUri {
  return HarnessUri.joinPath(harness.globalStorageUri, 'meta.json');
}

/** 与 `meta.json` 同目录的 `<...>.tmp` URI，便于断言 tmp 残留是否被消费。 */
function metaTmpUri(): HarnessUri {
  return HarnessUri.joinPath(harness.globalStorageUri, 'meta.json.tmp');
}

/** 直接经底层桩往磁盘写入文本（用于构造 "上一次 crash 留下的 tmp" 等异常状态）。 */
async function rawWriteText(uri: HarnessUri, text: string): Promise<void> {
  await harness.workspaceFs.writeFile(uri, new TextEncoder().encode(text));
}

/** 直接经底层桩从磁盘读字节并解码为字符串。 */
async function rawReadText(uri: HarnessUri): Promise<string> {
  const bytes = await harness.workspaceFs.readFile(uri);
  return new TextDecoder('utf-8').decode(bytes);
}

/**
 * 判断 URI 在 memfs 上是否存在。`stat` 在不存在时抛 `FileNotFound`，
 * 这里用 try/catch 收敛为布尔以便断言更直观。
 */
async function exists(uri: HarnessUri): Promise<boolean> {
  try {
    await harness.workspaceFs.stat(uri);
    return true;
  } catch (err) {
    if (err instanceof HarnessFileSystemError && err.code === 'FileNotFound') {
      return false;
    }
    throw err;
  }
}

describe('MetaStore example', () => {
  beforeAll(async () => {
    harness = await hoistedHarness;
  });

  beforeEach(() => {
    // 每个用例独立隔离磁盘状态；`reset` 也会重新创建 globalStorageUri 根目录。
    harness.reset();
  });

  it('writeAtomic 后 read 返回深度等价值，且不残留 meta.json.tmp', async () => {
    const store = new MetaStore(metaUri());

    const meta: BankMeta = {
      schemaVersion: 1,
      currentBankId: 'bank-current',
      banks: [
        {
          id: 'bank-current',
          name: '面试题库 A',
          version: '1.0.0',
          questionCount: 42,
          importedAt: 1_700_000_000_000,
          source: { fileName: 'bank-a.json' },
        },
      ],
    };

    await store.writeAtomic(meta);

    const loaded = await store.read();
    expect(loaded).toEqual(meta);

    // tmp 已被 rename 消费，不应残留；目标 meta.json 应当存在。
    expect(await exists(metaTmpUri())).toBe(false);
    expect(await exists(metaUri())).toBe(true);

    // 进一步确认序列化是 pretty-print（与 writeAtomicJson 的 2 空格缩进一致），
    // 这是底层 `atomicFs.writeAtomicJson` 的稳定行为，对人工排错有意义。
    const onDisk = await rawReadText(metaUri());
    expect(onDisk).toBe(JSON.stringify(meta, null, 2));
  });

  it('当 meta.json.tmp 残留时，新一轮 writeAtomic 仍能正确替换并清掉 tmp', async () => {
    const store = new MetaStore(metaUri());

    // 1) 先有一份稳定的 meta.json（模拟“上一轮成功写入”）。
    const stableMeta: BankMeta = {
      schemaVersion: 1,
      banks: [
        {
          id: 'bank-stable',
          name: 'Stable',
          version: '0.9.0',
          questionCount: 1,
          importedAt: 1_690_000_000_000,
        },
      ],
    };
    await store.writeAtomic(stableMeta);
    expect(await exists(metaTmpUri())).toBe(false);

    // 2) 模拟“上一次进程在 rename 之前 crash”——磁盘上多出一份历史 tmp。
    //    它的内容故意与本次将要写入的内容不同，用以验证最终 meta.json 取的是
    //    本次写入的字节，而不是被旧 tmp 污染。
    await rawWriteText(metaTmpUri(), '{"schemaVersion":1,"banks":[],"junk":true}');
    expect(await exists(metaTmpUri())).toBe(true);

    // 3) 触发新一轮原子写。
    const nextMeta: BankMeta = {
      schemaVersion: 1,
      currentBankId: 'bank-next',
      banks: [
        {
          id: 'bank-next',
          name: 'Next',
          version: '1.0.0',
          questionCount: 5,
          importedAt: 1_710_000_000_000,
        },
      ],
    };
    await store.writeAtomic(nextMeta);

    // 4) 不变量：
    //    a. tmp 已被消费，不再残留；
    //    b. meta.json 内容等于本次写入，不混入历史 tmp 的 `junk` 字段；
    //    c. read() 返回深度等价值。
    expect(await exists(metaTmpUri())).toBe(false);
    const loaded = await store.read();
    expect(loaded).toEqual(nextMeta);
    expect(loaded).not.toHaveProperty('junk');
  });

  it('JSON 解析失败时 read 抛 MetaCorruptError，code/reason 与设计一致', async () => {
    // 在 meta.json 写入非法 JSON（少一个 brace）。
    await rawWriteText(metaUri(), '{ "schemaVersion": 1, "banks": [');

    const store = new MetaStore(metaUri());

    await expect(store.read()).rejects.toBeInstanceOf(MetaCorruptError);

    // 进一步对错误对象做断言（rejects.toBeInstanceOf 不暴露 err 引用）。
    let caught: unknown;
    try {
      await store.read();
    } catch (err) {
      caught = err;
    }
    expect(caught).toBeInstanceOf(MetaCorruptError);
    const corrupt = caught as MetaCorruptError;
    expect(corrupt.code).toBe('META_CORRUPT');
    expect(corrupt.reason).toBe('invalid JSON');
    // 原始 SyntaxError 通过 `cause` 透传，便于排查。
    expect((corrupt as Error & { cause?: unknown }).cause).toBeDefined();

    // toDomainError 输出与上层 DomainError 联合一致。
    expect(corrupt.toDomainError()).toEqual({
      code: 'META_CORRUPT',
      cause: 'invalid JSON',
    });
  });

  it('合法 JSON 但缺失 schemaVersion 时 read 抛 MetaCorruptError(missing schemaVersion)', async () => {
    // 内容是合法 JSON，但顶层对象不含 `schemaVersion`，按 design.md 视为损坏。
    await rawWriteText(metaUri(), JSON.stringify({ banks: [] }));

    const store = new MetaStore(metaUri());

    let caught: unknown;
    try {
      await store.read();
    } catch (err) {
      caught = err;
    }
    expect(caught).toBeInstanceOf(MetaCorruptError);
    const corrupt = caught as MetaCorruptError;
    expect(corrupt.code).toBe('META_CORRUPT');
    expect(corrupt.reason).toBe('missing schemaVersion');
    expect(corrupt.toDomainError()).toEqual({
      code: 'META_CORRUPT',
      cause: 'missing schemaVersion',
    });
  });

  it('JSON 解析为非对象（数组 / null）时同样视为损坏', async () => {
    // 数组：合法 JSON，但顶层不是对象。
    await rawWriteText(metaUri(), '[]');
    const store = new MetaStore(metaUri());

    await expect(store.read()).rejects.toBeInstanceOf(MetaCorruptError);

    // 切换到 null，再次确认同一损坏分支。
    await rawWriteText(metaUri(), 'null');
    let caught: unknown;
    try {
      await store.read();
    } catch (err) {
      caught = err;
    }
    expect(caught).toBeInstanceOf(MetaCorruptError);
    expect((caught as MetaCorruptError).reason).toBe('missing schemaVersion');
  });

  it('meta.json 不存在时 read 透出 FileNotFound（不视为 META_CORRUPT）', async () => {
    // 不创建 meta.json；read 应抛底层 vscode.FileSystemError(FileNotFound)。
    const store = new MetaStore(metaUri());

    let caught: unknown;
    try {
      await store.read();
    } catch (err) {
      caught = err;
    }
    expect(caught).toBeInstanceOf(HarnessFileSystemError);
    expect((caught as HarnessFileSystemError).code).toBe('FileNotFound');
    // 关键：不应被错误地包装成 MetaCorruptError——bootstrap 依赖这个区分
    // 来决定 "首次启动写默认 meta" 还是 "进入安全模式"。
    expect(caught).not.toBeInstanceOf(MetaCorruptError);
  });
});
