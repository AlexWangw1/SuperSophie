export const WORKSPACE_SNAPSHOT_VERSION = 2;

export type WorkspaceSnapshotEntry = {
  kind: string;
  id: string;
  data: Record<string, unknown>;
  markdown: string;
};

export type WorkspaceSnapshot = {
  version: number;
  workspaceId: string;
  generatedAt: string;
  entries: WorkspaceSnapshotEntry[];
};

type SnapshotRow = Record<string, unknown>;

function scalar(value: unknown) {
  return value === null || value === undefined ? "" : String(value);
}

function encodeBase64Url(value: string) {
  const bytes = new TextEncoder().encode(value);
  let binary = "";
  for (let offset = 0; offset < bytes.length; offset += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + 0x8000));
  }
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function decodeBase64Url(value: string) {
  const padded = value.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(value.length / 4) * 4, "=");
  const binary = atob(padded);
  const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

function snapshotEntry(kind: string, row: SnapshotRow, markdown: unknown) {
  const metadata = encodeBase64Url(JSON.stringify(row));
  return [
    `<!-- sophie:snapshot-entry kind=${kind} id=${encodeURIComponent(scalar(row.id))} -->`,
    `<!-- sophie:snapshot-meta ${metadata} -->`,
    scalar(markdown).trim(),
    "<!-- /sophie:snapshot-entry -->",
  ].join("\n");
}

function frontmatterValue(markdown: string, key: string) {
  const match = markdown.match(new RegExp(`^${key}:\\s*(.+)$`, "m"));
  return match?.[1]?.trim().replace(/^['\"]|['\"]$/g, "") ?? "";
}

export function parseWorkspaceSnapshotMarkdown(markdown: string): WorkspaceSnapshot {
  const version = Number(frontmatterValue(markdown, "sophie"));
  const workspaceId = frontmatterValue(markdown, "workspaceId");
  const generatedAt = frontmatterValue(markdown, "generatedAt");
  if (!Number.isInteger(version) || version < 1 || !workspaceId || !generatedAt || Number.isNaN(Date.parse(generatedAt))) {
    throw new Error("OneDrive 文件不是有效的 SuperSophie 工作区快照");
  }

  const entries: WorkspaceSnapshotEntry[] = [];
  const expression = /<!-- sophie:snapshot-entry kind=([a-z-]+)(?: id=([^\s>]+))? -->\r?\n(?:<!-- sophie:snapshot-meta ([A-Za-z0-9_-]+) -->\r?\n)?([\s\S]*?)\r?\n<!-- \/sophie:snapshot-entry -->/g;
  for (const match of markdown.matchAll(expression)) {
    const kind = match[1];
    const legacyId = match[2] ? decodeURIComponent(match[2]) : "";
    let data: Record<string, unknown> = legacyId ? { id: legacyId } : {};
    if (match[3]) {
      try {
        const parsed = JSON.parse(decodeBase64Url(match[3]));
        if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("invalid metadata");
        data = parsed as Record<string, unknown>;
      } catch {
        throw new Error(`OneDrive 快照条目 ${legacyId || kind} 的元数据已损坏`);
      }
    }
    const id = scalar(data.id || legacyId);
    if (!id) throw new Error(`OneDrive 快照包含缺少 id 的 ${kind} 条目`);
    entries.push({ kind, id, data, markdown: match[4] ?? "" });
  }
  return { version, workspaceId, generatedAt, entries };
}

function conversationMarkdown(conversation: SnapshotRow, messages: SnapshotRow[]) {
  return [
    "---",
    "sophie: 1",
    `id: ${scalar(conversation.id)}`,
    "kind: conversation",
    `title: ${JSON.stringify(scalar(conversation.title))}`,
    `model: ${scalar(conversation.model_id)}`,
    `updatedAt: ${scalar(conversation.updated_at)}`,
    "---",
    "",
    ...messages.filter((message) => message.conversation_id === conversation.id).map((message) => [
      `## ${message.role === "user" ? "用户" : "Sophie"}`,
      "",
      scalar(message.content_markdown),
    ].join("\n")),
  ].join("\n");
}

function rowMarkdown(title: unknown, properties: Array<[string, unknown]>) {
  return [
    `# ${scalar(title)}`,
    "",
    ...properties.map(([name, value]) => `- ${name}: ${scalar(value)}`),
  ].join("\n");
}

export async function buildWorkspaceSnapshotMarkdown(db: D1Database, workspaceId: string) {
  const [documents, sources, propertySchemas, views, records, templates, codeProjects, codeFiles, runs, events, conversations, messages, outbox, outboxDetails, attempts, assets, tombstones] = await Promise.all([
    db.prepare(`SELECT * FROM documents WHERE workspace_id = ? ORDER BY updated_at`).bind(workspaceId).all<SnapshotRow>(),
    db.prepare(`SELECT * FROM data_sources WHERE workspace_id = ? ORDER BY updated_at`).bind(workspaceId).all<SnapshotRow>(),
    db.prepare(`SELECT p.* FROM database_property_schemas p JOIN data_sources s ON s.id = p.data_source_id WHERE s.workspace_id = ? ORDER BY p.updated_at`).bind(workspaceId).all<SnapshotRow>(),
    db.prepare(`SELECT v.* FROM database_views v JOIN data_sources s ON s.id = v.data_source_id WHERE s.workspace_id = ? ORDER BY v.updated_at`).bind(workspaceId).all<SnapshotRow>(),
    db.prepare(`SELECT r.* FROM database_records r JOIN data_sources s ON s.id = r.data_source_id WHERE s.workspace_id = ? ORDER BY r.updated_at`).bind(workspaceId).all<SnapshotRow>(),
    db.prepare(`SELECT t.* FROM database_templates t JOIN data_sources s ON s.id = t.data_source_id WHERE s.workspace_id = ? ORDER BY t.updated_at`).bind(workspaceId).all<SnapshotRow>(),
    db.prepare(`SELECT * FROM code_projects WHERE workspace_id = ? ORDER BY updated_at`).bind(workspaceId).all<SnapshotRow>(),
    db.prepare(`SELECT f.* FROM code_files f JOIN code_projects p ON p.id = f.project_id WHERE p.workspace_id = ? ORDER BY f.path`).bind(workspaceId).all<SnapshotRow>(),
    db.prepare(`SELECT * FROM agent_runs WHERE workspace_id = ? ORDER BY updated_at`).bind(workspaceId).all<SnapshotRow>(),
    db.prepare(`SELECT e.* FROM agent_run_events e JOIN agent_runs r ON r.id = e.run_id WHERE r.workspace_id = ? ORDER BY e.created_at`).bind(workspaceId).all<SnapshotRow>(),
    db.prepare(`SELECT * FROM conversations WHERE workspace_id = ? ORDER BY updated_at`).bind(workspaceId).all<SnapshotRow>(),
    db.prepare(`SELECT m.* FROM chat_messages m JOIN conversations c ON c.id = m.conversation_id WHERE c.workspace_id = ? ORDER BY m.created_at`).bind(workspaceId).all<SnapshotRow>(),
    db.prepare(`SELECT * FROM connector_outbox WHERE workspace_id = ? ORDER BY created_at`).bind(workspaceId).all<SnapshotRow>(),
    db.prepare(`SELECT d.* FROM connector_outbox_details d JOIN connector_outbox o ON o.id = d.outbox_id WHERE o.workspace_id = ? ORDER BY d.outbox_id`).bind(workspaceId).all<SnapshotRow>(),
    db.prepare(`SELECT a.* FROM connector_delivery_attempts a JOIN connector_outbox o ON o.id = a.outbox_id WHERE o.workspace_id = ? ORDER BY a.created_at`).bind(workspaceId).all<SnapshotRow>(),
    db.prepare(`SELECT a.* FROM assets a JOIN asset_ownership o ON o.asset_id = a.id WHERE o.workspace_id = ? ORDER BY a.created_at`).bind(workspaceId).all<SnapshotRow>(),
    db.prepare(`SELECT * FROM workspace_tombstones WHERE workspace_id = ? ORDER BY deleted_at`).bind(workspaceId).all<SnapshotRow>(),
  ]);
  const generatedAt = new Date().toISOString();
  const sections = [
    ["页面", documents.results.map((row) => snapshotEntry("document", row, row.markdown))],
    ["数据源", sources.results.map((row) => snapshotEntry("data-source", row, row.schema_markdown))],
    ["数据库属性", propertySchemas.results.map((row) => snapshotEntry("database-property-schema", { ...row, id: row.data_source_id }, row.schema_markdown))],
    ["数据库视图", views.results.map((row) => snapshotEntry("database-view", row, row.config_markdown))],
    ["数据库记录", records.results.map((row) => snapshotEntry("database-record", row, row.markdown))],
    ["数据库模板", templates.results.map((row) => snapshotEntry("database-template", row, row.template_markdown))],
    ["代码项目", codeProjects.results.map((row) => snapshotEntry("code-project", row, rowMarkdown(row.name, [["updatedAt", row.updated_at]])))],
    ["代码文件", codeFiles.results.map((row) => snapshotEntry("code-file", row, row.content_markdown))],
    ["Agent 运行", runs.results.map((row) => snapshotEntry("agent-run", row, rowMarkdown(row.name, [["goal", row.goal_markdown], ["status", row.status], ["model", row.model]])))],
    ["Agent 事件", events.results.map((row) => snapshotEntry("agent-event", row, row.content_markdown))],
    ["对话", conversations.results.map((row) => snapshotEntry("conversation", row, conversationMarkdown(row, messages.results)))],
    ["对话消息", messages.results.map((row) => snapshotEntry("chat-message", row, row.content_markdown))],
    ["连接器发件箱", outbox.results.map((row) => snapshotEntry("connector-outbox", row, row.payload_markdown))],
    ["发件目标", outboxDetails.results.map((row) => snapshotEntry("connector-outbox-detail", { ...row, id: row.outbox_id }, rowMarkdown(row.outbox_id, [["target", row.target], ["metadata", row.metadata_json]])))],
    ["发送回执", attempts.results.map((row) => snapshotEntry("connector-delivery-attempt", row, row.response_markdown))],
    ["删除墓碑", tombstones.results.map((row) => snapshotEntry("tombstone", row, row.details_markdown))],
    ["资源清单", assets.results.map((row) => snapshotEntry("asset-manifest", row, rowMarkdown(row.name, [["mime", row.mime], ["size", row.size], ["sha256", row.sha256], ["r2Key", row.r2_key]])))],
  ] as const;
  return [
    "---",
    `sophie: ${WORKSPACE_SNAPSHOT_VERSION}`,
    "kind: workspace-snapshot",
    `workspaceId: ${workspaceId}`,
    `generatedAt: ${generatedAt}`,
    "credentialsIncluded: false",
    "---",
    "",
    "# SuperSophie 工作区快照",
    "",
    "此 Markdown 文件是可恢复、可合并的工作区真相源。连接器密钥、OAuth 令牌和模型密钥永不写入快照；附件清单以 SHA-256 校验，附件字节由 App Cloud R2 与已连接的 OneDrive 内容寻址副本共同保存。",
    "",
    ...sections.flatMap(([title, entries]) => [`## ${title}`, "", ...(entries.length ? entries : ["_暂无内容_", ""]), ""]),
  ].join("\n");
}
