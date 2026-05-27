/**
 * Storage 元数据与 Practice 文件分类。
 *
 * 该文件仅承载类型定义，不包含任何运行时逻辑或副作用。
 *
 * 定义来源：design.md > Data Models > Bank 元数据
 *           与 Components and Interfaces > Storage Facade 与子层（PracticeKind）
 */

/**
 * `meta.json` 的根结构。`globalState` 镜像 `currentBankId` 用于快速读取，但
 * `meta.json` 始终是真理源（参见 design.md > Error Handling 与 Property 18）。
 */
export interface BankMeta {
  schemaVersion: 1;
  currentBankId?: string;
  banks: BankSummary[];
}

/**
 * `BankMeta.banks[]` 中的题库摘要项。
 *
 * - `id`：导入时由扩展生成的 UUID v4，作为内部寻址主键。
 * - `importedAt`：epoch 毫秒。
 * - `source`：仅展示用途，不作为寻址依据。
 */
export interface BankSummary {
  id: string;
  name: string;
  version: string;
  questionCount: number;
  importedAt: number;
  source?: { fileName?: string };
}

/**
 * 用户导入题库时由 Importer 透传给 `Storage.installBank` 的来源信息。
 *
 * 字段仅用于展示（最近导入提示、详情面板等），不参与内部寻址或一致性校验。
 */
export interface BankSource {
  fileName?: string;
  filePath?: string;
}

/**
 * 练习文件类别，决定 `UserDataStore` 把内容写到哪个子目录：
 *
 * - `'code'` → `user-data/<bankId>/code/<qid>.<ext>`
 * - `'qa'`   → `user-data/<bankId>/qa/<qid>.md`
 * - `'note'` → `user-data/<bankId>/notes/<qid>.md`
 *
 * 参见 design.md > Components and Interfaces > Storage Facade 与子层。
 */
export type PracticeKind = 'code' | 'qa' | 'note';
