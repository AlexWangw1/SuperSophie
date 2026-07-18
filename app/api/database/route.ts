import { env } from "cloudflare:workers";
import { z } from "zod";
import { ensureSchema } from "../../../db/ensure";

const SOURCE_ID = "product-tasks";
const viewTypes = ["table", "board", "timeline", "calendar", "list", "gallery", "chart", "map", "feed", "dashboard", "form"] as const;

const defaultRecords = [
  { id: "T-108", title: "完成 .sophie 离线包导入", status: "In progress", priority: "High", due: "7月18日", day: 18, owner: "SC", tags: ["Offline", "Core"], progress: 68, x: 62, y: 38 },
  { id: "T-109", title: "设计块级冲突合并协议", status: "Review", priority: "High", due: "7月19日", day: 19, owner: "MZ", tags: ["Sync"], progress: 86, x: 35, y: 56 },
  { id: "T-110", title: "Telegram 消息适配器", status: "Inbox", priority: "Medium", due: "7月21日", day: 21, owner: "JL", tags: ["Connector"], progress: 12, x: 76, y: 64 },
  { id: "T-111", title: "数据库公式解析器", status: "In progress", priority: "Medium", due: "7月22日", day: 22, owner: "SC", tags: ["Database"], progress: 44, x: 48, y: 74 },
  { id: "T-112", title: "移动端块操作菜单", status: "Done", priority: "Low", due: "7月16日", day: 16, owner: "RQ", tags: ["Mobile"], progress: 100, x: 23, y: 30 },
  { id: "T-113", title: "OneDrive 增量同步验证", status: "Review", priority: "High", due: "7月24日", day: 24, owner: "MZ", tags: ["Sync", "Cloud"], progress: 78, x: 66, y: 79 },
];

const sourceSchemaMarkdown = `# 产品任务数据源

| 属性 | 类型 | 说明 |
| --- | --- | --- |
| title | Title | 每条记录同时是一张 Markdown 页面 |
| status | Status | Inbox / In progress / Review / Done |
| priority | Select | High / Medium / Low |
| due | Date | 截止日期 |
| owner | Person | 负责人 |
| tags | Multi-select | 标签 |
| progress | Number | 0–100 进度 |
| place | Place | 地图坐标或地址 |
`;

function safeJson<T>(source: string, fallback: T): T {
  try { return JSON.parse(source) as T; } catch { return fallback; }
}

function recordMarkdown(id: string, title: string, properties: Record<string, unknown>, body?: string, sourceId = SOURCE_ID) {
  const propertyLines = Object.entries(properties).map(([key, value]) => `  ${key}: ${JSON.stringify(value)}`).join("\n");
  return `---\nsophie: 1\nid: ${id}\nkind: database-item\ndataSourceId: ${sourceId}\nproperties:\n${propertyLines}\n---\n\n# ${title}\n\n<!-- sophie:block=${id}-body type=text -->\n${body?.trim() || ""}\n`;
}

function viewConfigMarkdown(type: string, config: Record<string, unknown>) {
  return `# ${type} view\n\n\`\`\`json\n${JSON.stringify(config, null, 2)}\n\`\`\`\n`;
}

async function ensureDefaultDatabase() {
  await ensureSchema();
  const existingSource = await env.DB.prepare(
    `SELECT id FROM data_sources WHERE id = ? AND workspace_id = 'default'`,
  ).bind(SOURCE_ID).first();
  await env.DB.prepare(
    `INSERT OR IGNORE INTO data_sources (id, workspace_id, name, schema_markdown)
     VALUES (?, 'default', '产品任务', ?)`,
  ).bind(SOURCE_ID, sourceSchemaMarkdown).run();

  for (const type of viewTypes) {
    const config = {
      visibleProperties: ["status", "priority", "owner", "due", "progress", "tags"],
      filters: null,
      sorts: [],
      groupBy: type === "board" ? "status" : null,
      subGroupBy: null,
      openPagesIn: type === "calendar" || type === "gallery" ? "center-peek" : "side-peek",
    };
    await env.DB.prepare(
      `INSERT OR IGNORE INTO database_views
        (id, data_source_id, name, view_type, config_markdown, config_json)
       VALUES (?, ?, ?, ?, ?, ?)`,
    ).bind(`${SOURCE_ID}:${type}`, SOURCE_ID, type, type, viewConfigMarkdown(type, config), JSON.stringify(config)).run();
  }

  if (!existingSource) {
    for (const record of defaultRecords) {
      const { id, title, ...properties } = record;
      await env.DB.prepare(
        `INSERT INTO database_records
          (id, data_source_id, title, markdown, properties_json)
         VALUES (?, ?, ?, ?, ?)`,
      ).bind(id, SOURCE_ID, title, recordMarkdown(id, title, properties), JSON.stringify(properties)).run();
    }
  }
}

const RecordActionSchema = z.object({
  action: z.literal("upsert-record"),
  sourceId: z.string().min(1).max(120).default(SOURCE_ID),
  record: z.object({
    id: z.string().min(1).max(120).optional(),
    title: z.string().trim().min(1).max(500),
    body: z.string().max(100_000).optional(),
    properties: z.record(z.string(), z.unknown()),
    baseRevision: z.number().int().positive().optional(),
  }),
});

const ViewActionSchema = z.object({
  action: z.literal("save-view"),
  view: z.object({
    id: z.string().min(1).max(160),
    name: z.string().min(1).max(100),
    type: z.enum(viewTypes),
    sourceId: z.string().min(1).max(120).default(SOURCE_ID),
    config: z.record(z.string(), z.unknown()),
    baseRevision: z.number().int().positive().optional(),
  }),
});

const ActionSchema = z.discriminatedUnion("action", [RecordActionSchema, ViewActionSchema]);

export async function GET(request: Request) {
  try {
    await ensureDefaultDatabase();
    const sourceId = new URL(request.url).searchParams.get("sourceId") || SOURCE_ID;
    const source = await env.DB.prepare(
      `SELECT id, name, schema_markdown AS schemaMarkdown, revision, updated_at AS updatedAt
       FROM data_sources WHERE id = ? AND workspace_id = 'default'`,
    ).bind(sourceId).first();
    if (!source) return Response.json({ error: "data_source_not_found" }, { status: 404 });
    const [views, records] = await Promise.all([
      env.DB.prepare(
        `SELECT id, name, view_type AS type, config_json AS configJson, revision, updated_at AS updatedAt
         FROM database_views WHERE data_source_id = ? ORDER BY created_at`,
      ).bind(sourceId).all<{ id: string; name: string; type: string; configJson: string; revision: number; updatedAt: string }>(),
      env.DB.prepare(
        `SELECT id, title, markdown, properties_json AS propertiesJson, revision,
          created_at AS createdAt, updated_at AS updatedAt
         FROM database_records WHERE data_source_id = ? ORDER BY created_at`,
      ).bind(sourceId).all<{ id: string; title: string; markdown: string; propertiesJson: string; revision: number; createdAt: string; updatedAt: string }>(),
    ]);
    return Response.json({
      source,
      views: views.results.map((view) => ({ ...view, config: safeJson(view.configJson, {}), configJson: undefined })),
      records: records.results.map((record) => ({ ...record, properties: safeJson(record.propertiesJson, {}), propertiesJson: undefined })),
    });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Unable to load database" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    await ensureDefaultDatabase();
    const parsed = ActionSchema.safeParse(await request.json());
    if (!parsed.success) return Response.json({ error: "invalid_database_action", details: parsed.error.flatten() }, { status: 400 });
    if (parsed.data.action === "upsert-record") {
      const { sourceId, record } = parsed.data;
      const id = record.id ?? crypto.randomUUID();
      const existing = await env.DB.prepare(
        `SELECT revision FROM database_records WHERE id = ? AND data_source_id = ?`,
      ).bind(id, sourceId).first<{ revision: number }>();
      if (existing && record.baseRevision !== undefined && existing.revision !== record.baseRevision) {
        return Response.json({ error: "revision_conflict", currentRevision: existing.revision }, { status: 409 });
      }
      const nextRevision = (existing?.revision ?? 0) + 1;
      const markdown = recordMarkdown(id, record.title, record.properties, record.body, sourceId);
      await env.DB.prepare(
        `INSERT INTO database_records
          (id, data_source_id, title, markdown, properties_json, revision)
         VALUES (?, ?, ?, ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET
           title = excluded.title,
           markdown = excluded.markdown,
           properties_json = excluded.properties_json,
           revision = excluded.revision,
           updated_at = CURRENT_TIMESTAMP`,
      ).bind(id, sourceId, record.title, markdown, JSON.stringify(record.properties), nextRevision).run();
      return Response.json({ id, revision: nextRevision, markdown, updatedAt: new Date().toISOString() }, { status: existing ? 200 : 201 });
    }

    const { view } = parsed.data;
    const existing = await env.DB.prepare(
      `SELECT revision FROM database_views WHERE id = ? AND data_source_id = ?`,
    ).bind(view.id, view.sourceId).first<{ revision: number }>();
    if (existing && view.baseRevision !== undefined && existing.revision !== view.baseRevision) {
      return Response.json({ error: "revision_conflict", currentRevision: existing.revision }, { status: 409 });
    }
    const nextRevision = (existing?.revision ?? 0) + 1;
    await env.DB.prepare(
      `INSERT INTO database_views
        (id, data_source_id, name, view_type, config_markdown, config_json, revision)
       VALUES (?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET
         name = excluded.name,
         view_type = excluded.view_type,
         config_markdown = excluded.config_markdown,
         config_json = excluded.config_json,
         revision = excluded.revision,
         updated_at = CURRENT_TIMESTAMP`,
    ).bind(view.id, view.sourceId, view.name, view.type, viewConfigMarkdown(view.type, view.config), JSON.stringify(view.config), nextRevision).run();
    return Response.json({ id: view.id, revision: nextRevision, updatedAt: new Date().toISOString() });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Unable to save database" }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  try {
    await ensureDefaultDatabase();
    const url = new URL(request.url);
    const id = url.searchParams.get("id")?.trim();
    const sourceId = url.searchParams.get("sourceId")?.trim() || SOURCE_ID;
    if (!id) return Response.json({ error: "record_id_required" }, { status: 400 });
    const record = await env.DB.prepare(
      `SELECT id FROM database_records WHERE id = ? AND data_source_id = ?`,
    ).bind(id, sourceId).first();
    if (!record) return Response.json({ error: "record_not_found" }, { status: 404 });
    await env.DB.prepare(
      `DELETE FROM database_records WHERE id = ? AND data_source_id = ?`,
    ).bind(id, sourceId).run();
    return Response.json({ id, deleted: true });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Unable to delete database record" }, { status: 500 });
  }
}
