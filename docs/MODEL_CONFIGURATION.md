# 模型配置

SuperSophie 的模型目录由服务器读取，浏览器只能看到模型名称、能力标签和是否已配置，永远看不到密钥值。

## 内置配置

| 配置 | 环境变量 | 说明 |
| --- | --- | --- |
| OpenAI GPT-5.6 / GPT-5 mini | `OPENAI_API_KEY` | 使用 Responses API |
| OpenRouter Auto | `OPENROUTER_API_KEY` | 通过 Chat Completions-compatible API 路由多家模型 |
| Ollama Local | `OLLAMA_BASE_URL` | 例如 `http://127.0.0.1:11434/v1`；只适合本机桌面环境 |

本地环境建议使用已被 Git 忽略的 `.env.local`。部署环境使用平台的 secret 管理功能。

## 自定义模型

`SOPHIE_MODEL_CATALOG_JSON` 可添加最多 24 个 OpenAI-compatible 配置。`apiKeyEnv` 填“保存密钥的环境变量名”，不是密钥本身。

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

直接使用非 OpenAI-compatible 的厂商协议需要对应的 Model Provider 适配器；当前版本不把“界面中可见”冒充为“已经连通”。
