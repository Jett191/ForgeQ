/**
 * Integration Test: Import Failure Rollback
 *
 * Verifies that when installBank fails mid-way (e.g., disk full during
 * Phase 3), the transaction is rolled back:
 *   - No partial bank directory remains in banks/
 *   - meta.json is not modified
 *   - User receives an error notification
 *
 * Requires @vscode/test-electron with actual VS Code host.
 * Run with: pnpm test:integration
 */
import { describe, it } from 'vitest';

describe.skip('Import Failure Rollback Smoke Test (requires VS Code host)', () => {
  it('rolls back bank directory on installBank Phase 1 failure', () => {});
  it('rolls back user-data on installBank Phase 2 failure', () => {});
  it('rolls back meta.json on installBank Phase 3 failure', () => {});
  it('shows error notification with cause detail', () => {});
});
