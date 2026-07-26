import * as vscode from 'vscode';

export type DefaultProjectFile =
  | 'ask'
  | 'auto'
  | 'javascript'
  | 'jsx'
  | 'typescript'
  | 'tsx'
  | 'java'
  | 'go'
  | 'c'
  | 'python'
  | 'markdown';

export type NoteOpenMode = 'editor' | 'preview';

/** User-facing ForgeQ preferences, read from VS Code configuration. */
export interface ForgeQSettings {
  practice: {
    autoMarkLearningOnEdit: boolean;
    openAnswerFileOnQuestionOpen: boolean;
    prefillFromQuestionTemplate: boolean;
    defaultProjectFile: DefaultProjectFile;
    revealAnswerOnOpen: boolean;
    noteOpenMode: NoteOpenMode;
  };
  display: {
    showKeywords: boolean;
    showCodeDetails: boolean;
    groupByCategory: boolean;
  };
  review: {
    shuffle: boolean;
    maxQuestions: number;
  };
  copy: {
    includeReferenceAnswer: boolean;
    includeRawQuestionJson: boolean;
  };
  data: {
    trashRetentionDays: number;
  };
}

export const DEFAULT_FORGEQ_SETTINGS: Readonly<ForgeQSettings> = Object.freeze({
  practice: Object.freeze({
    autoMarkLearningOnEdit: true,
    openAnswerFileOnQuestionOpen: true,
    prefillFromQuestionTemplate: true,
    defaultProjectFile: 'ask',
    revealAnswerOnOpen: false,
    noteOpenMode: 'editor',
  }),
  display: Object.freeze({
    showKeywords: true,
    showCodeDetails: true,
    groupByCategory: true,
  }),
  review: Object.freeze({
    shuffle: false,
    maxQuestions: 0,
  }),
  copy: Object.freeze({
    includeReferenceAnswer: true,
    includeRawQuestionJson: true,
  }),
  data: Object.freeze({
    trashRetentionDays: 7,
  }),
});

function integerInRange(value: number | undefined, fallback: number, min: number, max: number): number {
  if (value === undefined || !Number.isFinite(value)) return fallback;
  return Math.min(max, Math.max(min, Math.trunc(value)));
}

/** Read a fresh settings snapshot so configuration changes do not require extension reload. */
export function readForgeQSettings(): ForgeQSettings {
  const config = vscode.workspace.getConfiguration('forgeq');
  return {
    practice: {
      autoMarkLearningOnEdit: config.get(
        'practice.autoMarkLearningOnEdit',
        DEFAULT_FORGEQ_SETTINGS.practice.autoMarkLearningOnEdit,
      ),
      openAnswerFileOnQuestionOpen: config.get(
        'practice.openAnswerFileOnQuestionOpen',
        DEFAULT_FORGEQ_SETTINGS.practice.openAnswerFileOnQuestionOpen,
      ),
      prefillFromQuestionTemplate: config.get(
        'practice.prefillFromQuestionTemplate',
        DEFAULT_FORGEQ_SETTINGS.practice.prefillFromQuestionTemplate,
      ),
      defaultProjectFile: config.get(
        'practice.defaultProjectFile',
        DEFAULT_FORGEQ_SETTINGS.practice.defaultProjectFile,
      ),
      revealAnswerOnOpen: config.get(
        'practice.revealAnswerOnOpen',
        DEFAULT_FORGEQ_SETTINGS.practice.revealAnswerOnOpen,
      ),
      noteOpenMode: config.get(
        'practice.noteOpenMode',
        DEFAULT_FORGEQ_SETTINGS.practice.noteOpenMode,
      ),
    },
    display: {
      showKeywords: config.get(
        'display.showKeywords',
        DEFAULT_FORGEQ_SETTINGS.display.showKeywords,
      ),
      showCodeDetails: config.get(
        'display.showCodeDetails',
        DEFAULT_FORGEQ_SETTINGS.display.showCodeDetails,
      ),
      groupByCategory: config.get(
        'display.groupByCategory',
        DEFAULT_FORGEQ_SETTINGS.display.groupByCategory,
      ),
    },
    review: {
      shuffle: config.get('review.shuffle', DEFAULT_FORGEQ_SETTINGS.review.shuffle),
      maxQuestions: integerInRange(
        config.get<number>('review.maxQuestions'),
        DEFAULT_FORGEQ_SETTINGS.review.maxQuestions,
        0,
        10_000,
      ),
    },
    copy: {
      includeReferenceAnswer: config.get(
        'copy.includeReferenceAnswer',
        DEFAULT_FORGEQ_SETTINGS.copy.includeReferenceAnswer,
      ),
      includeRawQuestionJson: config.get(
        'copy.includeRawQuestionJson',
        DEFAULT_FORGEQ_SETTINGS.copy.includeRawQuestionJson,
      ),
    },
    data: {
      trashRetentionDays: integerInRange(
        config.get<number>('data.trashRetentionDays'),
        DEFAULT_FORGEQ_SETTINGS.data.trashRetentionDays,
        1,
        365,
      ),
    },
  };
}
