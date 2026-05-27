/**
 * Integration Test: Import Question Bank
 *
 * Verifies the full import flow:
 *   1. User picks a JSON file via file dialog
 *   2. Parser validates the bank
 *   3. Storage.installBank persists to globalStorage
 *   4. TreeView refreshes with new questions
 *
 * Requires @vscode/test-electron with actual VS Code host.
 * Run with: pnpm test:integration
 */
import { describe, it } from 'vitest';

describe.skip('Import Smoke Test (requires VS Code host)', () => {
  it('imports a valid question bank file successfully', () => {});
  it('shows error notification on invalid JSON', () => {});
  it('shows error notification on schema violation', () => {});
  it('refreshes TreeView after successful import', () => {});
});
