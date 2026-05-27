#!/usr/bin/env node
// Generates `schemas/question-bank.schema.json` from the canonical TypeScript
// source `src/parser/schema.ts`.
//
// `schema.ts` is the single source of truth for the Question_Bank_Schema:
//   - The Parser feeds it directly to Ajv at runtime.
//   - The JSON file written by this script lets external tooling (IDE
//     editors, CI validators, or human bank authors) check question banks
//     offline without needing to compile TypeScript.
//
// Approach: bundle `schema.ts` with esbuild into a tiny CommonJS module in
// memory, evaluate it, and serialise the exported `questionBankSchema`
// constant with stable two-space indentation. Bundling avoids a separate
// `tsc` step and keeps the script free of runtime TypeScript dependencies.
//
// Usage:
//   node scripts/generateSchema.mjs              # write schemas/question-bank.schema.json
//   node scripts/generateSchema.mjs --check      # exit non-zero if regen would change the file

import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import process from 'node:process';
import vm from 'node:vm';
import esbuild from 'esbuild';

const requireFromHere = createRequire(import.meta.url);

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..');

const sourceFile = path.join(projectRoot, 'src', 'parser', 'schema.ts');
const outputFile = path.join(
  projectRoot,
  'schemas',
  'question-bank.schema.json'
);

const args = new Set(process.argv.slice(2));
const checkMode = args.has('--check');

if (!existsSync(sourceFile)) {
  console.error(
    `[generate-schema] source file not found: ${path.relative(
      projectRoot,
      sourceFile
    )}`
  );
  process.exit(1);
}

const buildResult = await esbuild.build({
  entryPoints: [sourceFile],
  bundle: true,
  write: false,
  format: 'cjs',
  platform: 'node',
  target: 'node18',
  logLevel: 'silent',
});

const [output] = buildResult.outputFiles;
if (!output) {
  console.error('[generate-schema] esbuild produced no output');
  process.exit(1);
}

const moduleExports = {};
const sandbox = {
  module: { exports: moduleExports },
  exports: moduleExports,
  require: requireFromHere,
  console,
};
vm.createContext(sandbox);
vm.runInContext(output.text, sandbox, { filename: sourceFile });

const schema =
  sandbox.module.exports.questionBankSchema ??
  sandbox.exports.questionBankSchema;

if (!schema || typeof schema !== 'object') {
  console.error(
    '[generate-schema] schema.ts must export a `questionBankSchema` object'
  );
  process.exit(1);
}

const serialised = `${JSON.stringify(schema, null, 2)}\n`;

if (checkMode) {
  if (!existsSync(outputFile)) {
    console.error(
      `[generate-schema] check failed: ${path.relative(
        projectRoot,
        outputFile
      )} is missing — run \`node scripts/generateSchema.mjs\` to regenerate`
    );
    process.exit(1);
  }
  const existing = await readFile(outputFile, 'utf8');
  if (existing !== serialised) {
    console.error(
      `[generate-schema] check failed: ${path.relative(
        projectRoot,
        outputFile
      )} is stale — run \`node scripts/generateSchema.mjs\` to regenerate`
    );
    process.exit(1);
  }
  console.log(
    `[generate-schema] check ok: ${path.relative(projectRoot, outputFile)} is up to date`
  );
} else {
  await mkdir(path.dirname(outputFile), { recursive: true });
  await writeFile(outputFile, serialised, 'utf8');
  console.log(
    `[generate-schema] wrote ${path.relative(projectRoot, outputFile)}`
  );
}
