/**
 * Integration Test Runner
 *
 * Uses @vscode/test-electron to launch a VS Code instance and run
 * integration tests against the actual extension host.
 *
 * Usage: node scripts/runIntegrationTests.mjs
 *
 * Prerequisites:
 *   - Build the extension first: pnpm build
 *   - @vscode/test-electron must be installed
 */
import { runTests } from '@vscode/test-electron';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

async function main() {
  const extensionDevelopmentPath = path.resolve(__dirname, '..');
  const extensionTestsPath = path.resolve(__dirname, '../out/test/integration/index.js');

  try {
    await runTests({
      extensionDevelopmentPath,
      extensionTestsPath,
    });
  } catch (err) {
    console.error('Failed to run integration tests:', err);
    process.exit(1);
  }
}

main();
