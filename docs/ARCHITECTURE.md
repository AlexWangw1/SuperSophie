# SuperSophie 架构

```text
Block editor / Database views / Agent work / Code / Connectors
                              |
                    Markdown document model
                 (frontmatter + stable block ids)
                  /                           \
        Local offline replica             Sync service
       (IndexedDB + .sophie)          (revision + content hash)
                                              |
                              D1 indexes + Markdown / R2 blobs
                                              |
                              OneDrive / App Cloud / self-hosted
```

## 核心实体

- `documents`：页面、数据库条目、Agent 计划和消息草稿。`markdown` 是正文真源，`properties_json` 是从 frontmatter 派生的查询索引。
- `agent_runs`：目标、计划、状态、父子 Agent 关系、模型与审批状态；详细过程写回 Markdown 日志。
- `connector_outbox`：待审阅/待发送/已发送/失败的消息。消息正文仍是 Markdown。
- `assets`：附件的名称、类型、哈希和 R2 key；二进制不进入 D1。

## 同步协议

1. 每次本地修改生成递增 revision 与 SHA-256。
2. 客户端先写本地副本，再尝试推送云端。
3. 服务端以 `baseRevision` 做乐观并发控制。
4. 不冲突则提交并返回新 revision；冲突时保留双方 Markdown，块 ID 用于三方合并。
5. 附件按哈希去重，元数据与页面提交分离。

## `.sophie` v1

首行固定为 `SOPHIE/1`，其后为 UTF-8 JSON 容器：

- `manifest`：包 ID、版本、导出时间、页面 ID、内容哈希。
- `page`：标题、Markdown、块索引、属性与 revision。
- `assets`：文件名、MIME、SHA-256 与 Base64 数据。

后续版本可升级为 ZIP 容器，但必须继续识别 v1 魔数。

