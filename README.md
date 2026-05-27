# Frontend Interview Practice

> 在 VS Code 内完成前端面试题的导入、浏览、刷题与复习

## 概述

**Frontend Interview Practice** 是一个 VS Code 扩展，为前端开发者提供一体化的面试题练习环境。它将题库管理、代码编写、知识问答和复习系统集成到编辑器中，让你无需离开 VS Code 就能系统性地准备前端面试。

传统的面试准备方式往往需要在多个平台之间切换：在网页上看题、在本地编辑器写代码、在笔记软件记录要点。这种碎片化的学习体验降低了效率，也难以追踪学习进度。本扩展将这些环节整合到一个流畅的工作流中，并通过掌握状态追踪和智能复习机制帮助你高效巩固薄弱环节。

扩展采用 JSON 格式的题库文件作为数据源，支持自定义题库。无论是个人整理的面试题集，还是团队共享的题库资源，都可以轻松导入使用。所有学习进度数据持久化存储在本地，重启 VS Code 后不会丢失。

## 功能特性

### 题库导入

支持导入符合规范的 JSON 格式题库文件。导入时自动进行格式校验、字段完整性检查和 ID 唯一性验证。如果目标题库已存在，系统会提示确认是否覆盖。

**使用方法：** 打开命令面板 (`Ctrl+Shift+P` / `Cmd+Shift+P`)，执行 `Frontend Interview: Import Question Bank`，选择本地 JSON 文件即可。

### 题目浏览与筛选

在活动栏的 Frontend Interview 面板中，以树状视图展示当前题库的所有题目。每道题显示标题、题型图标、难度标识、掌握状态以及收藏/笔记标记。支持按题型、分类、标签、难度等多个维度筛选，快速定位目标题目。

**使用方法：** 点击活动栏的 "F" 图标打开侧边栏，在 Questions 视图中浏览和筛选题目。

### 代码题练习

打开代码题后，扩展会创建对应语言的临时练习文件（根据题目的 `language` 字段决定文件扩展名），并在 Webview 面板中展示题目内容、测试用例和参考答案。你可以直接在原生编辑器中编写代码，享受完整的语法高亮和智能提示。

**使用方法：** 在题目列表中点击任意代码题，系统自动打开编辑器和题目详情面板。

### 问答题练习

问答题在 Webview 面板中展示题目内容，你可以先思考并组织答案，然后查看参考答案进行对照。支持关键词提示、追问列表等辅助功能，帮助你全面理解知识点。

**使用方法：** 在题目列表中点击任意问答题，阅读题目后点击"显示答案"按钮查看标准答案。

### 笔记记录

为每道题添加个人笔记，使用 Markdown 格式记录解题思路、易错点和知识拓展。笔记以独立文件存储（`notes/<qid>.md`），不会影响题库数据。

**使用方法：** 在题目详情面板中点击"编辑笔记"按钮，在原生编辑器中编写笔记内容。

### 收藏与掌握状态

为题目标记收藏，便于快速访问重要题目。每道题支持四种掌握状态：

| 状态 | 含义 |
|------|------|
| `unlearned` | 未学习（默认） |
| `learning` | 学习中 |
| `mastered` | 已掌握 |
| `not_mastered` | 未掌握 |

设置为"已掌握"时自动清除错题标记；设置为"未掌握"时自动添加错题标记。

**使用方法：** 在题目详情面板中使用收藏按钮和掌握状态选择器。

### 复习系统

基于学习状态提供三种复习模式，帮助你针对性地巩固薄弱环节：

- **复习未掌握**：汇集所有标记为"未掌握"的题目
- **复习收藏**：汇集所有收藏的题目
- **复习错题**：汇集所有错题标记为 true 的题目

复习开始时生成快照，确保复习过程中题目列表不会因状态变更而动态变化。

**使用方法：** 在侧边栏的 Review 视图中选择对应的复习模式，或通过命令面板执行对应命令。

## 快速开始

### 环境要求

- VS Code >= 1.90.0
- Node.js >= 18
- pnpm

### 安装

```bash
# 克隆项目
git clone <repository-url>
cd practice-code

# 安装依赖
pnpm install

# 构建扩展
pnpm build

# 打包为 .vsix 文件
pnpm package
```

构建完成后会在项目根目录生成 `.vsix` 文件，在 VS Code 中通过 **Extensions > Install from VSIX...** 安装。

如果你希望在开发模式下运行：

1. 使用 VS Code 打开项目目录
2. 按 `F5` 启动扩展开发宿主窗口（Extension Development Host）
3. 在宿主窗口中即可测试扩展功能

### 第一次使用

1. **准备题库文件**：创建一个 JSON 文件，按照下方"题库格式规范"填写题目数据。

2. **导入题库**：按 `Ctrl+Shift+P`（macOS 为 `Cmd+Shift+P`）打开命令面板，输入 `Frontend Interview: Import Question Bank`，选择刚才创建的 JSON 文件。

3. **浏览题目**：导入成功后，点击活动栏的扩展图标，在 Questions 视图中看到题目列表。

4. **开始练习**：点击任意题目开始练习。代码题会打开编辑器供你编写代码；问答题在面板中展示题目和答案。

5. **标记状态**：完成练习后，在详情面板中标记掌握状态（已掌握/未掌握/学习中）。

6. **定期复习**：使用 Review 视图中的复习功能，针对性地复习未掌握的题目。

## 题库格式规范

### 完整示例

```json
{
  "name": "前端核心面试题",
  "version": "1.0.0",
  "questions": [
    {
      "id": "js-promise-all",
      "type": "code",
      "title": "手写 Promise.all",
      "content": "请实现一个 `promiseAll` 函数，功能与 `Promise.all` 一致：\n\n- 接收一个 Promise 数组\n- 所有 Promise 都 resolve 时，返回结果数组（保持顺序）\n- 任意一个 Promise reject 时，立即 reject",
      "category": "JavaScript",
      "tags": ["Promise", "异步", "手写实现"],
      "difficulty": "medium",
      "answer": "function promiseAll(promises) {\n  return new Promise((resolve, reject) => {\n    const results = [];\n    let count = 0;\n    if (promises.length === 0) return resolve([]);\n    promises.forEach((p, i) => {\n      Promise.resolve(p).then(val => {\n        results[i] = val;\n        if (++count === promises.length) resolve(results);\n      }, reject);\n    });\n  });\n}",
      "language": "javascript",
      "codeTemplate": "function promiseAll(promises) {\n  // 在此实现\n}",
      "testCases": [
        {
          "name": "全部 resolve",
          "input": "[Promise.resolve(1), Promise.resolve(2), Promise.resolve(3)]",
          "expected": "[1, 2, 3]"
        },
        {
          "name": "包含 reject",
          "input": "[Promise.resolve(1), Promise.reject('error')]",
          "expected": "reject with 'error'"
        }
      ],
      "solutionExplanation": "核心思路：用计数器追踪已完成的 Promise 数量，全部完成后 resolve 结果数组。注意用索引而非 push 来保持结果顺序。"
    },
    {
      "id": "css-bfc",
      "type": "qa",
      "title": "什么是 BFC？如何触发？",
      "content": "请解释 CSS 中的 BFC（块格式化上下文）概念，说明其特性和触发条件。",
      "category": "CSS",
      "tags": ["BFC", "布局", "盒模型"],
      "difficulty": "medium",
      "answer": "BFC 是块格式化上下文，是页面上一个独立的渲染区域，内部元素的布局不会影响外部元素。",
      "keywords": ["独立渲染区域", "不影响外部", "margin 不折叠", "清除浮动"],
      "briefAnswer": "BFC 是一个独立的渲染区域，内部布局与外部隔离。",
      "detailedAnswer": "## BFC 的特性\n\n1. 内部 Box 垂直排列\n2. 同一 BFC 内相邻 margin 会折叠\n3. BFC 区域不会与 float 元素重叠\n4. BFC 是独立容器，内外互不影响\n5. 计算高度时浮动子元素参与\n\n## 触发条件\n\n- `overflow` 不为 `visible`（如 `hidden`、`auto`）\n- `display` 为 `inline-block`、`flex`、`grid`、`table-cell`\n- `position` 为 `absolute` 或 `fixed`\n- `float` 不为 `none`\n- 根元素 `<html>`\n\n## 常见应用\n\n- 清除浮动\n- 防止 margin 折叠\n- 自适应多栏布局",
      "followUps": [
        {
          "question": "BFC 和 IFC 有什么区别？",
          "answer": "BFC 是块级格式化上下文，处理块级盒子的布局；IFC 是行内格式化上下文，处理行内盒子的排列。"
        },
        {
          "question": "如何用 BFC 解决 margin 折叠问题？",
          "answer": "将两个相邻元素放入不同的 BFC 容器中，例如给父元素添加 overflow: hidden。"
        }
      ]
    },
    {
      "id": "js-debounce",
      "type": "code",
      "title": "实现防抖函数 debounce",
      "content": "实现一个 `debounce` 函数：\n\n- 在事件触发 n 毫秒后执行回调\n- 如果在 n 毫秒内再次触发，则重新计时\n- 支持 `immediate` 参数，为 true 时先立即执行一次",
      "category": "JavaScript",
      "tags": ["防抖", "性能优化", "手写实现"],
      "difficulty": "easy",
      "answer": "function debounce(fn, delay, immediate = false) {\n  let timer = null;\n  return function (...args) {\n    if (timer) clearTimeout(timer);\n    if (immediate && !timer) {\n      fn.apply(this, args);\n    }\n    timer = setTimeout(() => {\n      if (!immediate) fn.apply(this, args);\n      timer = null;\n    }, delay);\n  };\n}",
      "language": "javascript",
      "codeTemplate": "function debounce(fn, delay, immediate = false) {\n  // 在此实现\n}"
    }
  ]
}
```

### 字段说明

#### 题库级字段

| 字段 | 类型 | 必填 | 约束 | 说明 |
|------|------|:----:|------|------|
| `name` | string | 是 | 1-100 字符 | 题库名称 |
| `version` | string | 是 | 1-20 字符 | 题库版本号 |
| `questions` | array | 是 | 1-10000 条 | 题目列表 |

#### 题目通用字段

| 字段 | 类型 | 必填 | 约束 | 说明 |
|------|------|:----:|------|------|
| `id` | string | 是 | 1-100 字符，全库唯一 | 题目唯一标识 |
| `type` | string | 是 | `"code"` 或 `"qa"` | 题目类型 |
| `title` | string | 是 | 1-200 字符 | 题目标题 |
| `content` | string | 是 | 最大 20000 字符 | 题目内容（支持 Markdown） |
| `category` | string | 是 | 1-100 字符 | 题目分类 |
| `tags` | string[] | 是 | 0-50 个元素 | 标签列表 |
| `difficulty` | string | 是 | `"easy"` / `"medium"` / `"hard"` | 难度等级 |
| `answer` | string | 是 | 最大 50000 字符 | 参考答案 |

#### 代码题专用字段（type: "code"）

| 字段 | 类型 | 必填 | 约束 | 说明 |
|------|------|:----:|------|------|
| `language` | string | 否 | 1-50 字符 | 编程语言，决定练习文件扩展名 |
| `codeTemplate` | string | 否 | 最大 50000 字符 | 代码模板（初始骨架） |
| `initialCode` | string | 否 | 最大 50000 字符 | 初始代码（优先级高于 codeTemplate） |
| `referenceCode` | string | 否 | 最大 50000 字符 | 参考实现代码 |
| `testCases` | array | 否 | 最多 100 个 | 测试用例列表 |
| `solutionExplanation` | string | 否 | 最大 50000 字符 | 解题思路说明 |

#### 问答题专用字段（type: "qa"）

| 字段 | 类型 | 必填 | 约束 | 说明 |
|------|------|:----:|------|------|
| `keywords` | string[] | 否 | 最多 50 个 | 答题关键词 |
| `briefAnswer` | string | 否 | 最大 5000 字符 | 简要答案 |
| `detailedAnswer` | string | 否 | 最大 50000 字符 | 详细答案（支持 Markdown） |
| `followUps` | array | 否 | 最多 50 个 | 追问列表 |

### 格式约束

- **文件大小限制**：单个题库 JSON 文件不超过 10MB
- **题目数量限制**：每个题库包含 1-10000 道题目
- **ID 唯一性**：同一题库内所有题目的 `id` 必须唯一（区分大小写）
- **字段长度限制**：各字段严格遵循上表中的字符数/元素数约束，超出将导致导入失败
- **编码要求**：文件必须为 UTF-8 编码

## 命令参考

| 命令 ID | 命令面板标题 | 说明 |
|---------|------------|------|
| `frontendInterview.import` | Frontend Interview: Import Question Bank | 选择并导入本地 JSON 题库文件 |
| `frontendInterview.openQuestion` | Frontend Interview: Open Question | 打开指定题目进行练习（由树视图触发） |
| `frontendInterview.switchBank` | Frontend Interview: Switch Question Bank | 在已导入的多个题库之间切换 |
| `frontendInterview.removeBank` | Frontend Interview: Remove Question Bank | 移除已导入的题库（需确认） |
| `frontendInterview.review.unmastered` | Frontend Interview: Review: Unmastered | 进入"未掌握"复习模式 |
| `frontendInterview.review.favorite` | Frontend Interview: Review: Favorites | 进入"收藏"复习模式 |
| `frontendInterview.review.wrong` | Frontend Interview: Review: Wrong Answers | 进入"错题"复习模式 |

## 键盘快捷方式

本扩展未预设键盘快捷方式，你可以在 VS Code 中自定义绑定：

1. 打开 **Preferences > Keyboard Shortcuts**（`Ctrl+K Ctrl+S`）
2. 搜索 `frontendInterview`
3. 为任意命令设置你偏好的快捷键

## 数据存储

所有用户数据存储在 VS Code 的 `globalStorageUri` 目录下，该路径由 VS Code 管理，具体位置因操作系统而异：

- **Windows**: `%APPDATA%\Code\User\globalStorage\frontend-interview-practice\`
- **macOS**: `~/Library/Application Support/Code/User/globalStorage/frontend-interview-practice/`
- **Linux**: `~/.config/Code/User/globalStorage/frontend-interview-practice/`

### 存储结构

```
globalStorage/
  meta.json              # 题库元数据（已导入题库列表、当前激活题库）
  banks/
    <bank-id>/
      bank.json          # 题库原始数据
      learning.json      # 学习状态（掌握状态、收藏、错题标记）
      notes/
        <question-id>.md # 每道题的笔记
      practice/
        <question-id>.*  # 代码题的练习文件
  trash/                 # 已删除题库（7 天后自动清理）
```

### 持久化机制

- 数据变更使用 **原子写入**（先写 `.tmp` 临时文件，再 rename 覆盖原文件），确保写入过程中断电或崩溃不会损坏已有数据
- 启动时自动检测并清理残留的 `.tmp` 文件
- 如果 `meta.json` 损坏，扩展进入安全模式运行，不删除底层数据，等待手动修复
- `globalState` 与 `meta.json` 之间做最终一致同步，以 `meta.json` 为真理源

## 开发指南

### 技术栈

| 技术 | 用途 |
|------|------|
| TypeScript 5.6+ | 主要开发语言 |
| VS Code Extension API | 扩展宿主接口 |
| esbuild | 打包构建 |
| Vitest | 单元测试框架 |
| fast-check | 属性测试（Property-Based Testing） |
| memfs | 内存文件系统（测试用） |
| Ajv | JSON Schema 校验 |

### 项目结构

```
src/
  extension.ts              # 扩展入口，activate/deactivate
  commands/
    bankCommands.ts         # 切换/移除题库命令
  domain/
    masteryRules.ts         # 掌握状态联动规则
    reviewSetBuilder.ts     # 复习集构建逻辑
  filter/
    filter.ts               # 多维筛选控制器
  importer/
    importer.ts             # 题库导入器
  parser/
    parser.ts               # JSON 解析与校验
    formatter.ts            # 错误信息格式化
    schema.ts               # JSON Schema 定义（生成源）
  practice/
    practiceController.ts   # 练习流程控制器
    practiceFiles.ts        # 练习文件管理
    webview/
      panel.ts              # Webview 面板生命周期
      messages.ts           # 宿主与 Webview 的消息协议
      index.html            # Webview 模板
      styles.css            # Webview 样式
      main.ts               # Webview 前端脚本
  storage/
    storage.ts              # 存储门面（Storage Facade）
    installBank.ts          # 五阶段事务安装逻辑
    bankRegistry.ts         # 题库注册中心
    bankStore.ts            # 题库数据读写
    userDataStore.ts        # 学习状态读写
    metaStore.ts            # 元数据管理
    atomicFs.ts             # 原子写入工具
    trash.ts                # 回收站管理
  types/
    question.ts             # 题目/题库类型定义
    learning.ts             # 学习状态类型定义
    bankMeta.ts             # 元数据类型定义
    errors.ts               # 领域错误类型（Result<T,E> 模式）
  views/
    questionListProvider.ts # 题目列表 TreeDataProvider
    reviewProvider.ts       # 复习视图 TreeDataProvider
    iconRegistry.ts         # 图标注册

test/
  setup.ts                  # 测试全局配置
  generators.ts             # fast-check 生成器
  harness/
    memFsHarness.ts         # 内存文件系统测试装置
  properties/               # 属性测试（PBT）
  storage/                  # 存储层单元测试
  parser/                   # 解析器单元测试
  importer/                 # 导入器单元测试
  practice/                 # 练习控制器测试
  views/                    # 视图层测试
  bench/                    # 基准测试
  integration/              # 集成测试桩（需 VS Code 宿主）

scripts/
  build.mjs                 # esbuild 构建脚本
  package.mjs               # .vsix 打包脚本
  generateSchema.mjs        # JSON Schema 生成脚本
  runIntegrationTests.mjs   # 集成测试运行器

schemas/
  question-bank.schema.json # 生成的 JSON Schema（勿手动编辑）
```

### 构建与测试

| 命令 | 说明 |
|------|------|
| `pnpm build` | 使用 esbuild 构建扩展，输出 `dist/extension.js` 和 `dist/webview/main.js` |
| `pnpm watch` | 监听模式构建，文件变更时自动重新打包 |
| `pnpm typecheck` | TypeScript 类型检查（`tsc --noEmit`） |
| `pnpm test:unit` | 运行所有单元测试和属性测试 |
| `pnpm test:bench` | 运行基准测试（解析性能、写入性能） |
| `pnpm test:integration` | 运行集成测试（需要 VS Code 宿主环境） |
| `pnpm generate:schema` | 从 `src/parser/schema.ts` 生成 JSON Schema 文件 |
| `pnpm check:schema` | 检查生成的 Schema 是否与源码同步 |
| `pnpm package` | 打包为可安装的 `.vsix` 文件 |

### 测试策略

本项目采用多层次的测试策略确保代码质量：

**单元测试（Example-based）**：针对各模块的核心逻辑编写确定性测试用例，覆盖正常路径和边界条件。位于 `test/` 下各对应目录的 `*.example.test.ts` 文件中。

**属性测试（Property-Based Testing）**：使用 fast-check 框架生成随机输入，验证代码在任意合法输入下都满足指定不变量。覆盖的属性包括：

- 存储读写 round-trip 一致性
- 故障注入后的回滚正确性
- installBank 事务原子性
- meta.json 与 globalState 最终一致性
- 收藏切换幂等性（偶数次切换恢复原值）
- 筛选过滤器正确性
- 解析器 round-trip 和 schema 违规检测
- 复习集谓词正确性

**基准测试（Benchmark）**：验证性能关键路径满足预期时间约束：
- 10000 题 JSON 解析 < 1 秒
- 单次文件写入 < 500ms

**集成测试（Smoke）**：在完整 VS Code 宿主环境中验证端到端流程（需要 `@vscode/test-electron`，CI 环境下运行）。

## 常见问题

### 导入失败怎么办？

1. **检查文件编码**：确保 JSON 文件为 UTF-8 编码
2. **检查文件大小**：单文件不超过 10MB
3. **验证 JSON 格式**：使用 VS Code 的 JSON 格式检查确认语法正确
4. **检查必填字段**：确保 `name`、`version`、`questions` 以及每道题的必填字段都已填写
5. **检查 ID 唯一性**：确保同一题库内没有重复的 `id`
6. **查看错误信息**：导入失败时弹出的错误通知会包含具体失败原因（如哪个字段不合规范）

### 数据丢失了怎么办？

- 扩展使用原子写入机制，正常情况下不会丢失数据
- 如果 `meta.json` 损坏，扩展会进入安全模式，底层的 `banks/` 目录数据仍然完好
- 删除的题库会在 `trash/` 目录保留 7 天，可以手动恢复
- 建议定期备份 `globalStorage` 目录

### 如何迁移题库？

1. **导出**：找到 `globalStorage` 路径下的 `banks/<bank-id>/bank.json`，这就是完整的题库数据
2. **迁移学习进度**：同目录下的 `learning.json` 包含该题库的所有学习状态
3. **在新环境导入**：将 `bank.json` 作为普通题库文件重新导入即可；学习进度需要手动复制 `learning.json` 到对应目录

## 路线图

- **题库在线分享**：支持从 URL 导入题库，方便团队间共享题目资源
- **学习数据统计**：提供学习时间、正确率、知识图谱等可视化统计面板
- **AI 辅助评价**：集成 LLM 对问答题的回答进行自动评分和建议

## License

MIT
