type SnapshotRow = Record<string, unknown>;

function scalar(value: unknown) {
  return value === null || value === undefined ? "" : String(value);
}

function entry(kind: string, id: unknown, markdown: unknown) {
  return [
    `<!-- sophie:snapshot-entry kind=${kind} id=${scalar(id)} -->`,
    scalar(markdown).trim(),
    `<!-- /sophie:snapshot-entry -->`,
  ].join("\n");
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

export async function buildWorkspaceSnapshotMarkdown(db: D1Database) {
  const [documents, sources, views, records, codeFiles, runs, events, conversations, messages, outbox, assets] = await Promise.all([
    db.prepare(`SELECT * FROM documents WHERE workspace_id = 'default' ORDER BY updated_at`).all<SnapshotRow>(),
    db.prepare(`SELECT * FROM data_sources WHERE workspace_id = 'default' ORDER BY updated_at`).all<SnapshotRow>(),
    db.prepare(`SELECT v.* FROM database_views v JOIN data_sources s ON s.id = v.data_source_id WHERE s.workspace_id = 'default' ORDER BY v.updated_at`).all<SnapshotRow>(),
    db.prepare(`SELECT r.* FROM database_records r JOIN data_sources s ON s.id = r.data_source_id WHERE s.workspace_id = 'default' ORDER BY r.updated_at`).all<SnapshotRow>(),
    db.prepare(`SELECT f.* FROM code_files f JOIN code_projects p ON p.id = f.project_id WHERE p.workspace_id = 'default' ORDER BY f.path`).all<SnapshotRow>(),
    db.prepare(`SELECT * FROM agent_runs WHERE workspace_id = 'default' ORDER BY updated_at`).all<SnapshotRow>(),
    db.prepare(`SELECT e.* FROM agent_run_events e JOIN agent_runs r ON r.id = e.run_id WHERE r.workspace_id = 'default' ORDER BY e.created_at`).all<SnapshotRow>(),
    db.prepare(`SELECT * FROM conversations WHERE workspace_id = 'default' ORDER BY updated_at`).all<SnapshotRow>(),
    db.prepare(`SELECT m.* FROM chat_messages m JOIN conversations c ON c.id = m.conversation_id WHERE c.workspace_id = 'default' ORDER BY m.created_at`).all<SnapshotRow>(),
    db.prepare(`SELECT * FROM connector_outbox WHERE workspace_id = 'default' ORDER BY created_at`).all<SnapshotRow>(),
    db.prepare(`SELECT * FROM assets ORDER BY created_at`).all<SnapshotRow>(),
  ]);
  const generatedAt = new Date().toISOString();
  const sections = [
    ["页面", documents.results.map((row) => entry("document", row.id, row.markdown))],
    ["数据源", sources.results.map((row) => entry("data-source", row.id, row.schema_markdown))],
    ["数据库视图", views.results.map((row) => entry("database-view", row.id, row.config_markdown))],
    ["数据库记录", records.results.map((row) => entry("database-record", row.id, row.markdown))],
    ["代码文件", codeFiles.results.map((row) => entry("code-file", row.id, row.content_markdown))],
    ["Agent 运行", runs.results.map((row) => entry("agent-run", row.id, [row.goal_markdown, ...events.results.filter((event) => event.run_id === row.id).map((event) => event.content_markdown)].join("\n\n")))],
    ["对话", conversations.results.map((row) => entry("conversation", row.id, conversationMarkdown(row, messages.results)))],
    ["连接器发件箱", outbox.results.map((row) => entry("connector-outbox", row.id, row.payload_markdown))],
    ["资源清单", assets.results.map((row) => entry("asset-manifest", row.id, `- name: ${scalar(row.name)}\n- mime: ${scalar(row.mime)}\n- sha256: ${scalar(row.sha256)}\n- r2Key: ${scalar(row.r2_key)}`))],
  ] as const;
  return [
    "---",
    "sophie: 1",
    "kind: workspace-snapshot",
    "workspaceId: default",
    `generatedAt: ${generatedAt}`,
    "credentialsIncluded: false",
    "---",
    "",
    "# SuperSophie 工作区快照",
    "",
    "此文件保存 Markdown 真相源与资源清单；连接器密钥、OAuth 令牌和模型密钥从不写入快照。",
    "",
    ...sections.flatMap(([title, entries]) => [`## ${title}`, "", ...(entries.length ? entries : ["_暂无内容_", ""]), ""]),
  ].join("\n");
}
