# ForgeQ

> 在 VS Code 里练习自己的题库，把作答、笔记和复习留在代码旁边。

ForgeQ 是一款通用的本地题库练习扩展。无论是编程、面试准备、课程复习还是知识整理，你都可以导入自己的 JSON 题库，在原生编辑器中完成代码题或问答题，并通过收藏、错题和掌握状态持续复习。

所有题库、作答和学习进度均保存在本机；ForgeQ 不会上传这些数据。题库引用的 HTTPS 图片由 VS Code Webview 直接加载。

## 功能亮点

- **本地题库**：导入一个或多个 JSON 题库，随时切换；导入时自动校验格式、字段和题目 ID。
- **沉浸练习**：题目与编辑器并排显示，代码题可直接使用 VS Code 的补全、格式化和语法高亮。
- **问答复习**：先独立思考，再展开参考答案、关键词、详细解析和追问。
- **图片题目**：题干和答案支持通过 Markdown 嵌入 HTTPS 图片。
- **学习记录**：为题目添加 Markdown 笔记，标记收藏、错题和掌握状态。
- **定向复习**：一键生成“未掌握”“收藏”或“错题”复习集。
- **快速定位**：按题型、分类和难度筛选，并可按分类分组展示。
- **便捷分享**：将单道题目及答案导出为 Markdown 文件。
- **可靠存储**：本地原子写入；删除的题库会暂存到回收站，7 天后清理。

## 快速开始

### 安装

发布到 VS Code Marketplace 后，在扩展视图中搜索 `ForgeQ` 即可安装。

也可以安装本地 `.vsix` 文件：

1. 打开 VS Code 的扩展视图。
2. 点击右上角 `…`，选择 **从 VSIX 安装…**。
3. 选择 ForgeQ 的 `.vsix` 文件。

ForgeQ 要求 VS Code 1.90.0 或更高版本。

### 第一次练习

1. 准备符合[题库格式](#题库格式)的 JSON 文件；也可以从 [`schemas/question-bank.template.json`](schemas/question-bank.template.json) 开始修改。
2. 按 `Ctrl+Shift+P`（macOS 为 `Cmd+Shift+P`）打开命令面板。
3. 运行 **ForgeQ: 导入题库**，选择题库文件。
4. 点击活动栏中的 ForgeQ 图标，在 **题目** 视图选择一道题。
5. 完成练习后更新掌握状态，或将题目标记为收藏/错题。
6. 在 **复习** 视图中按薄弱项集中回顾。

## 使用说明

### 题库与题目列表

ForgeQ 支持同时保存多个题库。题目列表顶部提供导入、切换和移除题库操作，也可以按题型、分类、难度筛选，或切换分类分组。

移除题库前会要求确认。被移除的题库先进入本地回收站，不会立即永久删除。

### 代码题

打开代码题时，ForgeQ 会在题目专属目录中创建练习文件，并将编辑器与题目面板并排打开。文件后缀由题目的 `language` 字段决定；已有作答会被直接打开，不会被模板覆盖。

题目面板可展示题干、测试用例、参考代码和解题说明，具体内容取决于题库提供的字段。

### 问答题

问答题支持 Markdown 题干与答案。你可以先在原生编辑器中整理自己的回答，再按需查看简要答案、详细答案、关键词和追问。

### 笔记、收藏与学习状态

每道题都可以保存独立的 Markdown 笔记。ForgeQ 支持以下掌握状态：

| 状态 | 含义 |
| --- | --- |
| 未学习 | 尚未开始 |
| 学习中 | 正在理解或练习 |
| 未掌握 | 需要继续巩固 |
| 已掌握 | 当前已掌握；设置后会清除错题标记 |

收藏和错题是独立标记，可以随时切换。删除作答文件不会删除笔记或学习状态。

### 复习模式

- **未掌握**：复习所有掌握状态为“未掌握”的题目。
- **收藏**：复习所有已收藏题目。
- **错题**：复习所有带错题标记的题目。

进入复习模式时会生成当前题目快照，因此练习过程中修改状态不会打乱本轮列表。

## 题库格式

题库是一个 UTF-8 编码的 JSON 文件，最大 10 MB，最多包含 10,000 道题。完整约束请查看 [`schemas/question-bank.schema.json`](schemas/question-bank.schema.json)。

### 最小示例

```json
{
  "name": "个人学习题库",
  "version": "1.0.0",
  "questions": [
    {
      "id": "js-debounce",
      "type": "code",
      "title": "实现 debounce",
      "content": "实现一个支持延迟执行的防抖函数。",
      "category": "JavaScript",
      "tags": ["函数", "性能优化"],
      "difficulty": "easy",
      "answer": "使用闭包保存定时器，每次调用时重置计时。",
      "language": "javascript",
      "codeTemplate": "function debounce(fn, delay) {\n  // 在此实现\n}"
    },
    {
      "id": "css-bfc",
      "type": "qa",
      "title": "什么是 BFC？",
      "content": "解释 BFC 的概念、触发条件和常见用途。",
      "category": "CSS",
      "tags": ["布局"],
      "difficulty": "medium",
      "answer": "BFC 是块级格式化上下文。",
      "keywords": ["独立布局", "浮动", "外边距折叠"],
      "briefAnswer": "BFC 是页面中的独立布局区域。",
      "detailedAnswer": "## 常见用途\n\n- 包含浮动元素\n- 避免外边距折叠"
    }
  ]
}
```

### 通用字段

| 字段 | 类型 | 必填 | 说明 |
| --- | --- | :---: | --- |
| `id` | string | 是 | 题目唯一 ID，同一题库内区分大小写 |
| `type` | `code` \| `qa` | 是 | 代码题或问答题 |
| `title` | string | 是 | 题目标题 |
| `shortTitle` | string | 否 | 侧边栏使用的短标题 |
| `content` | string | 是 | 题干，支持 Markdown |
| `category` | string | 是 | 分类 |
| `tags` | string[] | 是 | 标签，可为空数组 |
| `difficulty` | `easy` \| `medium` \| `hard` | 是 | 难度 |
| `answer` | string | 是 | 参考答案 |

代码题还可使用 `language`、`initialCode`、`codeTemplate`、`referenceCode`、`testCases` 和 `solutionExplanation`。问答题还可使用 `keywords`、`briefAnswer`、`detailedAnswer` 和 `followUps`。

### HTTPS 图片

题干和答案中的 Markdown 可以引用 HTTPS 图片：

```markdown
![事件循环示意图](https://example.com/event-loop.png)
```

出于安全考虑，ForgeQ 只渲染 `https://` 图片，不加载 HTTP、Data URL 或本地文件图片。远程图片会懒加载，并且不会发送当前文档的 Referer。

## 命令

在命令面板中输入 `ForgeQ` 可以找到主要操作：

| 命令 | 说明 |
| --- | --- |
| `ForgeQ: 导入题库` | 导入本地 JSON 题库 |
| `ForgeQ: 切换题库` | 切换当前题库 |
| `ForgeQ: 移除题库` | 将题库移入本地回收站 |
| `ForgeQ: 复习未掌握` | 生成未掌握复习集 |
| `ForgeQ: 复习收藏` | 生成收藏复习集 |
| `ForgeQ: 复习错题` | 生成错题复习集 |

扩展没有预设快捷键。可以打开 **首选项 > 键盘快捷方式**，搜索 `ForgeQ` 后自行绑定。

## 数据与隐私

ForgeQ 不需要账号，也不会上传题库、作答、笔记或学习状态。这些数据保存在 VS Code 为扩展分配的 `globalStorageUri` 中。

如果题库包含 HTTPS 图片，VS Code Webview 会直接向图片所在服务器发起请求。图片服务器可能获得你的 IP 地址、请求时间和常规网络信息；ForgeQ 会设置 `referrerpolicy="no-referrer"`，避免发送当前文档来源。

主要目录结构如下：

```text
globalStorage/
├── meta.json
├── banks/
│   └── <bank-id>/
│       ├── bank.json
│       ├── learning.json
│       ├── notes/
│       └── practice/
└── trash/
```

如果需要迁移数据，请整体备份该目录。实际路径由 VS Code 和操作系统管理，可通过 VS Code 的开发者工具或扩展日志定位。

## 本地开发

需要 Node.js 18 或更高版本，并使用 pnpm 安装依赖：

```bash
git clone https://github.com/Jett191/practice-code.git
cd practice-code
pnpm install
pnpm build
```

使用 VS Code 打开项目并按 `F5`，即可启动扩展开发宿主。

| 命令 | 作用 |
| --- | --- |
| `pnpm build` | 构建扩展 |
| `pnpm watch` | 监听并增量构建 |
| `pnpm typecheck` | 运行 TypeScript 类型检查 |
| `pnpm test:unit` | 运行单元测试与属性测试 |
| `pnpm test:integration` | 运行 VS Code 集成测试 |
| `pnpm check:schema` | 检查 JSON Schema 是否同步 |
| `pnpm package` | 生成可安装的 `.vsix` 文件 |

## 反馈与贡献

欢迎通过 [GitHub Issues](https://github.com/Jett191/practice-code/issues) 报告问题或提出建议。提交问题时，请附上 VS Code 版本、ForgeQ 版本、复现步骤和必要的错误信息；请勿上传包含隐私内容的个人题库或作答数据。

## 许可证

[MIT](LICENSE)
