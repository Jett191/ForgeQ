// Minimal entry point stub for the Frontend Interview Practice VS Code extension.
//
// Real activation wiring lives in task 20 (Activation 装配); this stub exists so
// `scripts/build.mjs` has a valid entry to bundle into `dist/extension.js`,
// satisfying the verification for task 1.4.
//
// `vscode` is the host runtime API; we only import its types here to avoid
// pulling the module at bundle time (it is marked external in build.mjs).

import type * as vscode from 'vscode';

export function activate(_context: vscode.ExtensionContext): void {
  // Intentionally empty. Wiring is added in later tasks.
}

export function deactivate(): void {
  // Intentionally empty. Wiring is added in later tasks.
}
