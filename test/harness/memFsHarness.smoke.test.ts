/**
 * memFsHarness smoke test (Task 1.3 verification)
 *
 * 验证：
 *   1. vitest 配置可加载并执行 `test/**` 下的 *.test.ts；
 *   2. `setup.ts` 已生效（`process.env.TZ === 'UTC'`）；
 *   3. memFsHarness 提供的 `vscode.workspace.fs` 桩能完成读 / 写 / rename / stat /
 *      readDirectory / delete 一整套关键操作；
 *   4. `globalState` 桩能 get / update / 列 keys；
 *   5. 失败注入按预期触发受控错误。
 *
 * 这是 Task 1.3 的 fixture 自检，不属于业务模块测试。
 */

import { describe, expect, it } from 'vitest';
import {
  HarnessFileSystemError,
  HarnessFileType,
  HarnessUri,
  createMemFsHarness,
  createVscodeModuleMock,
} from './memFsHarness';

describe('memFsHarness', () => {
  it('setup.ts locks TZ to UTC', () => {
    expect(process.env.TZ).toBe('UTC');
  });

  it('exposes a working vscode.workspace.fs stub via memfs', async () => {
    const harness = createMemFsHarness();
    const root = harness.globalStorageUri;

    const fileUri = HarnessUri.joinPath(root, 'meta.json');
    await harness.workspaceFs.writeFile(fileUri, new TextEncoder().encode('{"v":1}'));

    const bytes = await harness.workspaceFs.readFile(fileUri);
    expect(new TextDecoder().decode(bytes)).toBe('{"v":1}');

    const stat = await harness.workspaceFs.stat(fileUri);
    expect(stat.type).toBe(HarnessFileType.File);

    const tmpUri = HarnessUri.joinPath(root, 'meta.json.tmp');
    await harness.workspaceFs.writeFile(tmpUri, new TextEncoder().encode('{"v":2}'));
    await harness.workspaceFs.rename(tmpUri, fileUri, { overwrite: true });

    const after = await harness.workspaceFs.readFile(fileUri);
    expect(new TextDecoder().decode(after)).toBe('{"v":2}');

    const entries = await harness.workspaceFs.readDirectory(root);
    const names = entries.map(([name]) => name).sort();
    expect(names).toEqual(['meta.json']);

    await harness.workspaceFs.delete(fileUri);
    await expect(harness.workspaceFs.stat(fileUri)).rejects.toBeInstanceOf(
      HarnessFileSystemError,
    );
  });

  it('provides a globalState stub that supports get/update/keys', async () => {
    const harness = createMemFsHarness();
    expect(harness.globalState.get('fip:currentBankId')).toBeUndefined();
    expect(harness.globalState.get<string>('fip:currentBankId', 'default')).toBe('default');

    await harness.globalState.update('fip:currentBankId', 'bank-1');
    expect(harness.globalState.get<string>('fip:currentBankId')).toBe('bank-1');
    expect(harness.globalState.keys()).toContain('fip:currentBankId');

    await harness.globalState.update('fip:currentBankId', undefined);
    expect(harness.globalState.get('fip:currentBankId')).toBeUndefined();
    expect(harness.globalState.keys()).not.toContain('fip:currentBankId');
  });

  it('honors injected failures exactly once', async () => {
    const harness = createMemFsHarness();
    const target = HarnessUri.joinPath(harness.globalStorageUri, 'fail.json');

    harness.failNext({ op: 'writeFile', pathPattern: /fail\.json$/ });
    await expect(
      harness.workspaceFs.writeFile(target, new TextEncoder().encode('x')),
    ).rejects.toBeInstanceOf(HarnessFileSystemError);

    // 第二次写入应当成功（失败规则默认 once: true）
    await harness.workspaceFs.writeFile(target, new TextEncoder().encode('x'));
    const text = new TextDecoder().decode(await harness.workspaceFs.readFile(target));
    expect(text).toBe('x');
  });

  it('createVscodeModuleMock exposes expected vscode shape', () => {
    const harness = createMemFsHarness();
    const mod = createVscodeModuleMock(harness);
    expect(mod.Uri).toBe(HarnessUri);
    expect(mod.FileType).toBe(HarnessFileType);
    expect(mod.workspace.fs).toBe(harness.workspaceFs);
    expect(typeof mod.window.showErrorMessage).toBe('function');
  });
});
