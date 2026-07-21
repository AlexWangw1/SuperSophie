# 模型配置

SuperSophie 的模型目录由服务器读取，浏览器只能看到模型名称、能力标签和是否已配置，永远看不到已保存的密钥值。工作区 owner 可在 Agent Work 的“管理模型与加密密钥”中配置 OpenAI、OpenRouter、公开 HTTPS Ollama/OpenAI-compatible endpoint 和最多 12 个自定义模型；凭据使用 `CONNECTOR_ENCRYPTION_KEY` 做 AES-256-GCM 加密并按工作区隔离。

## 内置配置

| 配置 | 环境变量 | 说明 |
| --- | --- | --- |
| OpenAI GPT-5.6 / GPT-5 mini | `OPENAI_API_KEY` | 使用 Responses API |
| OpenRouter Auto | `OPENROUTER_API_KEY` | 通过 Chat Completions-compatible API 路由多家模型 |
| Ollama Local | `OLLAMA_BASE_URL` | 例如 `http://127.0.0.1:11434/v1`；只适合本机桌面环境 |

本地环境建议使用已被 Git 忽略的 `.env.local`。部署环境可使用平台 secret 作为全局默认，也可让各工作区用加密密钥库覆盖。每次新增、更新和删除只写不含秘密的 Markdown 安全事件。

## 自定义模型

部署管理员可用 `SOPHIE_MODEL_CATALOG_JSON` 添加最多 24 个 OpenAI-compatible 配置。`apiKeyEnv` 填“保存密钥的环境变量名”，不是密钥本身。工作区界面添加的自定义模型不需要填写环境变量名，API key 会和 profile 一起加密；公开响应只返回 `hasKey`。

```json
[
  {
    "id": "company:reasoner",
    "label": "Company Reasoner",
    "provider": "Company Gateway",
    "model": "reasoner-v2",
    "capabilities": ["推理", "内部知识"],
    "apiKeyEnv": "COMPANY_AI_KEY",
    "baseURL": "https://ai.example.com/v1",
    "useResponses": false
  }
]
```

工作区自定义 endpoint 只允许公开 HTTPS 地址，并拒绝 localhost、链路本地、私有 IPv4/IPv6 和 URL 内嵌凭据，降低服务端请求伪造风险。直接使用非 OpenAI-compatible 的厂商协议仍需要对应的 Model Provider 适配器。
