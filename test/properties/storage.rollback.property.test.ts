// Feature: frontend-interview-practice, Property 10: 写入失败回滚不变量（统一）
//
// 验证 Storage.writeWithRollback：注入 vscode.workspace.fs 操作失败后，
// 内存状态回滚到 prev、showErrorMessage 被调用、磁盘保持不变。
//
// numRuns: 100

import { describe, expect, it, vi } from 'vitest';

const { harness, mockShowErrorMessage } = vi.hoisted(() => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const mod = require('../harness/memFsHarness.ts') as typeof import('../harness/memFsHarness.js');
  const h = mod.createMemFsHarness();
  const mockFn = vi.fn<(...args: unknown[]) => Promise<undefined>>(async () => undefined);
  return { harness: h, mockShowErrorMessage: mockFn };
});

vi.mock('vscode', async () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const mod = require('../harness/memFsHarness.ts') as typeof import('../harness/memFsHarness.js');
  const mock = mod.createVscodeModuleMock(harness);
  return {
    ...mock,
    window: {
      ...mock.window,
      showErrorMessage: mockShowErrorMessage,
    },
  };
});

// eslint-disable-next-line import/first
import * as fc from 'fast-check';
// eslint-disable-next-line import/first
import { HarnessUri } from '../harness/memFsHarness.js';
// eslint-disable-next-line import/first
import { Storage } from '../../src/storage/storage.js';
// eslint-disable-next-line import/first
import { writeAtomicJson } from '../../src/storage/atomicFs.js';
// eslint-disable-next-line import/first
import { arbLearningState } from '../generators.js';
// eslint-disable-next-line import/first
import type { LearningState } from '../../src/types/learning.js';

const NUM_RUNS = 100;

const ID_ALPHABET = 'abcdefghijklmnopqrstuvwxyz0123456789-_'.split('');

const arbBankId: fc.Arbitrary<string> = fc.string({
  minLength: 1,
  maxLength: 20,
  unit: fc.constantFrom(...ID_ALPHABET),
});

const arbQid: fc.Arbitrary<string> = fc.string({
  minLength: 1,
  maxLength: 20,
  unit: fc.constantFrom(...ID_ALPHABET),
});

describe('Property 10: 写入失败回滚不变量（统一）', () => {
  it('writeWithRollback: persist failure rolls back memory, shows error, disk unchanged', async () => {
    await fc.assert(
      fc.asyncProperty(
        arbBankId,
        arbQid,
        arbLearningState,
        arbLearningState,
        async (bankId, qid, prevState, nextState) => {
          harness.reset();
          mockShowErrorMessage.mockClear();

          const ctx = harness.createExtensionContext();
          const storage = await Storage.create(ctx as any);

          // Write prev state to disk using the low-level atomic write directly
          const fileUri = HarnessUri.joinPath(
            harness.globalStorageUri,
            'user-data',
            bankId,
            `${qid}.json`,
          );
          await writeAtomicJson(fileUri, prevState);

          // Read back to confirm it was written
          const bytesBeforePersist = await harness.workspaceFs.readFile(fileUri);
          const diskBefore = JSON.parse(new TextDecoder().decode(bytesBeforePersist));

          // Track the "memory" variable
          let memoryValue: LearningState = prevState;

          // Inject a failure for the next writeFile operation
          harness.failNext({ op: 'writeFile', once: true });

          const result = await storage.writeWithRollback<LearningState>({
            prev: prevState,
            next: nextState,
            applyMemory: (v) => { memoryValue = v; },
            persist: async () => {
              // Use low-level write that will fail due to injected failure
              await writeAtomicJson(fileUri, nextState);
            },
            onRollback: (v) => { memoryValue = v; },
            path: `user-data/${bankId}/${qid}.json`,
          });

          // Assertions:
          // 1. Result is error
          expect(result.ok).toBe(false);
          if (!result.ok) {
            expect(result.error.code).toBe('STORAGE_WRITE_FAILED');
          }

          // 2. Memory was rolled back to prev
          expect(memoryValue).toEqual(prevState);

          // 3. showErrorMessage was called
          expect(mockShowErrorMessage).toHaveBeenCalled();

          // 4. Disk unchanged
          const bytesAfter = await harness.workspaceFs.readFile(fileUri);
          const diskAfter = JSON.parse(new TextDecoder().decode(bytesAfter));
          expect(diskAfter).toEqual(diskBefore);
        },
      ),
      { numRuns: NUM_RUNS },
    );
  });
});
