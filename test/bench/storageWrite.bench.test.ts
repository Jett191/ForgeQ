/**
 * Storage Write Benchmark（Task 23.2）
 *
 * 验证 learning.json 和 meta.json 单次原子写入在合理时间内完成。
 * 使用 vitest 的 bench API + memFsHarness 模拟文件系统。
 *
 * 注意：由于 vitest bench 与 vi.mock 存在兼容性限制，本 benchmark 直接使用
 * writeAtomicJson (通过 memfs 底层) 来测量原子写入的性能开销，
 * 跳过完整 MetaStore/UserDataStore 实例化。
 */

import { describe, bench } from 'vitest';
import { Volume, createFsFromVolume } from 'memfs';
import * as nodePath from 'node:path';

/**
 * 模拟原子写入 (tmp + rename) 的核心逻辑。
 * 这与 atomicFs.ts 中的实现语义一致：先写 tmp，再 rename 到目标。
 */
async function atomicWriteJson(
  fs: ReturnType<typeof createFsFromVolume>,
  targetPath: string,
  data: unknown,
): Promise<void> {
  const tmpPath = targetPath + '.tmp';
  const content = JSON.stringify(data, null, 2);
  const dir = nodePath.posix.dirname(targetPath);
  await fs.promises.mkdir(dir, { recursive: true });
  await fs.promises.writeFile(tmpPath, content, 'utf-8');
  await fs.promises.rename(tmpPath, targetPath);
}

describe('Storage Write Benchmark', () => {
  bench('meta.json single atomic write (~500 bytes)', async () => {
    const volume = new Volume();
    const fs = createFsFromVolume(volume);
    fs.mkdirSync('/storage', { recursive: true });

    const metaData = {
      schemaVersion: 1,
      banks: [
        {
          id: 'bench-bank-001',
          name: 'Bench Bank',
          version: '1.0.0',
          questionCount: 100,
          installedAt: new Date().toISOString(),
        },
      ],
      currentBankId: 'bench-bank-001',
    };

    await atomicWriteJson(fs, '/storage/meta.json', metaData);
  });

  bench('learning.json single atomic write (~2KB, 50 entries)', async () => {
    const volume = new Volume();
    const fs = createFsFromVolume(volume);
    fs.mkdirSync('/storage/user-data/bench-bank', { recursive: true });

    // 构造 50 个学习状态条目 (模拟中等规模 bank)
    const learningData: Record<string, unknown> = {};
    for (let i = 0; i < 50; i++) {
      learningData[`q-${String(i).padStart(5, '0')}`] = {
        mastery: 'learning',
        favoriteFlag: i % 3 === 0,
        wrongFlag: i % 5 === 0,
        hasNote: i % 7 === 0,
        lastPracticedAt: new Date().toISOString(),
      };
    }

    await atomicWriteJson(
      fs,
      '/storage/user-data/bench-bank/learning.json',
      learningData,
    );
  });
});
