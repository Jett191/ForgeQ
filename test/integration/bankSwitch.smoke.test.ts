/**
 * Integration Test: Bank Switch
 *
 * Verifies that switching banks:
 *   1. Updates meta.json currentBankId
 *   2. Syncs globalState['fip:currentBankId']
 *   3. Refreshes both TreeViews with the new bank's questions
 *   4. Preserves learning state of the previous bank
 *
 * Requires @vscode/test-electron with actual VS Code host.
 * Run with: pnpm test:integration
 */
import { describe, it } from 'vitest';

describe.skip('Bank Switch Smoke Test (requires VS Code host)', () => {
  it('switches to a different installed bank', () => {});
  it('updates meta.json currentBankId', () => {});
  it('refreshes QuestionList TreeView', () => {});
  it('refreshes Review TreeView', () => {});
  it('preserves learning state of previous bank', () => {});
});
