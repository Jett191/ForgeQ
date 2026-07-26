import { beforeEach, describe, expect, it, vi } from 'vitest';

const values = vi.hoisted(() => new Map<string, unknown>());

vi.mock('vscode', () => ({
  workspace: {
    getConfiguration: () => ({
      get: (key: string, fallback?: unknown) => values.has(key) ? values.get(key) : fallback,
    }),
  },
}));

import {
  DEFAULT_FORGEQ_SETTINGS,
  readForgeQSettings,
} from '../../src/config/settings.js';

describe('ForgeQ settings', () => {
  beforeEach(() => values.clear());

  it('未配置时返回完整默认设置', () => {
    expect(readForgeQSettings()).toEqual(DEFAULT_FORGEQ_SETTINGS);
  });

  it('读取用户选择并约束数值范围', () => {
    values.set('practice.defaultProjectFile', 'typescript');
    values.set('practice.noteOpenMode', 'preview');
    values.set('display.showCodeDetails', false);
    values.set('review.shuffle', true);
    values.set('review.maxQuestions', 99_999);
    values.set('data.trashRetentionDays', -5);

    const settings = readForgeQSettings();
    expect(settings.practice.defaultProjectFile).toBe('typescript');
    expect(settings.practice.noteOpenMode).toBe('preview');
    expect(settings.display.showCodeDetails).toBe(false);
    expect(settings.review).toEqual({ shuffle: true, maxQuestions: 10_000 });
    expect(settings.data.trashRetentionDays).toBe(1);
  });
});
