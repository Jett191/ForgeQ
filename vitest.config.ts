import { defineConfig } from 'vitest/config';

// Vitest 配置（Task 1.3）
//
// - `test.include` 仅收录 `test/**` 与 `src/**` 下的 `*.test.ts`，并显式排除
//   `test/bench/**`（基准测试由 `vitest bench` 命令独立运行）与 `test/integration/**`
//   （集成测试由 `@vscode/test-electron` 通过 `scripts/runIntegrationTests.mjs` 启动）。
// - `benchmark.include` 限定到 `test/bench` 下的 `*.bench.test.ts` 与 `*.bench.ts`
//   两种命名，覆盖任务 23.1 / 23.2 的输出位置（`test/bench/parser.bench.test.ts` 等）。
// - `watch: false` 让默认行为等价于命令行 `--run` 单次执行模式；package.json
//   的脚本同时显式传入 `vitest run` / `vitest bench --run` 以保证 CI 环境无 TTY 时不进入
//   watch。
//
// 注：本配置使用行注释而不是 JSDoc 块注释，避免 glob 字符串中的 `*` 后跟 `/` 在被
// esbuild 预处理时被识别为块注释结束符。
export default defineConfig({
  test: {
    globals: false,
    environment: 'node',
    watch: false,
    include: [
      'test/**/*.test.ts',
      'src/**/*.test.ts',
    ],
    exclude: [
      'node_modules/**',
      'dist/**',
      'out/**',
      'out-test/**',
      'test/bench/**',
      'test/integration/**',
    ],
    setupFiles: ['./test/setup.ts'],
    reporters: ['default'],
    typecheck: {
      tsconfig: './tsconfig.test.json',
    },
    benchmark: {
      include: [
        'test/bench/**/*.bench.test.ts',
        'test/bench/**/*.bench.ts',
      ],
      exclude: [
        'node_modules/**',
        'dist/**',
        'out/**',
      ],
      reporters: ['default'],
    },
  },
});
