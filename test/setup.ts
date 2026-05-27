/**
 * 全局测试 Setup（Task 1.3）
 *
 * 由 `vitest.config.ts` 通过 `setupFiles` 在每个测试文件运行前加载一次。
 * 这里只做与具体被测模块解耦的全局准备：
 *
 * - 锁定时区为 UTC，避免依赖 `Date` / `toLocaleString` 的断言在不同机器上漂移。
 * - 让 `process.env.TZ` 在测试范围内确定，仅当用户没有显式指定时覆盖。
 *
 * 各模块所需的 mock（如 `vscode` 模块、`memfs` 文件系统）由
 * `test/harness/memFsHarness.ts` 提供，按测试文件按需通过
 * `vi.mock('vscode', () => createVscodeModuleMock(harness))` 注入。
 */

if (!process.env.TZ) {
  process.env.TZ = 'UTC';
}
