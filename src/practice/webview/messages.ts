/**
 * Webview 消息协议类型定义（Task 19）。
 *
 * Host（Extension）与 Webview 之间的双向消息类型。
 *
 * Validates: Requirements 5.1, 5.5, 6.1, 6.6, 7.1, 8.1, 9.1
 */

import type { LearningState } from '../../types/learning.js';
import type { MasteryStatus, Question } from '../../types/question.js';
import type { CodeAnswer, QAAnswer } from '../practiceFiles.js';

/**
 * Host -> Webview 方向的消息联合。
 */
export type HostToWebviewMessage =
  | {
      type: 'init';
      payload: {
        bankId: string;
        question: Question;
        learning: LearningState;
        codeFileUri?: string;
        qaFileUri?: string;
        noteFileUri: string;
      };
    }
  | { type: 'showAnswer'; payload: AnswerPayload }
  | { type: 'rollback'; payload: Partial<LearningState> }
  | { type: 'refreshLearning'; payload: LearningState }
  | { type: 'masteryAck'; ok: boolean; reason?: string }
  | { type: 'favoriteAck'; ok: boolean; reason?: string };

/**
 * "查看答案" 的 payload，区分代码题与问答题。
 */
export type AnswerPayload =
  | { questionType: 'code'; answer: CodeAnswer }
  | { questionType: 'qa'; answer: QAAnswer };

/**
 * Webview -> Host 方向的消息联合。
 */
export type WebviewToHostMessage =
  | { type: 'ready' }
  | { type: 'requestAnswer' }
  | { type: 'toggleFavorite' }
  | { type: 'setMastery'; value: MasteryStatus }
  | { type: 'openNativeEditor'; target: 'code' | 'qa' | 'note' }
  | { type: 'requestNotePreview' };
