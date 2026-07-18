# Agent Runtime

## 运行契约

`POST /api/chat` 接收：

```json
{
  "message": "用户目标",
  "conversationId": "可选 UUID",
  "mode": "auto | chat | team",
  "modelId": "可选模型配置 ID",
  "history": [{ "role": "user", "content": "..." }]
}
```

- `chat`：一个 Sophie Agent 直接回答，适合对话、解释和小型整理。
- `team`：规划 Agent 生成结构化团队规格；服务器据此创建 1–4 个专家 Agent 并行工作；Sophie Lead 综合产物并拥有最终回复。
- `auto`：根据目标是否需要多种独立交付物选择上述模式。用户可用 `/team` 强制团队运行。

外部发送、删除、支付等副作用不在当前 Agent 工具集中。连接器消息必须先进入 Markdown outbox 并等待人工审核。

## 状态与 Markdown

结构化表只承担查询和运行索引：

- `conversations` / `chat_messages`：对话索引和单条消息。
- `agent_runs` / `agent_run_events`：父子 Agent、状态与事件索引。
- `documents`：对应的完整 `conversation` 与 `agent-run` Markdown 文档，是可移植内容真源。

每次团队运行会保存目标、团队策略、成功标准、专家角色/模型/交付物、专家原始产物与 Sophie 最终回复。API key 和 OAuth token 永不进入这些文档。

## 可观测行为

运行成功时，主页返回真实模型回复；团队运行附带 `run.team` 和 `run.specialists`，Agent Work 页面据此渲染动态团队。模型未配置时 API 返回 `MODEL_NOT_CONFIGURED`，不会退回伪造回复。
