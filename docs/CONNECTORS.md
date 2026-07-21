# 连接器配置与审批边界

SuperSophie 的社交消息不会由 Agent 自动外发。每条消息先以 Markdown 进入 `connector_outbox`，只有用户在连接器页面点击“批准并发送”后才会执行网络请求。

状态机：

```text
review → approved → sending → sent
   └──── rejected       └──── failed → approved（重新审核）
```

条件更新保证同一条已批准消息只能被一个发送请求认领。每次成功或失败都会生成 Markdown 回执；已发送和发送中的审计记录不能删除。模型密钥、Bot Token、Webhook key 和 OAuth 令牌不进入回执、页面 Markdown、OneDrive 快照或 `.sophie` 文件。Telegram、企业微信和 QQ 凭据既可由部署环境提供，也可在连接器页面按工作区加密保存；工作区配置优先，浏览器永远读不回明文。

## Telegram

服务端环境变量：

```text
TELEGRAM_BOT_TOKEN=<BotFather 颁发的 token>
```

目标填写数字 `chat_id` 或 `@channel_username`。当前版本使用 Telegram 官方 HTTP Bot API `sendMessage`；Markdown 真相源以纯文本传输，避免未经转义的格式字符导致整条消息被拒绝。

官方文档：https://core.telegram.org/bots/api

## 微信

当前安全实现是企业微信官方群机器人，不接入个人微信号的非官方协议。

```text
WECHAT_WORK_WEBHOOK_URL=https://qyapi.weixin.qq.com/cgi-bin/webhook/send?key=...
```

服务端会校验 HTTPS、`qyapi.weixin.qq.com` 主机、固定路径和 `key` 参数，拒绝任意 Webhook 主机。目标群由 Webhook 本身决定，页面中的目标字段是供人工审核的群备注。

企业微信机器人配置：https://developer.work.weixin.qq.com/document/path/91770

## QQ

```text
QQ_BOT_APP_ID=<QQ 开放平台 AppID>
QQ_BOT_CLIENT_SECRET=<QQ 开放平台 ClientSecret>
```

目标填写从 QQ 机器人事件取得的用户或群 `openid`，并选择单聊或群聊。服务端先从 `https://bots.qq.com/app/getAppAccessToken` 取得短期调用凭证，再调用 QQ 官方 OpenAPI；长期 `ClientSecret` 不返回浏览器。

- 鉴权：https://bot.q.qq.com/wiki/develop/api-v2/dev-prepare/interface-framework/api-use.html
- 发送消息：https://bot.q.qq.com/wiki/develop/api-v2/server-inter/message/send-receive/send.html

QQ 平台自身的主动消息频次、用户授权和群设置仍然生效，SuperSophie 不绕过平台规则。

## OneDrive

在 Microsoft Entra 注册“Web”应用，并添加回调地址：

```text
https://你的域名/api/connectors/onedrive/callback
```

本地开发对应 `http://localhost:端口/api/connectors/onedrive/callback`。配置：

```text
ONEDRIVE_CLIENT_ID=<Application client ID>
ONEDRIVE_CLIENT_SECRET=<Web app client secret>
ONEDRIVE_TENANT=common
CONNECTOR_ENCRYPTION_KEY=<32 字节随机值的 Base64>
```

生成新的加密密钥（只把输出放到服务端 secret 管理，不要提交 Git）：

```powershell
$connectorKeyBytes = [byte[]]::new(32)
[System.Security.Cryptography.RandomNumberGenerator]::Fill($connectorKeyBytes)
[Convert]::ToBase64String($connectorKeyBytes)
```

同一个 `CONNECTOR_ENCRYPTION_KEY` 同时保护 OneDrive OAuth、工作区模型密钥和社交机器人凭据。已有密文后不要直接轮换此主密钥；应先实现重加密迁移，否则旧凭据将无法解密。

授权采用 OAuth 2.0 authorization code + PKCE，申请 `offline_access Files.ReadWrite User.Read`。访问令牌和刷新令牌使用 AES-256-GCM 加密后保存在 `connector_credentials`，过期时会轮换刷新令牌。

“双向同步”读取根目录 `SuperSophie-workspace-*-latest.md`，验证工作区 ID，按 revision 和更新时间合并页面、数据库、代码、Agent 运行、对话与发件箱，再写回统一的 v2 Markdown 快照：

- 远端 revision 更高时导入；本地更高时保留本地并写回。
- 同一 revision 内容不同，不选择任一方覆盖，而是把两份 Markdown 写入 `connector_sync_conflicts`。
- 用户可在连接器页面逐项“保留 App Cloud”或“采用 OneDrive”。
- 删除以 `workspace_tombstones` 墓碑传播，较新的修改不会被较旧删除覆盖。
- 写回携带读取到的 eTag；同步期间远端改变会重新读取并重试。
- v1 旧快照先另存归档，再升级为 v2；凭据始终不进入快照。
- 页面附件先以稳定公开 ID 和 SHA-256 写入 App Cloud R2；同步时再以 `workspace + SHA-256` 内容寻址文件镜像到 OneDrive。
- 新设备按 Markdown 清单下载附件，下载 URL 不携带 OAuth Bearer Token，并在写入 R2 前同时核对大小与 SHA-256；R2 缺失时可由 OneDrive 自动修复。
- OneDrive 中的附件是不可变内容寻址副本；删除页面不会立即清理远端孤立字节，避免另一台离线设备仍引用附件时发生不可恢复的数据丢失。

- OAuth 授权码流程：https://learn.microsoft.com/en-us/entra/identity-platform/v2-oauth2-auth-code-flow
- 文件下载：https://learn.microsoft.com/en-us/graph/api/driveitem-get-content?view=graph-rest-1.0
- 小文件上传：https://learn.microsoft.com/en-us/graph/api/driveitem-put-content?view=graph-rest-1.0

## 当前边界

- 已实现：Telegram、企业微信、QQ 的审核后出站；OneDrive OAuth、双向 Markdown 合并、附件字节镜像、删除墓碑和人工冲突处理；App Cloud D1/R2；多账户、工作区和设备会话隔离。
- 尚未实现：社交平台入站事件、Chat SDK webhook、后台自动增量触发和自托管 S3/WebDAV 适配器。
- Chat SDK 已作为未来入站机器人层完成技术评估，但当前出站场景直接使用各平台官方 API，减少不必要的状态依赖。
