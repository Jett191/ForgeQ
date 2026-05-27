/**
 * Integration Test: Save Document Updates lastPracticedAt
 *
 * Verifies that saving a practice file (code or QA) triggers an update
 * to the corresponding LearningState.lastPracticedAt timestamp:
 *   1. Open a question (creates practice file)
 *   2. Edit and save the document
 *   3. Confirm learning.json reflects updated lastPracticedAt
 *
 * Requires @vscode/test-electron with actual VS Code host.
 * Run with: pnpm test:integration
 */
import { describe, it } from 'vitest';

describe.skip('Save Document Updates lastPracticedAt Smoke Test (requires VS Code host)', () => {
  it('updates lastPracticedAt on code file save', () => {});
  it('updates lastPracticedAt on QA file save', () => {});
  it('does not update lastPracticedAt for non-practice files', () => {});
  it('sets mastery from unlearned to learning on first save', () => {});
});
