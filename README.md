# Frontend Interview Practice

在 VS Code 内完成前端面试题的导入、浏览、刷题与复习。

## 功能特性

- 题库导入（JSON 格式）
- 题目浏览与多维筛选（题型 / 分类 / 标签 / 难度）
- 代码题练习（带语法高亮的代码编辑器）
- 问答题练习
- 笔记记录
- 收藏题目
- 掌握状态标记（未学习 / 学习中 / 已掌握 / 未掌握）
- 复习功能（复习未掌握 / 复习收藏 / 复习错题）
- 数据持久化（重启 VS Code 后数据不丢失）

## 安装方式

### 从源码构建

```bash
git clone <repository-url>
cd practice-code
pnpm install
pnpm build
pnpm package
```

构建完成后会在项目根目录生成 `.vsix` 文件，在 VS Code 中通过
**Extensions > Install from VSIX...** 安装即可。

### 开发调试

1. 用 VS Code 打开项目目录
2. 按 `F5` 启动扩展开发宿主窗口

## 使用教程

### 1. 准备题库 JSON

创建一个符合规范的 JSON 文件，包含题库名称、版本号和题目列表。完整示例：

```json
{
  "name": "前端基础题库",
  "version": "1.0.0",
  "questions": [
    {
      "id": "js-closure-01",
      "type": "code",
      "title": "实现一个计数器闭包",
      "content": "请实现一个 createCounter 函数，每次调用返回的函数时计数加 1",
      "category": "JavaScript",
      "tags": ["闭包", "函数"],
      "difficulty": "easy",
      "answer": "function createCounter() {\n  let count = 0;\n  return () => ++count;\n}",
      "language": "javascript",
      "codeTemplate": "function createCounter() {\n  // 在此实现\n}"
    },
    {
      "id": "css-box-model-01",
      "type": "qa",
      "title": "CSS 盒模型",
      "content": "请描述 CSS 标准盒模型与 IE 盒模型的区别",
      "category": "CSS",
      "tags": ["盒模型", "布局"],
      "difficulty": "easy",
      "answer": "标准盒模型 width 仅包含 content；IE 盒模型 width 包含 content + padding + border。可通过 box-sizing 属性切换。"
    }
  ]
}
```

### 2. 导入题库

打开命令面板（`Ctrl+Shift+P` / `Cmd+Shift+P`），输入：

```
Frontend Interview: Import Question Bank
```

选择本地 JSON 文件即可完成导入。

### 3. 浏览和筛选题目

在活动栏点击 **Frontend Interview** 图标，打开侧边栏的 Questions 视图。支持按以下维度筛选题目：

- 题型（code / qa）
- 分类
- 标签
- 难度（easy / medium / hard）

### 4. 练习

- **代码题**：打开题目后进入代码编辑器，编写代码并查看参考答案
- **问答题**：阅读题目内容，组织答案后对照标准答案

### 5. 学习管理

- **收藏**：将重要题目标记为收藏，方便后续快速访问
- **掌握状态**：为每道题标记状态（未学习 / 学习中 / 已掌握 / 未掌握）
- **笔记**：为题目添加个人笔记，记录思路和要点

### 6. 复习

在侧边栏的 Review 视图中，可按以下模式进入复习：

- 复习未掌握的题目
- 复习收藏的题目
- 复习错题

## 题库 JSON Schema

### 题库级字段

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| name | string | 是 | 题库名称（1-100 字符） |
| version | string | 是 | 版本号（1-20 字符） |
| questions | array | 是 | 题目列表（1-10000 条） |

### 题目基础字段

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| id | string | 是 | 题目唯一标识（1-100 字符） |
| type | string | 是 | 题型：`code` 或 `qa` |
| title | string | 是 | 题目标题（1-200 字符） |
| content | string | 是 | 题目内容（最大 20000 字符） |
| category | string | 是 | 分类（1-100 字符） |
| tags | string[] | 是 | 标签列表（0-50 个） |
| difficulty | string | 是 | 难度：`easy`、`medium`、`hard` |
| answer | string | 是 | 参考答案（最大 50000 字符） |

### code 题专用字段

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| language | string | 否 | 编程语言（1-50 字符） |
| codeTemplate | string | 否 | 代码模板（最大 50000 字符） |
| initialCode | string | 否 | 初始代码（最大 50000 字符） |
| referenceCode | string | 否 | 参考实现代码（最大 50000 字符） |
| testCases | array | 否 | 测试用例列表（最多 100 个） |
| solutionExplanation | string | 否 | 解题说明（最大 50000 字符） |

### qa 题专用字段

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| keywords | string[] | 否 | 关键词列表（最多 50 个） |
| briefAnswer | string | 否 | 简要答案（最大 5000 字符） |
| detailedAnswer | string | 否 | 详细答案（最大 50000 字符） |
| followUps | array | 否 | 追问列表（最多 50 个） |

## 命令列表

| 命令 | 说明 |
|------|------|
| `Frontend Interview: Import Question Bank` | 导入题库 JSON 文件 |
| `Frontend Interview: Switch Question Bank` | 切换当前题库 |
| `Frontend Interview: Remove Question Bank` | 移除已导入的题库 |
| `Frontend Interview: Review: Unmastered` | 复习未掌握的题目 |
| `Frontend Interview: Review: Favorites` | 复习收藏的题目 |
| `Frontend Interview: Review: Wrong Answers` | 复习错题 |

## 开发相关

### 技术栈

- TypeScript
- VS Code Extension API
- Vitest（单元测试）
- fast-check（Property-Based Testing）

### 常用脚本

| 命令 | 说明 |
|------|------|
| `pnpm build` | 构建扩展 |
| `pnpm test:unit` | 运行单元测试 |
| `pnpm test:bench` | 运行基准测试 |
| `pnpm typecheck` | TypeScript 类型检查 |
| `pnpm package` | 打包为 .vsix 文件 |

## License

MIT
