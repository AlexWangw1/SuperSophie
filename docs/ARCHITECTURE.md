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
- `connector_outbox` + `connector_outbox_details`：待审阅/已批准/发送中/已发送/失败/驳回的消息及目标。消息正文仍是 Markdown。
- `connector_delivery_attempts`：不可变的成功/失败 Markdown 回执，不保存凭据。
- `connector_credentials`：按工作区使用 AES-256-GCM 加密的 OAuth、模型和社交连接凭据；浏览器只能读取配置状态，不能读回秘密值。
- `connector_sync_events`：OneDrive 等外部存储的同步回执。
- `connector_sync_conflicts`：同一修订出现不同内容时保存 App Cloud 与 OneDrive 两份 Markdown，直到用户明确选择。
- `database_templates`：按数据源保存标题、属性预设和 Markdown 正文；与记录一样使用 revision、删除墓碑和 OneDrive 快照。
- `workspace_tombstones`：记录删除的实体、修订和时间，使删除操作也能跨设备传播。
- `code_projects` + `code_files`：跨设备代码项目；`content_markdown` 是真相源，`content_text` 是编辑派生值，revision 阻止静默覆盖。
- `assets`：附件的名称、类型、哈希和 R2 key；二进制不进入 D1。

## 同步协议

1. 每次本地修改生成递增 revision；离线包与附件同时保存 SHA-256。
2. 客户端先写本地副本，再尝试推送云端。
3. 服务端以 `baseRevision` 做乐观并发控制。
4. 不冲突则提交并返回新 revision；同一 revision 内容不同时保留双方 Markdown，由用户选择 App Cloud 或 OneDrive。
5. 附件按哈希去重，元数据与页面提交分离。
6. 删除写入 Markdown 墓碑；较新的修改可以复活条目，较新的删除会从另一端移除条目。
7. OneDrive 同步先读取远端 v2 快照，按父子依赖和 revision 合并，再以读取到的 eTag 条件写回；并发改写会重试，不静默覆盖。

App Cloud 由 D1/R2 提供跨设备主副本；OneDrive 由用户明确触发双向 Markdown 合并。v1 旧快照在首次 v2 同步前会另存归档。附件字节以 SHA-256 内容寻址方式在 App Cloud R2 与 OneDrive 间校验镜像，新设备可按 Markdown 清单恢复缺失附件。

## `.sophie` v1

首行固定为 `SOPHIE/1`，其后为 UTF-8 JSON 容器：

- `manifest`：包 ID、版本、导出时间、页面 ID、内容哈希。
- `page`：标题、Markdown、块索引、属性与 revision。
- `assets`：稳定附件 ID、文件名、MIME、大小、SHA-256 与 Base64 数据；页面的图片/文件块通过 ID 引用。

读取器会同时验证页面 Markdown 哈希、块结构重建结果、附件逐项 SHA-256、附件清单哈希与引用完整性。旧版 v1 空附件页面包继续可读。单附件限制 32 MB、附件合计 64 MB、容器解析限制 96 MB。

后续版本可升级为 ZIP 容器，但必须继续识别 v1 魔数。
