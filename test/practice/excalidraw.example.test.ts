import { describe, expect, it } from 'vitest';

import {
  EXCALIDRAW_ANSWER_FILE,
  EXCALIDRAW_EDITOR_VIEW_TYPE,
  EXCALIDRAW_EXTENSION_ID,
  EXCALIDRAW_FILE_EXTENSION,
  isExcalidrawFile,
} from '../../src/practice/excalidraw.js';

describe('excalidraw 常量与判定', () => {
  it('锁定扩展 ID、编辑器 viewType 与文件名约定', () => {
    expect(EXCALIDRAW_EXTENSION_ID).toBe('pomdtr.excalidraw-editor');
    expect(EXCALIDRAW_EDITOR_VIEW_TYPE).toBe('editor.excalidraw');
    expect(EXCALIDRAW_FILE_EXTENSION).toBe('.excalidraw');
    expect(EXCALIDRAW_ANSWER_FILE).toBe('answer.excalidraw');
  });

  it('isExcalidrawFile 只匹配 .excalidraw 结尾', () => {
    expect(isExcalidrawFile('answer.excalidraw')).toBe(true);
    expect(isExcalidrawFile('/projects/q1/answer.excalidraw')).toBe(true);
    expect(isExcalidrawFile('ANSWER.EXCALIDRAW')).toBe(true);
  });

  it('导出图片等其它后缀不视为画板作答文件', () => {
    expect(isExcalidrawFile('answer.excalidraw.svg')).toBe(false);
    expect(isExcalidrawFile('answer.excalidraw.png')).toBe(false);
    expect(isExcalidrawFile('index.js')).toBe(false);
    expect(isExcalidrawFile('answer.md')).toBe(false);
    expect(isExcalidrawFile('')).toBe(false);
  });
});
