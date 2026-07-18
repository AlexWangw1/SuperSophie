# 代码工作台

代码工作台不再使用内存示例或伪造终端输出，分为两种明确模式。

## App Cloud 模式

- `code_projects` 保存项目元数据。
- `code_files.content_markdown` 是代码文件的 Markdown 包装真相源，包含 frontmatter、路径、语言、revision 与动态长度代码围栏。
- `content_text` 是编辑器使用的派生文本。
- 保存使用 `baseRevision` 乐观并发控制；另一设备已经更新时返回 `409 REVISION_CONFLICT`，不会静默覆盖。
- 支持创建、编辑、保存和精确删除代码文件。
- 代码文件会进入 OneDrive 工作区 Markdown 快照。

网页端不执行代码，也不会展示伪造的“测试通过”日志。

## 桌面本地模式

用户必须通过系统目录选择器明确授权一个本地项目。Electron 主进程执行所有文件操作，渲染页没有 Node.js 权限。

安全边界：

- 只列出常见文本/代码扩展名，最多 500 个文件、单文件最多 2 MB。
- 忽略 `.git`、`node_modules`、构建目录和符号链接。
- 所有路径必须位于已授权目录内；同时使用 `realpath` 拦截通过符号链接越界。
- 保存前比较 SHA-256，外部程序已修改文件时拒绝覆盖。
- 使用同目录临时文件 + rename 原子写入，失败时清理临时文件。
- 只允许固定命令 `test`、`typecheck`、`lint`，不接受任意 shell 文本；最长运行 5 分钟，输出上限 1 MB。
- IPC 只接受正式产品域名或桌面开发地址 `http://localhost:3000` 的渲染页。

“让 Agent 审阅当前文件”调用真实 `/api/chat` 团队模式并生成 Agent Run；它只提供建议，不声称已修改文件。模型未配置时会显示真实错误。
