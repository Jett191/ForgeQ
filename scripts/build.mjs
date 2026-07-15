#!/usr/bin/env node
// Build script for the Frontend Interview Practice VS Code extension.
//
// Bundles two entry points with esbuild:
//   1. src/extension.ts          -> dist/extension.js   (Node / VS Code host)
//   2. src/practice/webview/main.ts -> dist/webview/main.js (browser, runs in Webview)
//
// Both entries are tolerant of missing source files at this stage of the
// project (they will be added by later tasks). When an entry is missing the
// build emits a noop notice and skips that entry instead of failing.
//
// Usage:
//   node scripts/build.mjs              # one-shot dev build (no minify)
//   node scripts/build.mjs --watch      # rebuild on changes
//   node scripts/build.mjs --production # minified production build
//   NODE_ENV=production node scripts/build.mjs

import { existsSync } from 'node:fs';
import { cp, mkdir, readFile, writeFile, watch as fsWatch } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import process from 'node:process';
import { spawn } from 'node:child_process';
import esbuild from 'esbuild';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..');

const args = new Set(process.argv.slice(2));
const watch = args.has('--watch');
const production =
  args.has('--production') || process.env.NODE_ENV === 'production';
const minify = production;
const sourcemap = production ? 'linked' : 'inline';

const entries = [
  {
    name: 'extension',
    entry: path.join(projectRoot, 'src', 'extension.ts'),
    outfile: path.join(projectRoot, 'dist', 'extension.js'),
    options: {
      platform: 'node',
      format: 'cjs',
      target: 'node18',
      external: ['vscode'],
      mainFields: ['module', 'main'],
      conditions: ['node'],
    },
  },
  {
    name: 'webview',
    entry: path.join(projectRoot, 'src', 'practice', 'webview', 'main.ts'),
    outfile: path.join(projectRoot, 'dist', 'webview', 'main.js'),
    options: {
      platform: 'browser',
      format: 'iife',
      target: 'es2020',
      external: [],
    },
  },
];

/** @returns {esbuild.BuildOptions} */
function buildOptionsFor(spec) {
  return {
    entryPoints: [spec.entry],
    outfile: spec.outfile,
    bundle: true,
    sourcemap,
    minify,
    logLevel: 'info',
    define: {
      'process.env.NODE_ENV': JSON.stringify(
        production ? 'production' : 'development'
      ),
    },
    ...spec.options,
  };
}

async function ensureDir(file) {
  await mkdir(path.dirname(file), { recursive: true });
}

/**
 * Regenerate `schemas/question-bank.schema.json` from `src/parser/schema.ts`.
 *
 * Runs as a child process so the bundler step stays decoupled from the
 * schema generator's runtime dependencies. Skipped silently when the schema
 * source is missing (it lands in task 3.1 and may not exist on early
 * branches).
 */
async function generateSchema() {
  const schemaSource = path.join(projectRoot, 'src', 'parser', 'schema.ts');
  if (!existsSync(schemaSource)) {
    console.log(
      '[build] skip schema generation: src/parser/schema.ts not found yet'
    );
    return;
  }
  const script = path.join(__dirname, 'generateSchema.mjs');
  await new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [script], {
      cwd: projectRoot,
      stdio: 'inherit',
    });
    child.once('error', reject);
    child.once('exit', (code) => {
      if (code === 0) resolve();
      else reject(new Error(`generateSchema exited with code ${code}`));
    });
  });
}

/**
 * Copy webview static assets that esbuild does not bundle (CSS / images / etc.)
 * from `src/practice/webview/` to `dist/webview/`.
 *
 * panel.ts uses `webview.asWebviewUri(... 'dist/webview/styles.css')`, and the
 * webview's `localResourceRoots` only whitelists `dist/webview/`, so anything
 * referenced by the rendered HTML must live there. The app stylesheet is
 * combined with KaTeX CSS, and KaTeX web fonts are copied beside it so the
 * webview stays fully local and works under the CSP.
 */
async function copyWebviewAssets() {
  const srcDir = path.join(projectRoot, 'src', 'practice', 'webview');
  const outDir = path.join(projectRoot, 'dist', 'webview');
  await mkdir(outDir, { recursive: true });

  const appCssPath = path.join(srcDir, 'styles.css');
  const katexDist = path.join(projectRoot, 'node_modules', 'katex', 'dist');
  const katexCssPath = path.join(katexDist, 'katex.min.css');
  const cssParts = [];
  if (existsSync(katexCssPath)) cssParts.push(await readFile(katexCssPath, 'utf8'));
  if (existsSync(appCssPath)) cssParts.push(await readFile(appCssPath, 'utf8'));
  if (cssParts.length > 0) {
    const cssOutput = path.join(outDir, 'styles.css');
    await writeFile(cssOutput, cssParts.join('\n'), 'utf8');
    console.log('[build] assembled webview styles (KaTeX + app CSS)');
  }

  const katexFonts = path.join(katexDist, 'fonts');
  if (existsSync(katexFonts)) {
    await cp(katexFonts, path.join(outDir, 'fonts'), { recursive: true, force: true });
    console.log('[build] copied KaTeX web fonts');
  }
}

async function runOnce() {
  await generateSchema();
  await copyWebviewAssets();
  const results = [];
  for (const spec of entries) {
    if (!existsSync(spec.entry)) {
      console.log(
        `[build] skip ${spec.name}: entry not found at ${path.relative(
          projectRoot,
          spec.entry
        )} (will be added in a later task)`
      );
      continue;
    }
    await ensureDir(spec.outfile);
    console.log(
      `[build] bundling ${spec.name}: ${path.relative(
        projectRoot,
        spec.entry
      )} -> ${path.relative(projectRoot, spec.outfile)}`
    );
    results.push(esbuild.build(buildOptionsFor(spec)));
  }
  if (results.length === 0) {
    console.log(
      '[build] no entries bundled — both extension and webview sources are missing.'
    );
    return;
  }
  await Promise.all(results);
  console.log(
    `[build] done (${production ? 'production' : 'development'}, ${
      minify ? 'minified' : 'unminified'
    })`
  );
}

async function runWatch() {
  await generateSchema();
  await copyWebviewAssets();
  // Watch styles.css alongside esbuild watchers so theme/styling tweaks
  // hot-reload without re-running `npm run build`.
  const cssSrc = path.join(
    projectRoot,
    'src',
    'practice',
    'webview',
    'styles.css',
  );
  if (existsSync(cssSrc)) {
    void (async () => {
      try {
        for await (const _ of fsWatch(cssSrc)) {
          await copyWebviewAssets();
        }
      } catch {
        /* ignore: watcher errors are non-fatal in dev */
      }
    })();
  }
  /** @type {esbuild.BuildContext[]} */
  const contexts = [];
  for (const spec of entries) {
    if (!existsSync(spec.entry)) {
      console.log(
        `[watch] skip ${spec.name}: entry not found at ${path.relative(
          projectRoot,
          spec.entry
        )} (will be added in a later task)`
      );
      continue;
    }
    await ensureDir(spec.outfile);
    const ctx = await esbuild.context(buildOptionsFor(spec));
    contexts.push(ctx);
    await ctx.watch();
    console.log(
      `[watch] watching ${spec.name}: ${path.relative(
        projectRoot,
        spec.entry
      )}`
    );
  }
  if (contexts.length === 0) {
    console.log(
      '[watch] no entries to watch — both extension and webview sources are missing. Re-run after adding sources.'
    );
    return;
  }

  const dispose = async () => {
    for (const ctx of contexts) {
      try {
        await ctx.dispose();
      } catch {
        /* ignore */
      }
    }
    process.exit(0);
  };
  process.on('SIGINT', dispose);
  process.on('SIGTERM', dispose);
}

try {
  if (watch) {
    await runWatch();
  } else {
    await runOnce();
  }
} catch (err) {
  console.error('[build] failed:', err);
  process.exit(1);
}
