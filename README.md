# SuperSophie

SuperSophie 是一个 Markdown-first、离线优先的个人智能工作空间。主页面是可切换语音/文字的 Sophie 对话界面；复杂目标会进入 Agent Work，由 Sophie 规划并动态创建专家团队。

当前实现包含：

- 真实的 OpenAI Agents SDK 对话与多 Agent 运行链路
- 对话、团队计划、专家产物和最终回复的 Markdown 持久化
- 真实多页面 Markdown 知识库、搜索、页面引用、反向链接与 `.sophie` 离线包导入/导出
- 11 种数据库视图、23 种动态属性，以及安全公式、关联、汇总和按钮配置
- 多模型目录：OpenAI、OpenRouter、Ollama 和自定义 OpenAI-compatible endpoint；支持按工作区加密保存模型与社交连接密钥
- App Cloud revision 代码编辑器、桌面受限本地项目编辑/验证，以及 Agent 真实审阅
- 账户、工作区和设备会话隔离；可轮换访问密钥并撤销其他设备
- OneDrive OAuth、加密刷新令牌、冲突保留、双向 Markdown 合并与校验附件镜像，及 App Cloud D1/R2 主存储
- D1 文档索引、R2 附件存储与 IndexedDB 离线副本
- Windows Electron 主程序、托盘与桌面宠物

## 本地运行

```powershell
pnpm install
pnpm dev
```

在线模型调用至少需要一个受支持的密钥。部署默认密钥放在忽略的本地环境文件或托管平台秘密变量中；工作区 owner 也可在应用内使用 AES-256-GCM 加密密钥库配置。任何密钥都不要写入 Markdown、`.sophie` 文件或 Git。配置见 [`docs/MODEL_CONFIGURATION.md`](docs/MODEL_CONFIGURATION.md)。

## 验证

```powershell
pnpm exec tsc --noEmit
pnpm lint
pnpm test
```

产品范围见 [`docs/PRODUCT_SPEC.md`](docs/PRODUCT_SPEC.md)，架构与同步约定见 [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md)，账户与工作区见 [`docs/AUTH_AND_WORKSPACES.md`](docs/AUTH_AND_WORKSPACES.md)，连接器配置见 [`docs/CONNECTORS.md`](docs/CONNECTORS.md)，代码工作台见 [`docs/CODE_WORKBENCH.md`](docs/CODE_WORKBENCH.md)。
