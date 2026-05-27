/**
 * EXAMPLE - Trash 7 日 purge（Task 12.2）
 *
 * 验证 `Trash.purge` 在给定时间窗口（7 日）下的清理语义：
 *
 *   1. 早于阈值的 `<bankId>-<ts>/` 目录被删除。
 *   2. 晚于（含恰好等于）阈值的目录被保留。
 *   3. 目录名无法解析为时间戳的条目被保留（避免误删手动备份）。
 *   4. `baseUri` 自身不存在时 `purge` 静默返回，不抛错。
 *   5. 顶层文件条目（防御异常状态）不会被当作过期目录删除。
 *
 * 与生产 `Storage` 装配一致，构造 `Trash` 实例时通过构造函数注入 `now`，
 * 使阈值与目录名时间戳完全确定，避免依赖 `Date.now()` 的飘移。
 *
 * **Validates: Requirements 2.9（覆盖导入旧数据隔离）, 11.4（覆盖导入语义）**
 */

import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import type { MemFsHarness } from '../harness/memFsHarness.js';

// `vi.mock` 工厂在 vitest 运行时被提升到文件顶部，普通的顶层 const 在那一刻
// 还没有完成初始化（会触发 "Cannot access 'harness' before initialization"）。
// 解法：用 `vi.hoisted` 让 harness 的构造也被提升；factory 写成 async + 动态
// import 以避开 require 在 TS 源上的解析问题，返回值是 `Promise<...>`，避免在
// 模块顶层使用 `await`（Node16 module 模式下不允许）。
const hoistedHarness = vi.hoisted(async () => {
  const mod = await import('../harness/memFsHarness.js');
  return mod.createMemFsHarness();
});

// `Trash` 在运行时 `import * as vscode from 'vscode'`，因此必须在所有 import
// 之前替换该模块。`vi.mock` 工厂同样被 hoist，但运行顺序晚于 `vi.hoisted`，
// 因此可以安全地 `await hoistedHarness`。
vi.mock('vscode', async () => {
  const mod = await import('../harness/memFsHarness.js');
  const harness = await hoistedHarness;
  return mod.createVscodeModuleMock(harness);
});

// 注：mock 必须先于真实模块的 import；下面这两个 import 才能拿到桩实现。
// eslint-disable-next-line import/first
import { HarnessFileType, HarnessUri } from '../harness/memFsHarness.js';
// eslint-disable-next-line import/first
import { Trash } from '../../src/storage/trash.js';

// 测试体中需要同步访问 harness。`beforeAll` 在所有 it 之前 await 一次拿到
// 同一份实例，赋给本 module 的 `harness` 变量。`!:` 让 TS 信任 beforeAll
// 的 setup 总会执行成功（vitest 在每个 describe 块进入前 await beforeAll）。
let harness!: MemFsHarness;

// 7 日（毫秒）；与 `Storage.bootstrap` 在 Activation 中传给 `purge` 的窗口一致。
const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;

/** 把字节数组写入指定 URI（用于构造非目录条目，验证防御性跳过）。 */
async function writeFileAt(uri: HarnessUri, content: string): Promise<void> {
  await harness.workspaceFs.writeFile(uri, new TextEncoder().encode(content));
}

/** 读出 `baseUri` 下的目录 / 文件名集合（用于断言保留 / 删除）。 */
async function listEntryNames(baseUri: HarnessUri): Promise<string[]> {
  const entries = await harness.workspaceFs.readDirectory(baseUri);
  return entries.map(([name]) => name).sort();
}

describe('Trash.purge (7 days)', () => {
  beforeAll(async () => {
    harness = await hoistedHarness;
  });

  beforeEach(() => {
    harness.reset();
  });

  it('删除早于阈值的目录，保留晚于阈值的目录（基本对照组）', async () => {
    const trashRoot = HarnessUri.joinPath(harness.globalStorageUri, 'trash');
    await harness.workspaceFs.createDirectory(trashRoot);

    // 固定 "当前时间"，避免阈值漂移。所有目录名都基于这个 NOW 构造。
    const NOW = 10_000_000_000; // 远离 epoch 0 / NaN 边界
    const trash = new Trash(trashRoot, () => NOW);

    // bankId 故意选用含连字符的形态（模拟 UUID v4），逼迫 parseTrashTimestamp
    // 必须按 "最后一个 -" 之后的子串提取时间戳；否则会误判为非时间戳。
    const oldBankId = 'bank-aaaa-1111';
    const newBankId = 'bank-bbbb-2222';

    // 早于阈值：NOW - SEVEN_DAYS_MS - 1ms（严格小于 cutoff，应被删除）。
    const oldTs = NOW - SEVEN_DAYS_MS - 1;
    // 晚于阈值：NOW - 1h（远晚于 cutoff，应保留）。
    const newTs = NOW - 60 * 60 * 1000;

    const oldDir = HarnessUri.joinPath(trashRoot, `${oldBankId}-${oldTs}`);
    const newDir = HarnessUri.joinPath(trashRoot, `${newBankId}-${newTs}`);

    // 在每个 trash 子目录内放一个文件，确认整目录被一并清理（recursive delete）。
    await harness.workspaceFs.createDirectory(oldDir);
    await writeFileAt(HarnessUri.joinPath(oldDir, 'bank.json'), '{"old":true}');
    await harness.workspaceFs.createDirectory(newDir);
    await writeFileAt(HarnessUri.joinPath(newDir, 'bank.json'), '{"new":true}');

    await trash.purge({ olderThanMs: SEVEN_DAYS_MS });

    const remaining = await listEntryNames(trashRoot);
    expect(remaining).toEqual([`${newBankId}-${newTs}`]);

    // 进一步确认晚于阈值的目录内文件保持不动。
    const newBankFile = HarnessUri.joinPath(newDir, 'bank.json');
    const stat = await harness.workspaceFs.stat(newBankFile);
    expect(stat.type).toBe(HarnessFileType.File);
  });

  it('恰好等于阈值的目录被保留（cutoff 为开区间，ts < cutoff 才删）', async () => {
    const trashRoot = HarnessUri.joinPath(harness.globalStorageUri, 'trash');
    await harness.workspaceFs.createDirectory(trashRoot);

    const NOW = 5_000_000_000;
    const trash = new Trash(trashRoot, () => NOW);

    const cutoffTs = NOW - SEVEN_DAYS_MS; // 与 purge 的 cutoff 完全相等
    const justBeforeCutoff = cutoffTs - 1;

    const keepDir = HarnessUri.joinPath(trashRoot, `bank-keep-${cutoffTs}`);
    const dropDir = HarnessUri.joinPath(trashRoot, `bank-drop-${justBeforeCutoff}`);

    await harness.workspaceFs.createDirectory(keepDir);
    await harness.workspaceFs.createDirectory(dropDir);

    await trash.purge({ olderThanMs: SEVEN_DAYS_MS });

    const remaining = await listEntryNames(trashRoot);
    expect(remaining).toEqual([`bank-keep-${cutoffTs}`]);
  });

  it('目录名无法解析为时间戳的条目被保留', async () => {
    const trashRoot = HarnessUri.joinPath(harness.globalStorageUri, 'trash');
    await harness.workspaceFs.createDirectory(trashRoot);

    const NOW = 8_000_000_000;
    const trash = new Trash(trashRoot, () => NOW);

    // 不可解析为时间戳：无连字符 / 末段非纯数字 / 末段为空。
    const noDashDir = HarnessUri.joinPath(trashRoot, 'manual_backup');
    const nonNumericTailDir = HarnessUri.joinPath(trashRoot, 'bank-deadbeef-notanumber');
    const trailingDashDir = HarnessUri.joinPath(trashRoot, 'bank-trailing-');

    // 同时放一个绝对老旧、可解析的目录作为对照——证明 purge 仍在工作，
    // 不可解析的目录是被 "解析跳过" 而非 "整体短路" 保留下来的。
    const ancientTs = NOW - SEVEN_DAYS_MS - 10_000;
    const ancientDir = HarnessUri.joinPath(trashRoot, `bank-old-${ancientTs}`);

    await harness.workspaceFs.createDirectory(noDashDir);
    await harness.workspaceFs.createDirectory(nonNumericTailDir);
    await harness.workspaceFs.createDirectory(trailingDashDir);
    await harness.workspaceFs.createDirectory(ancientDir);

    await trash.purge({ olderThanMs: SEVEN_DAYS_MS });

    const remaining = await listEntryNames(trashRoot);
    expect(remaining).toEqual(
      ['bank-deadbeef-notanumber', 'bank-trailing-', 'manual_backup'].sort(),
    );
  });

  it('baseUri 不存在时 purge 静默返回，不抛错', async () => {
    // 故意不创建 trash 根目录，模拟首次启动尚未产出 trash 的情形。
    const trashRoot = HarnessUri.joinPath(harness.globalStorageUri, 'trash');
    const trash = new Trash(trashRoot, () => 1_000_000_000);

    await expect(trash.purge({ olderThanMs: SEVEN_DAYS_MS })).resolves.toBeUndefined();
  });

  it('顶层文件条目被跳过（防御异常状态，purge 不删除文件）', async () => {
    const trashRoot = HarnessUri.joinPath(harness.globalStorageUri, 'trash');
    await harness.workspaceFs.createDirectory(trashRoot);

    const NOW = 9_000_000_000;
    const trash = new Trash(trashRoot, () => NOW);

    // 顶层文件，名字里也带 "ts" 后缀；purge 应仅处理目录类型条目。
    const ancientFakeName = `bank-rogue-${NOW - SEVEN_DAYS_MS - 1}`;
    const rogueFile = HarnessUri.joinPath(trashRoot, ancientFakeName);
    await writeFileAt(rogueFile, 'rogue');

    // 一个真正过期的目录用于证明 purge 仍在工作。
    const ancientDirName = `bank-old-${NOW - SEVEN_DAYS_MS - 2}`;
    const ancientDir = HarnessUri.joinPath(trashRoot, ancientDirName);
    await harness.workspaceFs.createDirectory(ancientDir);

    await trash.purge({ olderThanMs: SEVEN_DAYS_MS });

    const remaining = await listEntryNames(trashRoot);
    expect(remaining).toEqual([ancientFakeName]);

    const stat = await harness.workspaceFs.stat(rogueFile);
    expect(stat.type).toBe(HarnessFileType.File);
  });
});
