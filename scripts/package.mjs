#!/usr/bin/env node
// Package script for the Frontend Interview Practice VS Code extension.
//
// 1. Runs a production build via scripts/build.mjs.
// 2. Invokes `npx @vscode/vsce package --no-dependencies` to produce a .vsix.
//
// Usage:
//   node scripts/package.mjs
//
// Notes:
// - `--no-dependencies` is intentional: the extension is fully bundled into
//   `dist/` by esbuild, so node_modules does not need to ship inside the .vsix.
// - Any extra CLI args are forwarded to `vsce package`, e.g.:
//     node scripts/package.mjs --pre-release

import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import process from 'node:process';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..');

/**
 * @param {string} command
 * @param {string[]} args
 * @param {{ env?: NodeJS.ProcessEnv }} [opts]
 * @returns {Promise<void>}
 */
function run(command, args, opts = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: projectRoot,
      stdio: 'inherit',
      shell: process.platform === 'win32',
      env: { ...process.env, ...opts.env },
    });
    child.on('error', reject);
    child.on('exit', (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(
          new Error(
            `${command} ${args.join(' ')} exited with code ${code ?? 'null'}`
          )
        );
      }
    });
  });
}

async function main() {
  const extraArgs = process.argv.slice(2);

  console.log('[package] running production build');
  await run(process.execPath, [path.join(__dirname, 'build.mjs'), '--production']);

  console.log('[package] invoking @vscode/vsce package');
  await run('npx', [
    '--yes',
    '@vscode/vsce',
    'package',
    '--no-dependencies',
    ...extraArgs,
  ]);

  console.log('[package] done');
}

main().catch((err) => {
  console.error('[package] failed:', err);
  process.exit(1);
});
