/**
 * Excalidraw 画板作答的共享常量与纯工具。
 *
 * 画板作答是一种以 `answer.excalidraw` 为载体的作答类型：文件本身是 Excalidraw
 * 场景 JSON，但用户通过 VS Code 的 `pomdtr.excalidraw-editor` 扩展以「画板」方式
 * 编辑（而非查看 JSON 源码）。典型用法是把画板编辑器窗口经 Apple Sidecar 浮动到
 * iPad 上，配合 Apple Pencil 手绘作答。
 *
 * 该模块**不依赖 `vscode`**，只承载常量与纯字符串判断，便于同时被：
 *  - `QuestionProjectManager`（打开 / 创建，见 `openFile`）
 *  - `shareMarkdown` / `copyPlainText`（分享与复制给 AI 时不输出画板 JSON）
 *  - `PracticePanel.readAnswerFiles`（跳过读取画板文件内容）
 * 复用，且不会破坏纯函数模块（shareMarkdown / copyPlainText）在无 vscode mock 下的
 * 单元测试。
 *
 * 打开 / 安装等需要 `vscode` API 的逻辑留在 `QuestionProjectManager` 内，本模块只
 * 提供它所需的常量。
 */

/** Excalidraw 作答文件扩展名。 */
export const EXCALIDRAW_FILE_EXTENSION = '.excalidraw';

/** 默认画板作答文件名。 */
export const EXCALIDRAW_ANSWER_FILE = `answer${EXCALIDRAW_FILE_EXTENSION}`;

/** 提供画板编辑能力的 VS Code 扩展 ID。 */
export const EXCALIDRAW_EXTENSION_ID = 'pomdtr.excalidraw-editor';

/**
 * 该扩展为 `.excalidraw` 注册的自定义编辑器 viewType。
 * 用 `vscode.openWith(uri, EXCALIDRAW_EDITOR_VIEW_TYPE, ...)` 可强制以画板方式打开，
 * 避免被当作普通 JSON 文本编辑器打开。
 */
export const EXCALIDRAW_EDITOR_VIEW_TYPE = 'editor.excalidraw';

/**
 * 分享 Markdown / 复制给 AI 时用于替代 Excalidraw 原始 JSON 的占位说明。
 *
 * 画板 JSON 体积大且对人类与模型都不友好，因此这些导出路径只保留一句提示，
 * 说明「此处是画板手绘」，而不内联原始场景数据。
 */
export const EXCALIDRAW_ANSWER_PLACEHOLDER =
  '（Excalidraw 画板手绘作答，此处省略画板原始 JSON 数据）';

/**
 * 判断给定文件路径（或 `Uri.path`）是否为 Excalidraw 画板作答文件。
 *
 * 仅匹配 `.excalidraw` 结尾；`.excalidraw.svg` / `.excalidraw.png` 等导出格式不在
 * 本扩展的创建范围内，因此不视为画板作答文件。
 */
export function isExcalidrawFile(path: string): boolean {
  return path.toLowerCase().endsWith(EXCALIDRAW_FILE_EXTENSION);
}
