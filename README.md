# SuperSophie

SuperSophie 是一个 Markdown-first、离线优先的个人智能工作空间。主页面是可切换语音/文字的 Sophie 对话界面；复杂目标会进入 Agent Work，由 Sophie 规划并动态创建专家团队。

当前实现包含：

- 真实的 OpenAI Agents SDK 对话与多 Agent 运行链路
- 对话、团队计划、专家产物和最终回复的 Markdown 持久化
- Markdown 块编辑器与 `.sophie` 离线包导入/导出
- 11 种数据库视图的产品界面
- 多模型目录：OpenAI、OpenRouter、Ollama 和自定义 OpenAI-compatible endpoint
- App Cloud revision 代码编辑器、桌面受限本地项目编辑/验证，以及 Agent 真实审阅
- OneDrive OAuth、加密刷新令牌与工作区 Markdown 快照，及 App Cloud D1/R2 同步
- D1 文档索引、R2 附件存储与 IndexedDB 离线副本
- Windows Electron 主程序、托盘与桌面宠物

## 本地运行

```powershell
pnpm install
pnpm dev
```

在线模型调用至少需要一个受支持的密钥。密钥只放在忽略的本地环境文件或托管平台秘密变量中；不要写入 Markdown、`.sophie` 文件或 Git。配置见 [`docs/MODEL_CONFIGURATION.md`](docs/MODEL_CONFIGURATION.md)。

## 验证

```powershell
pnpm exec tsc --noEmit
pnpm lint
pnpm test
```

产品范围见 [`docs/PRODUCT_SPEC.md`](docs/PRODUCT_SPEC.md)，架构与同步约定见 [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md)，连接器配置见 [`docs/CONNECTORS.md`](docs/CONNECTORS.md)，代码工作台见 [`docs/CODE_WORKBENCH.md`](docs/CODE_WORKBENCH.md)。
