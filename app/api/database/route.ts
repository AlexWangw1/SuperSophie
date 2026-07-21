import { env } from "cloudflare:workers";
import { z } from "zod";
import { ensureSchema } from "../../../db/ensure";
import { authErrorResponse, requireWorkspace } from "../../../lib/auth";
import { publicResourceId, scopedResourceId } from "../../../lib/workspace-resource";
import { clearWorkspaceTombstone, recordWorkspaceTombstone } from "../../../lib/sync-tombstones";
import {
  computeDatabaseProperties,
  databasePropertySchemaMarkdown,
  defaultProductTaskPropertySchema,
  normalizeDatabasePropertySchema,
  normalizeDatabasePropertyValues,
  type DatabasePropertySchema,
} from "../../../lib/database/properties";
import { DATABASE_CONDITIONAL_COLORS } from "../../../lib/database/query";

const SOURCE_KEY = "product-tasks";
const viewTypes = ["table", "board", "timeline", "calendar", "list", "gallery", "chart", "map", "feed", "dashboard", "form"] as const;
const filterOperators = ["equals", "not_equals", "contains", "not_contains", "starts_with", "ends_with", "greater_than", "less_than", "on_or_after", "on_or_before", "is_empty", "is_not_empty"] as const;
const DatabaseValueSchema = z.union([z.string().max(10_000), z.number().finite(), z.boolean(), z.array(z.string().max(1_000)).max(100), z.null()]);
const FilterConditionSchema = z.object({
  type: z.literal("condition"),
  property: z.string().min(1).max(120),
  operator: z.enum(filterOperators),
  value: DatabaseValueSchema.optional(),
});
const FilterGroupDepth3Schema = z.object({
  type: z.literal("group"), operator: z.enum(["and", "or"]), filters: z.array(FilterConditionSchema).max(50),
});
const FilterGroupDepth2Schema = z.object({
  type: z.literal("group"), operator: z.enum(["and", "or"]), filters: z.array(z.union([FilterConditionSchema, FilterGroupDepth3Schema])).max(50),
});
const FilterGroupSchema = z.object({
  type: z.literal("group"), operator: z.enum(["and", "or"]), filters: z.array(z.union([FilterConditionSchema, FilterGroupDepth2Schema])).max(50),
});
const ViewConfigSchema = z.object({
  visibleProperties: z.array(z.string().min(1).max(120)).max(100).default([]),
  filters: FilterGroupSchema.nullable().default(null),
  sorts: z.array(z.object({ property: z.string().min(1).max(120), direction: z.enum(["ascending", "descending"]) })).max(20).default([]),
  groupBy: z.string().min(1).max(120).nullable().default(null),
  subGroupBy: z.string().min(1).max(120).nullable().default(null),
  openPagesIn: z.enum(["side-peek", "center-peek", "full-page"]).default("side-peek"),
  conditionalColors: z.array(z.object({
    property: z.string().min(1).max(120),
    operator: z.enum(filterOperators),
    value: DatabaseValueSchema.optional(),
    color: z.enum(DATABASE_CONDITIONAL_COLORS),
  })).max(20).default([]),
});

const starterPropertySchema: DatabasePropertySchema = {
  version: 1,
  properties: [
    { id: "title", name: "名称", type: "title" },
    { id: "status", name: "状态", type: "status", options: ["未开始", "进行中", "已完成"] },
    { id: "tags", name: "标签", type: "multi-select", options: [] },
    { id: "created_at", name: "创建时间", type: "created-time" },
    { id: "updated_at", name: "最后编辑时间", type: "last-edited-time" },
  ],
};

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

function normalizeViewConfig(input: unknown) {
  const parsed = ViewConfigSchema.safeParse(input);
  return parsed.success ? parsed.data : ViewConfigSchema.parse({});
}

function recordMarkdown(id: string, title: string, properties: Record<string, unknown>, body?: string, sourceId = SOURCE_KEY) {
  const propertyLines = Object.entries(properties).map(([key, value]) => `  ${key}: ${JSON.stringify(value)}`).join("\n");
  return `---\nsophie: 1\nid: ${id}\nkind: database-item\ndataSourceId: ${sourceId}\nproperties:\n${propertyLines}\n---\n\n# ${title}\n\n<!-- sophie:block=${id}-body type=text -->\n${body?.trim() || ""}\n`;
}

function viewConfigMarkdown(type: string, config: Record<string, unknown>) {
  return `# ${type} view\n\n\`\`\`json\n${JSON.stringify(config, null, 2)}\n\`\`\`\n`;
}

function templateMarkdown(input: { id: string; sourceId: string; name: string; title: string; properties: Record<string, unknown>; body: string }) {
  return `---\nsophie: 1\nid: ${input.id}\nkind: database-template\ndataSourceId: ${input.sourceId}\nname: ${JSON.stringify(input.name)}\ntitleTemplate: ${JSON.stringify(input.title)}\nproperties: ${JSON.stringify(input.properties)}\n---\n\n# ${input.name}\n\n${input.body.trim()}\n`;
}

function recordBody(markdown: string) {
  return markdown.match(/<!-- sophie:block=.*? type=text -->\r?\n([\s\S]*)$/)?.[1]?.trim() ?? "";
}

function storedTemplateBody(markdown: string) {
  return markdown.replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n+(?:# .*?\r?\n+)?/, "").trim();
}

async function ensureViews(sourceId: string, schema: DatabasePropertySchema) {
  const visible = schema.properties.filter((property) => property.type !== "title").slice(0, 8).map((property) => property.id);
  const boardGroup = schema.properties.find((property) => ["status", "select", "multi-select", "checkbox"].includes(property.type))?.id ?? null;
  for (const type of viewTypes) {
    const config = {
      visibleProperties: visible,
      filters: null,
      sorts: [],
      groupBy: type === "board" ? boardGroup : null,
      subGroupBy: null,
      openPagesIn: type === "calendar" || type === "gallery" ? "center-peek" : "side-peek",
      conditionalColors: [],
    };
    await env.DB.prepare(
      `INSERT OR IGNORE INTO database_views
        (id, data_source_id, name, view_type, config_markdown, config_json)
       VALUES (?, ?, ?, ?, ?, ?)`,
    ).bind(`${sourceId}:${type}`, sourceId, type, type, viewConfigMarkdown(type, config), JSON.stringify(config)).run();
  }
}

async function ensureStarterTemplate(sourceId: string, schema: DatabasePropertySchema) {
  const id = `${sourceId}:template:standard`;
  const properties: Record<string, unknown> = {};
  for (const property of schema.properties) {
    if (property.type === "status" || property.type === "select") properties[property.id] = property.options?.[0] ?? null;
    else if (property.type === "multi-select") properties[property.id] = [];
    else if (property.type === "checkbox") properties[property.id] = false;
  }
  const markdown = templateMarkdown({ id, sourceId, name: "标准记录", title: "未命名", properties, body: "在这里填写记录正文。" });
  await env.DB.prepare(
    `INSERT OR IGNORE INTO database_templates
      (id, data_source_id, name, icon, description, title_template, template_markdown, properties_json)
     VALUES (?, ?, '标准记录', '✦', '带有基础状态与正文的记录', '未命名', ?, ?)`,
  ).bind(id, sourceId, markdown, JSON.stringify(properties)).run();
}

async function ensureDefaultDatabase(workspaceId: string) {
  await ensureSchema();
  const sourceId = scopedResourceId(workspaceId, SOURCE_KEY);
  const existingSource = await env.DB.prepare(
    `SELECT id FROM data_sources WHERE id = ? AND workspace_id = ?`,
  ).bind(sourceId, workspaceId).first();
  await env.DB.prepare(
    `INSERT OR IGNORE INTO data_sources (id, workspace_id, name, schema_markdown)
     VALUES (?, ?, '产品任务', ?)`,
  ).bind(sourceId, workspaceId, sourceSchemaMarkdown).run();
  await env.DB.prepare(
    `INSERT OR IGNORE INTO database_property_schemas
      (data_source_id, schema_json, schema_markdown)
     VALUES (?, ?, ?)`,
  ).bind(
    sourceId,
    JSON.stringify(defaultProductTaskPropertySchema),
    databasePropertySchemaMarkdown("产品任务", defaultProductTaskPropertySchema),
  ).run();

  await ensureViews(sourceId, defaultProductTaskPropertySchema);

  if (!existingSource) {
    await ensureStarterTemplate(sourceId, defaultProductTaskPropertySchema);
    for (const record of defaultRecords) {
      const { id: recordKey, title, ...properties } = record;
      const id = `${sourceId}:${recordKey}`;
      await env.DB.prepare(
        `INSERT INTO database_records
          (id, data_source_id, title, markdown, properties_json)
         VALUES (?, ?, ?, ?, ?)`,
      ).bind(id, sourceId, title, recordMarkdown(id, title, properties, undefined, sourceId), JSON.stringify(properties)).run();
    }
  }
  return sourceId;
}

type StoredDatabaseRecord = { id: string; title: string; markdown: string; propertiesJson: string; revision: number; createdAt: string; updatedAt: string };
type SourceDescriptor = { id: string; storedId: string; name: string; schema: DatabasePropertySchema; schemaRevision: number };

async function workspaceSources(workspaceId: string): Promise<SourceDescriptor[]> {
  const rows = await env.DB.prepare(
    `SELECT s.id, s.name, p.schema_json AS schemaJson, COALESCE(p.revision, 1) AS schemaRevision
     FROM data_sources s
     LEFT JOIN database_property_schemas p ON p.data_source_id = s.id
     WHERE s.workspace_id = ? ORDER BY s.created_at`,
  ).bind(workspaceId).all<{ id: string; name: string; schemaJson: string | null; schemaRevision: number }>();
  return rows.results.map((row) => {
    const schema = normalizeDatabasePropertySchema(safeJson(row.schemaJson ?? "", starterPropertySchema));
    for (const property of schema.properties.filter((item) => item.type === "relation" && item.relation)) {
      property.relation!.dataSourceId = publicResourceId(workspaceId, scopedResourceId(workspaceId, property.relation!.dataSourceId));
    }
    return {
      id: publicResourceId(workspaceId, row.id),
      storedId: row.id,
      name: row.name,
      schema,
      schemaRevision: Number(row.schemaRevision ?? 1),
    };
  });
}

async function validateRelationSchema(workspaceId: string, schema: DatabasePropertySchema, currentSourceId?: string) {
  const sources = await workspaceSources(workspaceId);
  const current = currentSourceId ? sources.find((source) => source.storedId === currentSourceId) : undefined;
  if (current) current.schema = schema;
  const byId = new Map(sources.flatMap((source) => [[source.id, source], [source.storedId, source]]));
  for (const property of schema.properties.filter((item) => item.type === "relation" && item.relation)) {
    const targetStoredId = scopedResourceId(workspaceId, property.relation!.dataSourceId);
    const target = byId.get(targetStoredId) ?? byId.get(publicResourceId(workspaceId, targetStoredId));
    if (!target) throw new Error(`关联属性 ${property.name} 指向不存在的数据源`);
    property.relation!.dataSourceId = target.id;
  }
  for (const property of schema.properties.filter((item) => item.type === "rollup" && item.rollup)) {
    const relation = schema.properties.find((item) => item.id === property.rollup!.relationPropertyId && item.type === "relation");
    const target = relation?.relation ? byId.get(relation.relation.dataSourceId) : undefined;
    if (!target?.schema.properties.some((item) => item.id === property.rollup!.targetPropertyId)) {
      throw new Error(`汇总属性 ${property.name} 引用了目标数据源中不存在的属性`);
    }
  }
  return sources;
}

async function sourceRecordMap(workspaceId: string, source: SourceDescriptor) {
  const rows = await env.DB.prepare(
    `SELECT id, title, markdown, properties_json AS propertiesJson, revision,
      created_at AS createdAt, updated_at AS updatedAt
     FROM database_records WHERE data_source_id = ? ORDER BY created_at`,
  ).bind(source.storedId).all<StoredDatabaseRecord>();
  const raw = rows.results.map((record) => ({ ...record, rawProperties: safeJson<Record<string, unknown>>(record.propertiesJson, {}) }));
  const rawMap = new Map<string, { title: string; properties: Record<string, unknown> }>();
  for (const record of raw) {
    const value = { title: record.title, properties: record.rawProperties };
    rawMap.set(record.id, value);
    rawMap.set(publicResourceId(workspaceId, record.id), value);
  }
  const computed = raw.map((record) => ({
    ...record,
    properties: computeDatabaseProperties({
      schema: source.schema,
      raw: record.rawProperties,
      record: { id: record.id, title: record.title, createdAt: record.createdAt, updatedAt: record.updatedAt },
      recordsById: rawMap,
    }),
  }));
  const computedMap = new Map<string, { title: string; properties: Record<string, unknown> }>();
  for (const record of computed) {
    const value = { title: record.title, properties: record.properties };
    computedMap.set(record.id, value);
    computedMap.set(publicResourceId(workspaceId, record.id), value);
  }
  return { rows: computed, map: computedMap };
}

async function relatedRecordMaps(workspaceId: string, schema: DatabasePropertySchema, sources: SourceDescriptor[]) {
  const requested = new Set(schema.properties.filter((item) => item.type === "relation" && item.relation).map((item) => item.relation!.dataSourceId));
  const maps = new Map<string, Map<string, { title: string; properties: Record<string, unknown> }>>();
  await Promise.all(sources.filter((source) => requested.has(source.id)).map(async (source) => {
    const loaded = await sourceRecordMap(workspaceId, source);
    maps.set(source.id, loaded.map);
    maps.set(source.storedId, loaded.map);
  }));
  return maps;
}

async function normalizeRelationValues(workspaceId: string, schema: DatabasePropertySchema, properties: Record<string, unknown>) {
  for (const property of schema.properties.filter((item) => item.type === "relation" && item.relation)) {
    const values = Array.isArray(properties[property.id]) ? properties[property.id] as unknown[] : [];
    const publicIds = [...new Set(values.map(String).map((id) => publicResourceId(workspaceId, scopedResourceId(workspaceId, id))).filter(Boolean))];
    if (!publicIds.length) { properties[property.id] = []; continue; }
    const targetSourceId = scopedResourceId(workspaceId, property.relation!.dataSourceId);
    const storedIds = publicIds.map((id) => scopedResourceId(workspaceId, id));
    const placeholders = storedIds.map(() => "?").join(",");
    const found = await env.DB.prepare(
      `SELECT id FROM database_records WHERE data_source_id = ? AND id IN (${placeholders})`,
    ).bind(targetSourceId, ...storedIds).all<{ id: string }>();
    if (found.results.length !== storedIds.length) throw new Error(`关联属性 ${property.name} 包含不存在或跨工作区的记录`);
    properties[property.id] = publicIds;
  }
  return properties;
}

async function syncTwoWayRelations(input: {
  workspaceId: string;
  sourceId: string;
  schema: DatabasePropertySchema;
  recordId: string;
  previous: Record<string, unknown>;
  next: Record<string, unknown>;
}) {
  const sourcePublicId = publicResourceId(input.workspaceId, input.sourceId);
  const recordPublicId = publicResourceId(input.workspaceId, input.recordId);
  for (const relation of input.schema.properties.filter((property) => property.type === "relation" && property.relation?.twoWay)) {
    const targetSourceId = scopedResourceId(input.workspaceId, relation.relation!.dataSourceId);
    const targetSchemaRow = await env.DB.prepare(
      `SELECT schema_json AS schemaJson FROM database_property_schemas WHERE data_source_id = ? LIMIT 1`,
    ).bind(targetSourceId).first<{ schemaJson: string }>();
    if (!targetSchemaRow) continue;
    const targetSchema = normalizeDatabasePropertySchema(safeJson(targetSchemaRow.schemaJson, starterPropertySchema));
    const inverseProperties = targetSchema.properties.filter((property) =>
      property.type === "relation" && property.relation?.twoWay
      && publicResourceId(input.workspaceId, scopedResourceId(input.workspaceId, property.relation.dataSourceId)) === sourcePublicId,
    );
    if (!inverseProperties.length) continue;
    const previousIds = new Set((Array.isArray(input.previous[relation.id]) ? input.previous[relation.id] as unknown[] : []).map(String).map((id) => publicResourceId(input.workspaceId, scopedResourceId(input.workspaceId, id))));
    const nextIds = new Set((Array.isArray(input.next[relation.id]) ? input.next[relation.id] as unknown[] : []).map(String).map((id) => publicResourceId(input.workspaceId, scopedResourceId(input.workspaceId, id))));
    for (const targetPublicId of new Set([...previousIds, ...nextIds])) {
      const targetRecordId = scopedResourceId(input.workspaceId, targetPublicId);
      const target = await env.DB.prepare(
        `SELECT title, markdown, properties_json AS propertiesJson, revision
         FROM database_records WHERE id = ? AND data_source_id = ? LIMIT 1`,
      ).bind(targetRecordId, targetSourceId).first<{ title: string; markdown: string; propertiesJson: string; revision: number }>();
      if (!target) continue;
      const properties = safeJson<Record<string, unknown>>(target.propertiesJson, {});
      let changed = false;
      for (const inverse of inverseProperties) {
        const values = new Set((Array.isArray(properties[inverse.id]) ? properties[inverse.id] as unknown[] : []).map(String).map((id) => publicResourceId(input.workspaceId, scopedResourceId(input.workspaceId, id))));
        const shouldContain = nextIds.has(targetPublicId);
        if (shouldContain && !values.has(recordPublicId)) { values.add(recordPublicId); changed = true; }
        if (!shouldContain && values.delete(recordPublicId)) changed = true;
        properties[inverse.id] = [...values];
      }
      if (!changed) continue;
      const markdown = recordMarkdown(targetRecordId, target.title, properties, recordBody(target.markdown), targetSourceId);
      await env.DB.prepare(
        `UPDATE database_records SET properties_json = ?, markdown = ?, revision = revision + 1, updated_at = CURRENT_TIMESTAMP
         WHERE id = ? AND data_source_id = ? AND revision = ?`,
      ).bind(JSON.stringify(properties), markdown, targetRecordId, targetSourceId, target.revision).run();
    }
  }
}

const RecordActionSchema = z.object({
  action: z.literal("upsert-record"),
  sourceId: z.string().min(1).max(240).default(SOURCE_KEY),
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
    sourceId: z.string().min(1).max(240).default(SOURCE_KEY),
    config: ViewConfigSchema,
    baseRevision: z.number().int().positive().optional(),
  }),
});

const SchemaActionSchema = z.object({
  action: z.literal("save-schema"),
  sourceId: z.string().min(1).max(240).default(SOURCE_KEY),
  schema: z.unknown(),
  baseRevision: z.number().int().positive().optional(),
});

const CreateSourceActionSchema = z.object({
  action: z.literal("create-source"),
  name: z.string().trim().min(1).max(100),
});

const SaveTemplateActionSchema = z.object({
  action: z.literal("save-template"),
  sourceId: z.string().min(1).max(240).default(SOURCE_KEY),
  template: z.object({
    id: z.string().min(1).max(160).optional(),
    name: z.string().trim().min(1).max(100),
    icon: z.string().trim().min(1).max(16).default("✦"),
    description: z.string().trim().max(500).default(""),
    title: z.string().trim().min(1).max(500).default("未命名"),
    body: z.string().max(100_000).default(""),
    properties: z.record(z.string(), z.unknown()).default({}),
    baseRevision: z.number().int().positive().optional(),
  }),
});

const CreateFromTemplateActionSchema = z.object({
  action: z.literal("create-from-template"),
  sourceId: z.string().min(1).max(240).default(SOURCE_KEY),
  templateId: z.string().min(1).max(160),
  title: z.string().trim().min(1).max(500).optional(),
});

const ActionSchema = z.discriminatedUnion("action", [
  RecordActionSchema,
  ViewActionSchema,
  SchemaActionSchema,
  CreateSourceActionSchema,
  SaveTemplateActionSchema,
  CreateFromTemplateActionSchema,
]);

export async function GET(request: Request) {
  try {
    const { workspaceId } = await requireWorkspace(request);
    const defaultSourceId = await ensureDefaultDatabase(workspaceId);
    const sources = await workspaceSources(workspaceId);
    const requestedSourceId = new URL(request.url).searchParams.get("sourceId");
    const sourceId = requestedSourceId ? scopedResourceId(workspaceId, requestedSourceId) : defaultSourceId;
    const source = await env.DB.prepare(
      `SELECT id, name, schema_markdown AS schemaMarkdown, revision, updated_at AS updatedAt
       FROM data_sources WHERE id = ? AND workspace_id = ?`,
    ).bind(sourceId, workspaceId).first();
    if (!source) return Response.json({ error: "data_source_not_found" }, { status: 404 });
    const [propertySchemaRow, views, records, templates] = await Promise.all([
      env.DB.prepare(
        `SELECT schema_json AS schemaJson, schema_markdown AS schemaMarkdown, revision, updated_at AS updatedAt
         FROM database_property_schemas WHERE data_source_id = ? LIMIT 1`,
      ).bind(sourceId).first<{ schemaJson: string; schemaMarkdown: string; revision: number; updatedAt: string }>(),
      env.DB.prepare(
        `SELECT id, name, view_type AS type, config_json AS configJson, revision, updated_at AS updatedAt
         FROM database_views WHERE data_source_id = ? ORDER BY created_at`,
      ).bind(sourceId).all<{ id: string; name: string; type: string; configJson: string; revision: number; updatedAt: string }>(),
      env.DB.prepare(
        `SELECT id, title, markdown, properties_json AS propertiesJson, revision,
          created_at AS createdAt, updated_at AS updatedAt
         FROM database_records WHERE data_source_id = ? ORDER BY created_at`,
      ).bind(sourceId).all<{ id: string; title: string; markdown: string; propertiesJson: string; revision: number; createdAt: string; updatedAt: string }>(),
      env.DB.prepare(
        `SELECT id, name, icon, description, title_template AS title, template_markdown AS markdown,
          properties_json AS propertiesJson, revision, updated_at AS updatedAt
         FROM database_templates WHERE data_source_id = ? ORDER BY created_at`,
      ).bind(sourceId).all<{ id: string; name: string; icon: string; description: string; title: string; markdown: string; propertiesJson: string; revision: number; updatedAt: string }>(),
    ]);
    const schema = propertySchemaRow
      ? normalizeDatabasePropertySchema(safeJson(propertySchemaRow.schemaJson, defaultProductTaskPropertySchema))
      : defaultProductTaskPropertySchema;
    for (const property of schema.properties.filter((item) => item.type === "relation" && item.relation)) {
      property.relation!.dataSourceId = publicResourceId(workspaceId, scopedResourceId(workspaceId, property.relation!.dataSourceId));
    }
    const rawRecords = records.results.map((record) => ({ ...record, rawProperties: safeJson<Record<string, unknown>>(record.propertiesJson, {}) }));
    const recordsById = new Map<string, { title: string; properties: Record<string, unknown> }>();
    for (const record of rawRecords) {
      const value = { title: record.title, properties: record.rawProperties };
      recordsById.set(record.id, value);
      recordsById.set(publicResourceId(workspaceId, record.id), value);
    }
    const sourceDescriptor = sources.find((item) => item.storedId === sourceId);
    if (!sourceDescriptor) return Response.json({ error: "data_source_not_found" }, { status: 404 });
    sourceDescriptor.schema = schema;
    const recordsBySourceId = await relatedRecordMaps(workspaceId, schema, sources);
    if (!recordsBySourceId.has(sourceDescriptor.id)) recordsBySourceId.set(sourceDescriptor.id, recordsById);
    if (!recordsBySourceId.has(sourceDescriptor.storedId)) recordsBySourceId.set(sourceDescriptor.storedId, recordsById);
    const relationSourceIds = new Set(schema.properties.filter((item) => item.type === "relation" && item.relation).map((item) => item.relation!.dataSourceId));
    const relationOptions = Object.fromEntries(await Promise.all(sources.filter((item) => relationSourceIds.has(item.id)).map(async (item) => {
      const rows = await env.DB.prepare(`SELECT id, title FROM database_records WHERE data_source_id = ? ORDER BY title LIMIT 500`)
        .bind(item.storedId).all<{ id: string; title: string }>();
      return [item.id, rows.results.map((record) => ({ id: publicResourceId(workspaceId, record.id), title: record.title }))];
    })));
    return Response.json({
      source: { ...source, id: publicResourceId(workspaceId, String((source as { id: string }).id)), schema, schemaRevision: propertySchemaRow?.revision ?? 1, schemaMarkdown: propertySchemaRow?.schemaMarkdown ?? databasePropertySchemaMarkdown(String((source as { name?: string }).name ?? "数据源"), schema) },
      sources: sources.map((item) => ({ id: item.id, name: item.name, schema: item.schema, schemaRevision: item.schemaRevision })),
      relationOptions,
      views: views.results.map((view) => ({ ...view, config: normalizeViewConfig(safeJson(view.configJson, {})), configJson: undefined })),
      templates: templates.results.map((template) => ({
        ...template,
        id: publicResourceId(workspaceId, template.id),
        properties: safeJson<Record<string, unknown>>(template.propertiesJson, {}),
        propertiesJson: undefined,
      })),
      records: rawRecords.map((record) => ({
        ...record,
        id: publicResourceId(workspaceId, record.id),
        properties: computeDatabaseProperties({
          schema,
          raw: record.rawProperties,
          record: { id: record.id, title: record.title, createdAt: record.createdAt, updatedAt: record.updatedAt },
          recordsById,
          recordsBySourceId,
        }),
        rawProperties: record.rawProperties,
        propertiesJson: undefined,
      })),
    });
  } catch (error) {
    const auth = authErrorResponse(error);
    if (auth) return auth;
    return Response.json({ error: error instanceof Error ? error.message : "Unable to load database" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const { workspaceId } = await requireWorkspace(request, { write: true });
    await ensureDefaultDatabase(workspaceId);
    const parsed = ActionSchema.safeParse(await request.json());
    if (!parsed.success) return Response.json({ error: "invalid_database_action", details: parsed.error.flatten() }, { status: 400 });
    if (parsed.data.action === "create-source") {
      const publicId = `database-${crypto.randomUUID()}`;
      const sourceId = scopedResourceId(workspaceId, publicId);
      const schema = normalizeDatabasePropertySchema(starterPropertySchema);
      const schemaMarkdown = databasePropertySchemaMarkdown(parsed.data.name, schema);
      await env.DB.prepare(
        `INSERT INTO data_sources (id, workspace_id, name, schema_markdown) VALUES (?, ?, ?, ?)`,
      ).bind(sourceId, workspaceId, parsed.data.name, schemaMarkdown).run();
      await env.DB.prepare(
        `INSERT INTO database_property_schemas (data_source_id, schema_json, schema_markdown) VALUES (?, ?, ?)`,
      ).bind(sourceId, JSON.stringify(schema), schemaMarkdown).run();
      await ensureViews(sourceId, schema);
      await ensureStarterTemplate(sourceId, schema);
      return Response.json({ source: { id: publicId, name: parsed.data.name, schema, schemaRevision: 1 } }, { status: 201 });
    }
    if (parsed.data.action === "save-schema") {
      const sourceId = scopedResourceId(workspaceId, parsed.data.sourceId);
      const source = await env.DB.prepare(`SELECT name FROM data_sources WHERE id = ? AND workspace_id = ? LIMIT 1`)
        .bind(sourceId, workspaceId).first<{ name: string }>();
      if (!source) return Response.json({ error: "data_source_not_found" }, { status: 404 });
      const current = await env.DB.prepare(`SELECT revision FROM database_property_schemas WHERE data_source_id = ? LIMIT 1`)
        .bind(sourceId).first<{ revision: number }>();
      if (current && parsed.data.baseRevision !== undefined && current.revision !== parsed.data.baseRevision) {
        return Response.json({ error: "revision_conflict", currentRevision: current.revision }, { status: 409 });
      }
      let schema: DatabasePropertySchema;
      try {
        schema = normalizeDatabasePropertySchema(parsed.data.schema);
        await validateRelationSchema(workspaceId, schema, sourceId);
      }
      catch (error) { return Response.json({ error: error instanceof Error ? error.message : "属性 schema 无效" }, { status: 400 }); }
      const revision = (current?.revision ?? 0) + 1;
      const schemaMarkdown = databasePropertySchemaMarkdown(source.name, schema);
      await env.DB.prepare(
        `INSERT INTO database_property_schemas (data_source_id, schema_json, schema_markdown, revision)
         VALUES (?, ?, ?, ?)
         ON CONFLICT(data_source_id) DO UPDATE SET
           schema_json = excluded.schema_json,
           schema_markdown = excluded.schema_markdown,
           revision = excluded.revision,
           updated_at = CURRENT_TIMESTAMP`,
      ).bind(sourceId, JSON.stringify(schema), schemaMarkdown, revision).run();
      return Response.json({ sourceId, schema, schemaMarkdown, revision });
    }
    if (parsed.data.action === "save-template") {
      const sourceId = scopedResourceId(workspaceId, parsed.data.sourceId);
      const [source, schemaRow] = await Promise.all([
        env.DB.prepare(`SELECT id FROM data_sources WHERE id = ? AND workspace_id = ? LIMIT 1`).bind(sourceId, workspaceId).first(),
        env.DB.prepare(`SELECT schema_json AS schemaJson FROM database_property_schemas WHERE data_source_id = ? LIMIT 1`).bind(sourceId).first<{ schemaJson: string }>(),
      ]);
      if (!source) return Response.json({ error: "data_source_not_found" }, { status: 404 });
      const schema = schemaRow ? normalizeDatabasePropertySchema(safeJson(schemaRow.schemaJson, starterPropertySchema)) : starterPropertySchema;
      const properties = await normalizeRelationValues(workspaceId, schema, normalizeDatabasePropertyValues(schema, parsed.data.template.properties));
      const id = parsed.data.template.id
        ? scopedResourceId(workspaceId, parsed.data.template.id)
        : `${sourceId}:template:${crypto.randomUUID()}`;
      const existing = await env.DB.prepare(`SELECT revision, data_source_id AS dataSourceId FROM database_templates WHERE id = ? LIMIT 1`)
        .bind(id).first<{ revision: number; dataSourceId: string }>();
      if (existing && existing.dataSourceId !== sourceId) return Response.json({ error: "template_id_conflict" }, { status: 409 });
      if (existing && parsed.data.template.baseRevision !== undefined && existing.revision !== parsed.data.template.baseRevision) {
        return Response.json({ error: "revision_conflict", currentRevision: existing.revision }, { status: 409 });
      }
      const revision = (existing?.revision ?? 0) + 1;
      const markdown = templateMarkdown({ id, sourceId, name: parsed.data.template.name, title: parsed.data.template.title, properties, body: parsed.data.template.body });
      await env.DB.prepare(
        `INSERT INTO database_templates
          (id, data_source_id, name, icon, description, title_template, template_markdown, properties_json, revision)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET
           name = excluded.name,
           icon = excluded.icon,
           description = excluded.description,
           title_template = excluded.title_template,
           template_markdown = excluded.template_markdown,
           properties_json = excluded.properties_json,
           revision = excluded.revision,
           updated_at = CURRENT_TIMESTAMP`,
      ).bind(id, sourceId, parsed.data.template.name, parsed.data.template.icon, parsed.data.template.description, parsed.data.template.title, markdown, JSON.stringify(properties), revision).run();
      return Response.json({ id: publicResourceId(workspaceId, id), revision, markdown }, { status: existing ? 200 : 201 });
    }
    if (parsed.data.action === "create-from-template") {
      const sourceId = scopedResourceId(workspaceId, parsed.data.sourceId);
      const templateId = scopedResourceId(workspaceId, parsed.data.templateId);
      const [source, schemaRow, template] = await Promise.all([
        env.DB.prepare(`SELECT id FROM data_sources WHERE id = ? AND workspace_id = ? LIMIT 1`).bind(sourceId, workspaceId).first(),
        env.DB.prepare(`SELECT schema_json AS schemaJson FROM database_property_schemas WHERE data_source_id = ? LIMIT 1`).bind(sourceId).first<{ schemaJson: string }>(),
        env.DB.prepare(
          `SELECT title_template AS title, template_markdown AS markdown, properties_json AS propertiesJson
           FROM database_templates WHERE id = ? AND data_source_id = ? LIMIT 1`,
        ).bind(templateId, sourceId).first<{ title: string; markdown: string; propertiesJson: string }>(),
      ]);
      if (!source) return Response.json({ error: "data_source_not_found" }, { status: 404 });
      if (!template) return Response.json({ error: "database_template_not_found" }, { status: 404 });
      const schema = schemaRow ? normalizeDatabasePropertySchema(safeJson(schemaRow.schemaJson, starterPropertySchema)) : starterPropertySchema;
      const properties = await normalizeRelationValues(workspaceId, schema, normalizeDatabasePropertyValues(schema, safeJson(template.propertiesJson, {})));
      const id = scopedResourceId(workspaceId, crypto.randomUUID());
      const title = parsed.data.title ?? template.title;
      const body = storedTemplateBody(template.markdown);
      const markdown = recordMarkdown(id, title, properties, body, sourceId);
      await env.DB.prepare(
        `INSERT INTO database_records (id, data_source_id, title, markdown, properties_json) VALUES (?, ?, ?, ?, ?)`,
      ).bind(id, sourceId, title, markdown, JSON.stringify(properties)).run();
      await syncTwoWayRelations({ workspaceId, sourceId, schema, recordId: id, previous: {}, next: properties });
      await clearWorkspaceTombstone(env.DB, workspaceId, "database-record", id);
      return Response.json({ id: publicResourceId(workspaceId, id), revision: 1, markdown, updatedAt: new Date().toISOString() }, { status: 201 });
    }
    if (parsed.data.action === "upsert-record") {
      const { record } = parsed.data;
      const sourceId = scopedResourceId(workspaceId, parsed.data.sourceId);
      const source = await env.DB.prepare(`SELECT id FROM data_sources WHERE id = ? AND workspace_id = ? LIMIT 1`)
        .bind(sourceId, workspaceId).first();
      if (!source) return Response.json({ error: "data_source_not_found" }, { status: 404 });
      const schemaRow = await env.DB.prepare(`SELECT schema_json AS schemaJson FROM database_property_schemas WHERE data_source_id = ? LIMIT 1`)
        .bind(sourceId).first<{ schemaJson: string }>();
      const schema = schemaRow ? normalizeDatabasePropertySchema(safeJson(schemaRow.schemaJson, defaultProductTaskPropertySchema)) : defaultProductTaskPropertySchema;
      const properties = await normalizeRelationValues(workspaceId, schema, normalizeDatabasePropertyValues(schema, record.properties));
      const id = record.id ? scopedResourceId(workspaceId, record.id) : scopedResourceId(workspaceId, crypto.randomUUID());
      const existing = await env.DB.prepare(
        `SELECT revision, properties_json AS propertiesJson, data_source_id AS dataSourceId FROM database_records WHERE id = ?`,
      ).bind(id).first<{ revision: number; propertiesJson: string; dataSourceId: string }>();
      if (existing && existing.dataSourceId !== sourceId) return Response.json({ error: "record_id_conflict" }, { status: 409 });
      if (existing && record.baseRevision !== undefined && existing.revision !== record.baseRevision) {
        return Response.json({ error: "revision_conflict", currentRevision: existing.revision }, { status: 409 });
      }
      const nextRevision = (existing?.revision ?? 0) + 1;
      const markdown = recordMarkdown(id, record.title, properties, record.body, sourceId);
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
      ).bind(id, sourceId, record.title, markdown, JSON.stringify(properties), nextRevision).run();
      await syncTwoWayRelations({
        workspaceId,
        sourceId,
        schema,
        recordId: id,
        previous: existing ? safeJson(existing.propertiesJson, {}) : {},
        next: properties,
      });
      await clearWorkspaceTombstone(env.DB, workspaceId, "database-record", id);
      return Response.json({ id: publicResourceId(workspaceId, id), revision: nextRevision, markdown, updatedAt: new Date().toISOString() }, { status: existing ? 200 : 201 });
    }

    const { view } = parsed.data;
    const sourceId = scopedResourceId(workspaceId, view.sourceId);
    const source = await env.DB.prepare(`SELECT id FROM data_sources WHERE id = ? AND workspace_id = ? LIMIT 1`)
      .bind(sourceId, workspaceId).first();
    if (!source) return Response.json({ error: "data_source_not_found" }, { status: 404 });
    const viewId = scopedResourceId(workspaceId, view.id);
    const existing = await env.DB.prepare(
      `SELECT revision, data_source_id AS dataSourceId FROM database_views WHERE id = ?`,
    ).bind(viewId).first<{ revision: number; dataSourceId: string }>();
    if (existing && existing.dataSourceId !== sourceId) return Response.json({ error: "view_id_conflict" }, { status: 409 });
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
    ).bind(viewId, sourceId, view.name, view.type, viewConfigMarkdown(view.type, view.config), JSON.stringify(view.config), nextRevision).run();
    return Response.json({ id: viewId, revision: nextRevision, updatedAt: new Date().toISOString() });
  } catch (error) {
    const auth = authErrorResponse(error);
    if (auth) return auth;
    return Response.json({ error: error instanceof Error ? error.message : "Unable to save database" }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  try {
    const { workspaceId } = await requireWorkspace(request, { write: true });
    const defaultSourceId = await ensureDefaultDatabase(workspaceId);
    const url = new URL(request.url);
    const id = url.searchParams.get("id")?.trim();
    const target = url.searchParams.get("target") === "template" ? "template" : "record";
    const sourceId = url.searchParams.get("sourceId")?.trim()
      ? scopedResourceId(workspaceId, url.searchParams.get("sourceId")!.trim())
      : defaultSourceId;
    if (!id) return Response.json({ error: "record_id_required" }, { status: 400 });
    const source = await env.DB.prepare(`SELECT id FROM data_sources WHERE id = ? AND workspace_id = ? LIMIT 1`)
      .bind(sourceId, workspaceId).first();
    if (!source) return Response.json({ error: "data_source_not_found" }, { status: 404 });
    const storedId = scopedResourceId(workspaceId, id);
    if (target === "template") {
      const template = await env.DB.prepare(
        `SELECT id, revision FROM database_templates WHERE id = ? AND data_source_id = ?`,
      ).bind(storedId, sourceId).first<{ id: string; revision: number }>();
      if (!template) return Response.json({ error: "database_template_not_found" }, { status: 404 });
      await env.DB.prepare(`DELETE FROM database_templates WHERE id = ? AND data_source_id = ?`).bind(storedId, sourceId).run();
      await recordWorkspaceTombstone({ db: env.DB, workspaceId, entityKind: "database-template", entityId: storedId, deletedRevision: template.revision + 1 });
      return Response.json({ id, deleted: true, target });
    }
    const record = await env.DB.prepare(
      `SELECT id, revision, properties_json AS propertiesJson FROM database_records WHERE id = ? AND data_source_id = ?`,
    ).bind(storedId, sourceId).first<{ id: string; revision: number; propertiesJson: string }>();
    if (!record) return Response.json({ error: "record_not_found" }, { status: 404 });
    const schemaRow = await env.DB.prepare(`SELECT schema_json AS schemaJson FROM database_property_schemas WHERE data_source_id = ? LIMIT 1`)
      .bind(sourceId).first<{ schemaJson: string }>();
    const schema = schemaRow ? normalizeDatabasePropertySchema(safeJson(schemaRow.schemaJson, starterPropertySchema)) : starterPropertySchema;
    await syncTwoWayRelations({ workspaceId, sourceId, schema, recordId: storedId, previous: safeJson(record.propertiesJson, {}), next: {} });
    await env.DB.prepare(
      `DELETE FROM database_records WHERE id = ? AND data_source_id = ?`,
    ).bind(storedId, sourceId).run();
    await recordWorkspaceTombstone({
      db: env.DB,
      workspaceId,
      entityKind: "database-record",
      entityId: storedId,
      deletedRevision: record.revision + 1,
    });
    return Response.json({ id, deleted: true });
  } catch (error) {
    const auth = authErrorResponse(error);
    if (auth) return auth;
    return Response.json({ error: error instanceof Error ? error.message : "Unable to delete database record" }, { status: 500 });
  }
}
