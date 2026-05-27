# Requirements Document

## Introduction

`frontend-interview-practice` 是一个面向前端开发者的 VS Code 扩展，用于在编辑器内完成前端面试题的导入、浏览、刷题与复习。用户按约定的 JSON 格式整理题库后导入插件，插件提供分类/标签/难度/题型多维筛选，支持代码题与问答题两种练习模式，并允许用户记录笔记、收藏题目、标记掌握状态。基于上述行为数据，插件提供针对未掌握题、收藏题与错题的专项复习能力，目标是把"前端面试刷题"的全流程集中到 VS Code 内完成。

## Glossary

- **Extension**：本插件主体，承载所有功能并在 VS Code 内运行的 VS Code Extension。
- **Question_Bank**：用户提供的一个题库实体，由一个 JSON 文件解析得到，包含元数据与若干 `Question`。
- **Question_Bank_File**：用户在本地磁盘上提供的、用于导入的 JSON 文件，编码为 UTF-8。
- **Question_Bank_Schema**：题库 JSON 文件需要遵循的固定结构定义（在设计阶段以 JSON Schema 形式落地），包含字段名、类型与必填项约束。
- **Importer**：负责选择并读取 `Question_Bank_File` 的子模块。
- **Parser**：负责将 `Question_Bank_File` 的 JSON 文本解析为内部 `Question_Bank` 对象的子模块。
- **Formatter**：负责将内部 `Question_Bank` 对象序列化为符合 `Question_Bank_Schema` 的 JSON 文本的子模块。
- **Question**：题库中的单道题目，必含字段：`id`、`type`、`title`、`content`、`category`、`tags`、`difficulty`、`answer`；可选字段：`codeTemplate`、`language`。
- **Question_Type**：题目类型，取值为 `code`（代码题）或 `qa`（问答题）。
- **Difficulty**：题目难度，取值为 `easy`、`medium`、`hard` 之一。
- **Question_List_View**：插件在 VS Code 侧边栏中提供的、用于展示已导入题目集合的视图。
- **Filter**：在 `Question_List_View` 中按题型、分类、标签、难度组合筛选题目的子模块。
- **Practice_View**：用户练习单道题目时打开的视图，区分 `Code_Practice_View`（代码题）与 `QA_Practice_View`（问答题）。
- **Note**：用户在练习某道 `Question` 时手动记录的纯文本笔记，每道题最多一条，可被覆盖更新。
- **Mastery_Status**：用户对某道 `Question` 的掌握状态标记，取值为 `unlearned`（未学习，默认）、`learning`（学习中）、`mastered`（已掌握）、`not_mastered`（未掌握）。
- **Favorite_Flag**：用户对某道 `Question` 的收藏标记，取值为 `true` 或 `false`，默认 `false`。
- **Wrong_Flag**：用户对某道 `Question` 的错题标记，取值为 `true` 或 `false`，默认 `false`。
- **Learning_State**：单道 `Question` 所关联的用户学习数据的总称，包含 `Mastery_Status`、`Favorite_Flag`、`Wrong_Flag`、`Note` 与最近练习时间。
- **Storage**：基于 VS Code `globalState` / `workspaceState` 的本地持久化存储子模块，用于保存导入的 `Question_Bank` 与所有 `Learning_State`。
- **Review_View**：用于发起复习的视图，提供"复习未掌握"、"复习收藏"、"复习错题"三种复习集合入口。
- **Review_Set**：一次复习操作中由 `Review_View` 选定的题目子集。

## Requirements

### Requirement 1: 题库 JSON 格式与解析

**User Story:** 作为题库维护者，我希望按统一格式整理 JSON 题库并被插件正确解析，以便不同题库之间可以互通且解析行为可预期。

#### Acceptance Criteria

1. THE Extension SHALL 在文档中定义并对外发布 `Question_Bank_Schema`，至少包含以下字段及其类型与必填/可选标识：题库级 `name`（string，必填，1-100 字符）、`version`（string，必填，1-20 字符）；题目级 `id`（string，必填，1-100 字符）、`type`（string，必填，取值 `code` 或 `qa`）、`title`（string，必填，1-200 字符）、`content`（string，必填，≤20000 字符）、`category`（string，必填，1-100 字符）、`tags`（string[]，必填，元素数 0-50）、`difficulty`（string，必填，取值 `easy` / `medium` / `hard`）、`answer`（string，必填，≤50000 字符）、`codeTemplate`（string，可选，≤50000 字符）、`language`（string，可选，1-50 字符）。
2. WHEN `Parser` 接收到一段符合 `Question_Bank_Schema` 的 JSON 文本，且文件大小不超过 5 MB 且 `questions` 数组长度不超过 10000，THE Parser SHALL 在 1 秒内输出一个 `Question_Bank` 对象，且对象中每道 `Question` 的字段值与 JSON 中对应字段值一一相等。
3. IF 输入 JSON 文本不是合法 JSON，THEN THE Parser SHALL 返回 `INVALID_JSON` 错误，且错误信息包含首个解析失败位置的行号与列号，行列号均从 1 开始计数。
4. IF 输入 JSON 合法但缺少 `Question_Bank_Schema` 中任一必填字段，或任一必填字段的实际类型与 `Question_Bank_Schema` 定义的类型不匹配，THEN THE Parser SHALL 返回 `SCHEMA_VIOLATION` 错误，且错误信息列出所有违规字段的字段路径与违规类型（缺失或类型不匹配）。
5. IF 某个 `Question` 的 `type` 字段值不在 `{code, qa}` 集合中，THEN THE Parser SHALL 返回 `SCHEMA_VIOLATION` 错误，且错误信息包含该 `Question` 的 `id` 与该字段路径。
6. IF 某个 `Question` 的 `difficulty` 字段值不在 `{easy, medium, hard}` 集合中，THEN THE Parser SHALL 返回 `SCHEMA_VIOLATION` 错误，且错误信息包含该 `Question` 的 `id` 与该字段路径。
7. IF 同一个 `Question_Bank_File` 中存在两个或多个 `Question` 的 `id` 字段在区分大小写下精确相等，THEN THE Parser SHALL 返回 `DUPLICATE_QUESTION_ID` 错误，且错误信息列出每个重复 `id` 值，以及该 `id` 在 `questions` 数组中所有出现位置的索引（从 0 开始计数）。
8. WHEN `Formatter` 接收到任意合法的 `Question_Bank` 对象，THE Formatter SHALL 将该对象序列化为符合 `Question_Bank_Schema` 的 JSON 文本，输出文本编码为 UTF-8。
9. 对于任意由 `Parser` 成功解析得到的 `Question_Bank` 对象 `B`，THE Extension SHALL 满足 `Parser(Formatter(B))` 与 `B` 在字段集与字段值上完全相等（解析-序列化往返属性）。
10. WHEN `Parser` 接收到的 JSON 文本中 `questions` 数组为空，THE Parser SHALL 返回 `EMPTY_QUESTION_BANK` 错误。

### Requirement 2: 题库导入

**User Story:** 作为用户，我希望通过选择本地 JSON 文件导入题库，以便快速把已经整理好的题目加载到插件中。

#### Acceptance Criteria

1. THE Extension SHALL 在 VS Code 命令面板中注册 `Frontend Interview: Import Question Bank` 命令。
2. WHEN 用户执行 `Frontend Interview: Import Question Bank` 命令，THE Importer SHALL 弹出 VS Code 原生文件选择对话框，且对话框配置为单选模式且文件类型过滤限制为 `.json` 后缀。
3. WHEN 用户在文件选择对话框中确认选择一个文件，THE Importer SHALL 以 UTF-8 编码读取该文件全部内容并将其交由 `Parser` 处理。
4. WHEN 用户在文件选择对话框中取消选择，THE Importer SHALL 中止本次导入流程且不修改 `Storage` 中已有的 `Question_Bank` 与 `Learning_State`。
5. IF 用户选定的文件大小超过 10 MB，THEN THE Importer SHALL 返回 `FILE_TOO_LARGE` 错误并不读取文件内容，且不修改 `Storage` 中已有的 `Question_Bank` 与 `Learning_State`。
6. WHEN `Parser` 成功返回一个 `Question_Bank` 对象，THE Extension SHALL 通过 `Storage` 持久化保存该 `Question_Bank`，在 `Question_List_View` 中刷新展示其全部 `Question`，并向用户展示导入成功提示，提示中包含本次导入的 `Question` 数量。
7. IF `Importer` 读取选定文件失败，THEN THE Extension SHALL 弹出错误提示并展示底层错误原因，且不修改 `Storage` 中已有的 `Question_Bank`。
8. IF `Parser` 返回任意错误，THEN THE Extension SHALL 弹出错误提示并展示该错误的类型与详情，且不修改 `Storage` 中已有的 `Question_Bank`。
9. WHEN 用户对一个已经导入过的题库再次执行导入操作，THE Extension SHALL 在导入前向用户提供"覆盖已有题库"和"取消导入"两个明确选项；当用户选择"覆盖已有题库"，THE Extension SHALL 删除 `Storage` 中旧 `Question_Bank` 的全部 `Learning_State` 并保存新 `Question_Bank`；当用户选择"取消导入"，THE Extension SHALL 不修改 `Storage` 中的任何数据。
10. WHILE `Storage` 中存在已导入的 `Question_Bank`，THE Extension SHALL 在 VS Code 重启后再次启动时自动从 `Storage` 恢复该 `Question_Bank` 并展示在 `Question_List_View` 中。

### Requirement 3: 题目浏览与展示

**User Story:** 作为用户，我希望在 VS Code 中看到导入的题目列表，以便快速选择要练习的题目。

#### Acceptance Criteria

1. THE Extension SHALL 在 VS Code 活动栏中注册一个名为 `Frontend Interview` 的视图容器，且该容器内包含 `Question_List_View`。
2. THE Question_List_View SHALL 为 `Storage` 中已导入 `Question_Bank` 的每一道 `Question` 渲染一个列表项，且列表项的渲染顺序与 `Question_Bank` 中题目出现的顺序一致。
3. THE Question_List_View SHALL 为每个列表项展示该 `Question` 的 `title`、`type`、`difficulty` 与 `category`。
4. WHEN 用户在 `Question_List_View` 中单击一个列表项，THE Extension SHALL 根据该 `Question` 的 `type` 字段值，将其分发到 `Code_Practice_View`（当 `type` 为 `code` 时）或 `QA_Practice_View`（当 `type` 为 `qa` 时）。
5. WHILE `Storage` 中不存在已导入的 `Question_Bank`，THE Question_List_View SHALL 显示一条引导文案，提示用户执行 `Frontend Interview: Import Question Bank` 命令导入题库。
6. WHILE `Storage` 中存在已导入的 `Question_Bank` 但其 `questions` 数组为空，THE Question_List_View SHALL 显示一条文案，提示当前题库为空。

### Requirement 4: 题目筛选

**User Story:** 作为用户，我希望按题型、分类、标签、难度组合筛选题目，以便聚焦在当前想练习的题目子集上。

#### Acceptance Criteria

1. THE Filter SHALL 支持四个独立的筛选维度：`type`、`category`、`tags`、`difficulty`，每个维度都有"激活"与"未激活"两种状态，且某维度判定为"激活"当且仅当用户为该维度设置了非空筛选值。
2. WHILE `type` 筛选维度处于激活状态，THE Filter SHALL 将该维度的取值限制为 `code` 或 `qa` 之一，且仅保留 `type` 字段值等于该筛选值的 `Question`。
3. WHILE `category` 筛选维度处于激活状态，THE Filter SHALL 将该维度的取值限制为单一长度为 1-100 字符的分类名，且仅保留 `category` 字段值与该分类名在区分大小写下完全相等的 `Question`。
4. WHILE `tags` 筛选维度处于激活状态，THE Filter SHALL 将该维度的取值限制为一个非空标签集合 T（1 ≤ |T| ≤ 50），且仅保留 `tags` 字段值与 T 的交集非空的 `Question`。
5. WHILE `difficulty` 筛选维度处于激活状态，THE Filter SHALL 将该维度的取值限制为 `easy`、`medium`、`hard` 之一，且仅保留 `difficulty` 字段值等于该筛选值的 `Question`。
6. WHILE 多个筛选维度同时处于激活状态，THE Filter SHALL 仅保留同时满足所有已激活维度筛选条件的 `Question`（多维度间为逻辑与）。
7. WHEN 用户通过某维度对应的筛选控件清空该维度的筛选条件，THE Filter SHALL 将该维度切换为"未激活"状态，且不影响其他维度的激活状态与取值。
8. WHILE 全部四个筛选维度均处于"未激活"状态，THE Question_List_View SHALL 展示 `Storage` 中已导入 `Question_Bank` 的全部 `Question`。
9. WHILE 当前已激活筛选条件下无任何 `Question` 命中，THE Question_List_View SHALL 不渲染任何 `Question` 列表项，并显示一条文案，提示当前筛选条件下没有匹配题目。
10. WHEN 任一筛选维度的激活状态或取值发生变更，THE Question_List_View SHALL 在 500 毫秒内完成重渲染。

### Requirement 5: 代码题练习

**User Story:** 作为用户，我希望在打开代码题时获得可编辑的代码区域并能查看参考答案，以便在 VS Code 内完成代码题练习。

#### Acceptance Criteria

1. WHEN 用户打开一个 `type` 为 `code` 的 `Question`，THE Code_Practice_View SHALL 同时展示题目 `title`、`content` 与一个可编辑的代码编辑区。
2. WHEN 用户首次打开某道代码题且该 `Question` 的 `codeTemplate` 字段存在，THE Code_Practice_View SHALL 将 `codeTemplate` 字段值作为代码编辑区的初始内容。
3. WHEN 用户在代码编辑区中修改内容并停止输入达 1000 毫秒，THE Extension SHALL 通过 `Storage` 自动持久化保存当前代码内容，且与该 `Question` 的 `id` 关联。
4. WHEN 用户重新打开同一道代码题且 `Storage` 中存在该 `Question` 关联的代码内容，THE Code_Practice_View SHALL 将该已保存的代码内容作为代码编辑区的初始内容。
5. WHEN 用户在 `Code_Practice_View` 中触发 `查看答案` 操作，THE Code_Practice_View SHALL 在独立区域展示该 `Question` 的 `answer` 字段值。
6. WHERE `Question` 的 `language` 字段存在，THE Code_Practice_View SHALL 将代码编辑区的语言模式设置为该字段值。
7. IF `Storage` 持久化代码内容失败，THEN THE Extension SHALL 弹出错误提示，且保留代码编辑区当前内存中的代码内容不变。
8. IF 用户首次打开某道代码题且该 `Question` 的 `codeTemplate` 字段缺失，THEN THE Code_Practice_View SHALL 将代码编辑区的初始内容设为空字符串；IF 用户重新打开某道代码题且 `Storage` 中不存在该 `Question` 关联的代码内容，THEN THE Code_Practice_View SHALL 退化为首次打开的初始化规则。
9. IF `Question` 的 `answer` 字段缺失或为空字符串，THEN THE Code_Practice_View SHALL 在 `查看答案` 区域显示一条文案，提示该题暂无参考答案；IF `Question` 的 `language` 字段缺失，THEN THE Code_Practice_View SHALL 将代码编辑区的语言模式设置为 `plaintext`。

### Requirement 6: 问答题练习

**User Story:** 作为用户，我希望在打开问答题时看到题目内容并能查看参考答案，以便在 VS Code 内完成问答题练习。

#### Acceptance Criteria

1. WHEN 用户打开一个 `type` 为 `qa` 的 `Question`，THE QA_Practice_View SHALL 展示该 `Question` 的 `title` 与 `content`。
2. THE QA_Practice_View SHALL 为问答题提供一个独立于 `Note` 的"我的回答"输入区，用于用户撰写回答。
3. WHEN 用户在"我的回答"输入区中修改内容并停止输入达 1000 毫秒，THE Extension SHALL 通过 `Storage` 自动持久化保存该回答内容，且与该 `Question` 的 `id` 关联。
4. WHEN 用户重新打开同一道问答题且 `Storage` 中存在该 `Question` 关联的"我的回答"内容，THE QA_Practice_View SHALL 将该已保存的回答内容加载到"我的回答"输入区。
5. WHEN 用户重新打开同一道问答题且 `Storage` 中不存在该 `Question` 关联的"我的回答"内容，THE QA_Practice_View SHALL 将"我的回答"输入区初始化为空。
6. WHEN 用户在 `QA_Practice_View` 中触发 `查看答案` 操作，THE QA_Practice_View SHALL 在独立区域展示该 `Question` 的 `answer` 字段值；IF `Question` 的 `answer` 字段缺失或为空字符串，THEN THE QA_Practice_View SHALL 在 `查看答案` 区域显示一条文案，提示该题暂无参考答案。
7. THE QA_Practice_View SHALL 限制"我的回答"输入区单次输入的字符数不超过 20000。
8. IF `Storage` 持久化"我的回答"内容失败，THEN THE Extension SHALL 弹出错误提示，且保留"我的回答"输入区当前内存中的回答内容不变。

### Requirement 7: 笔记记录

**User Story:** 作为用户，我希望为每道题目记录笔记，以便沉淀解题思路并在以后复习时参考。

#### Acceptance Criteria

1. THE Practice_View SHALL 为每道 `Question` 提供一个独立的 `Note` 编辑区，且单条 `Note` 的字符数不超过 10000。
2. WHEN 用户在 `Note` 编辑区输入或修改内容并停止输入达 1000 毫秒，THE Extension SHALL 通过 `Storage` 自动持久化保存该 `Note`（与该 `Question` 的 `id` 关联），并在保存成功后于 `Practice_View` 中显示一条"已保存"指示。
3. WHEN 用户重新打开同一道题目的 `Practice_View`，THE Practice_View SHALL 从 `Storage` 加载并展示该 `Question` 已保存的 `Note`；如果不存在，则 `Note` 编辑区为空。
4. WHEN 用户清空某道题目的 `Note` 内容并触发自动保存，THE Extension SHALL 在 `Storage` 中将该 `Note` 视为不存在，且后续打开时 `Note` 编辑区为空。
5. IF `Storage` 持久化 `Note` 失败，THEN THE Extension SHALL 弹出错误提示，且保留 `Note` 编辑区当前内存中的内容不变。

### Requirement 8: 题目收藏

**User Story:** 作为用户，我希望收藏部分题目，以便后续单独复习这些重点题目。

#### Acceptance Criteria

1. THE Practice_View SHALL 在界面上提供一个用于切换 `Favorite_Flag` 的控件，该控件呈现"已收藏"与"未收藏"两种状态，且两种状态在视觉上彼此可区分。
2. WHEN 用户在 `Practice_View` 中触发收藏切换控件，THE Extension SHALL 将该 `Question` 的 `Favorite_Flag` 取反并通过 `Storage` 持久化新值；持久化与控件状态更新 SHALL 在 1 秒内完成，`Question_List_View` 中该 `Question` 列表项的视觉标识 SHALL 在 1 秒内同步更新为新值对应的样式。
3. IF `Storage` 持久化 `Favorite_Flag` 失败，THEN THE Extension SHALL 弹出错误提示，且将收藏控件状态回滚至变更前的取值。
4. WHEN 一个 `Question` 的 `Favorite_Flag` 变更并已成功持久化，THE Question_List_View SHALL 在该 `Question` 对应的列表项上展示与新 `Favorite_Flag` 一致的视觉标识。
5. WHILE `Storage` 中存在某道 `Question` 关联的 `Favorite_Flag` 记录，THE Practice_View SHALL 在打开该题目时按 `Storage` 中保存的 `Favorite_Flag` 渲染收藏控件状态。
6. IF `Storage` 中不存在某道 `Question` 关联的 `Favorite_Flag` 记录或加载失败，THEN THE Practice_View SHALL 将该 `Question` 的 `Favorite_Flag` 视为 `false` 并据此渲染收藏控件状态。

### Requirement 9: 掌握状态标记

**User Story:** 作为用户，我希望为每道题目标记掌握状态，以便区分已经掌握的题与还需要继续练习的题。

#### Acceptance Criteria

1. THE Practice_View SHALL 提供一个用于设置 `Mastery_Status` 的控件，该控件允许且仅允许设置 `{unlearned, learning, mastered, not_mastered}` 集合中的取值。
2. WHEN 用户在 `Practice_View` 中将某道 `Question` 的 `Mastery_Status` 设置为某个新值 V，THE Extension SHALL 通过 `Storage` 将该 `Question` 关联的 `Mastery_Status` 持久化为 V，且本条标准在持久化成功后视为完成。
3. WHEN 用户将某道 `Question` 的 `Mastery_Status` 设置为 `not_mastered`，THE Extension SHALL 同时将该 `Question` 的 `Wrong_Flag` 置为 `true` 并通过 `Storage` 持久化，且本条标准在持久化成功后视为完成。
4. WHEN 用户将某道 `Question` 的 `Mastery_Status` 设置为 `mastered`，THE Extension SHALL 同时将该 `Question` 的 `Wrong_Flag` 置为 `false` 并通过 `Storage` 持久化，且本条标准在持久化成功后视为完成。
5. WHEN 一个 `Question` 的 `Mastery_Status` 变更并已成功持久化，THE Question_List_View SHALL 在该 `Question` 对应的列表项上展示该 `Mastery_Status` 对应的视觉标识，且 `{unlearned, learning, mastered, not_mastered}` 四种取值的视觉标识彼此可区分（视觉标识与取值之间为单射）。
6. IF `Storage` 中不存在某道 `Question` 关联的 `Mastery_Status`，THEN THE Extension SHALL 将其视为 `unlearned`。
7. IF `Storage` 持久化 `Mastery_Status` 或联动的 `Wrong_Flag` 失败，THEN THE Extension SHALL 弹出错误提示，并将该 `Question` 的 `Mastery_Status` 与 `Wrong_Flag` 回滚至变更前的取值。

### Requirement 10: 复习功能

**User Story:** 作为用户，我希望针对未掌握题、收藏题与错题分别发起复习，以便有针对性地巩固薄弱题目。

#### Acceptance Criteria

1. THE Review_View SHALL 提供三个独立入口：`复习未掌握`、`复习收藏`、`复习错题`。
2. WHEN 用户触发 `复习未掌握` 入口，THE Review_View SHALL 构造 `Review_Set`，使其包含且仅包含 `Mastery_Status` 等于 `not_mastered` 的全部 `Question`，且 `Review_Set` 中题目的顺序与 `Question_Bank` 中原序一致。
3. WHEN 用户触发 `复习收藏` 入口，THE Review_View SHALL 构造 `Review_Set`，使其包含且仅包含 `Favorite_Flag` 等于 `true` 的全部 `Question`，且 `Review_Set` 中题目的顺序与 `Question_Bank` 中原序一致。
4. WHEN 用户触发 `复习错题` 入口，THE Review_View SHALL 构造 `Review_Set`，使其包含且仅包含 `Wrong_Flag` 等于 `true` 的全部 `Question`，且 `Review_Set` 中题目的顺序与 `Question_Bank` 中原序一致。
5. WHILE `Review_Set` 非空，THE Review_View SHALL 以与 `Question_List_View` 一致的列表样式渲染 `Review_Set` 中的全部 `Question`；WHEN 用户单击其中一个列表项，THE Review_View SHALL 打开该 `Question` 对应的 `Practice_View`。
6. WHEN 用户进入任意一个复习入口，THE Review_View SHALL 对当前满足该入口条件的 `Question` 集合做一次性快照作为 `Review_Set`；WHILE 用户处于复习模式，THE Review_View SHALL 仅展示该 `Review_Set` 中的 `Question`，且不受 `Question_List_View` 的 `Filter` 设置影响。
7. WHEN 用户在复习中将某道 `Question` 的 `Mastery_Status` 改为 `mastered`，THE Extension SHALL 在下一次进入 `复习未掌握` 与 `复习错题` 时不再将该 `Question` 纳入新的 `Review_Set`。
8. IF 某个复习入口对应的 `Review_Set` 为空，THEN THE Review_View SHALL 显示一条文案，提示当前没有需要复习的题目，且不渲染任何列表项，且不打开任何 `Practice_View`。
9. IF `Review_Set` 构造期间从 `Storage` 加载数据失败，THEN THE Review_View SHALL 弹出错误提示，且不进入复习模式。

### Requirement 11: 数据持久化

**User Story:** 作为用户，我希望我的题库与所有学习数据在重启 VS Code 后仍然保留，以便长期使用插件追踪刷题进度。

#### Acceptance Criteria

1. THE Storage SHALL 持久化保存以下数据：当前已导入的 `Question_Bank`、每道 `Question` 关联的 `Learning_State`（含 `Mastery_Status`、`Favorite_Flag`、`Wrong_Flag`、`Note`）、代码题的代码内容、问答题的"我的回答"内容。
2. WHEN VS Code 启动并激活 `Extension`，THE Extension SHALL 从 `Storage` 加载第 1 条所列的全部数据。
3. IF 任意一项 `Storage` 持久化操作失败，THEN THE Extension SHALL 弹出错误提示并展示失败原因，且保留用户当前会话内的内存状态以便重试。
4. WHEN 用户导入一个新的 `Question_Bank` 并选择"覆盖已有题库"，THE Extension SHALL 删除旧 `Question_Bank` 中所有 `Question` 关联的 `Learning_State`、代码内容与"我的回答"内容，再保存新的 `Question_Bank`。
5. IF `Storage` 加载失败，THEN THE Extension SHALL 弹出错误提示并以空内存状态启动，且不删除 `Storage` 中已有的底层数据。
6. THE Storage SHALL 在 500 毫秒内完成单次写入操作。
