import type { WorkspaceSnapshot, WorkspaceSnapshotEntry } from "./workspace-snapshot.ts";

type EntitySpec = {
  kind: string;
  table: string;
  primaryKey: string;
  columns: readonly string[];
  required: readonly string[];
  workspaceColumn?: string;
  parent?: { table: string; localColumn: string; parentColumn: string; workspaceColumn: string };
  revisionColumn?: string;
  updatedColumn?: string;
  deletable?: boolean;
  statusColumn?: string;
};

const specs = [
  { kind: "document", table: "documents", primaryKey: "id", workspaceColumn: "workspace_id", revisionColumn: "revision", updatedColumn: "updated_at", deletable: true, required: ["id", "title", "markdown"], columns: ["id", "workspace_id", "title", "icon", "kind", "markdown", "properties_json", "revision", "created_at", "updated_at"] },
  { kind: "data-source", table: "data_sources", primaryKey: "id", workspaceColumn: "workspace_id", revisionColumn: "revision", updatedColumn: "updated_at", required: ["id", "name", "schema_markdown"], columns: ["id", "workspace_id", "name", "schema_markdown", "revision", "created_at", "updated_at"] },
  { kind: "database-property-schema", table: "database_property_schemas", primaryKey: "data_source_id", parent: { table: "data_sources", localColumn: "data_source_id", parentColumn: "id", workspaceColumn: "workspace_id" }, revisionColumn: "revision", updatedColumn: "updated_at", required: ["data_source_id", "schema_json", "schema_markdown"], columns: ["data_source_id", "schema_json", "schema_markdown", "revision", "created_at", "updated_at"] },
  { kind: "database-view", table: "database_views", primaryKey: "id", parent: { table: "data_sources", localColumn: "data_source_id", parentColumn: "id", workspaceColumn: "workspace_id" }, revisionColumn: "revision", updatedColumn: "updated_at", required: ["id", "data_source_id", "name", "view_type", "config_markdown", "config_json"], columns: ["id", "data_source_id", "name", "view_type", "config_markdown", "config_json", "revision", "created_at", "updated_at"] },
  { kind: "database-record", table: "database_records", primaryKey: "id", parent: { table: "data_sources", localColumn: "data_source_id", parentColumn: "id", workspaceColumn: "workspace_id" }, revisionColumn: "revision", updatedColumn: "updated_at", deletable: true, required: ["id", "data_source_id", "title", "markdown", "properties_json"], columns: ["id", "data_source_id", "title", "markdown", "properties_json", "revision", "created_at", "updated_at"] },
  { kind: "code-project", table: "code_projects", primaryKey: "id", workspaceColumn: "workspace_id", updatedColumn: "updated_at", required: ["id", "name"], columns: ["id", "workspace_id", "name", "created_at", "updated_at"] },
  { kind: "code-file", table: "code_files", primaryKey: "id", parent: { table: "code_projects", localColumn: "project_id", parentColumn: "id", workspaceColumn: "workspace_id" }, revisionColumn: "revision", updatedColumn: "updated_at", deletable: true, required: ["id", "project_id", "path", "language", "content_markdown", "content_text"], columns: ["id", "project_id", "path", "language", "content_markdown", "content_text", "revision", "created_at", "updated_at"] },
  { kind: "agent-run", table: "agent_runs", primaryKey: "id", workspaceColumn: "workspace_id", updatedColumn: "updated_at", required: ["id", "name", "goal_markdown", "model", "status"], columns: ["id", "parent_id", "workspace_id", "name", "goal_markdown", "model", "status", "approval", "created_at", "updated_at"] },
  { kind: "agent-event", table: "agent_run_events", primaryKey: "id", parent: { table: "agent_runs", localColumn: "run_id", parentColumn: "id", workspaceColumn: "workspace_id" }, required: ["id", "run_id", "agent_name", "event_type", "content_markdown"], columns: ["id", "run_id", "agent_name", "event_type", "content_markdown", "created_at"] },
  { kind: "conversation", table: "conversations", primaryKey: "id", workspaceColumn: "workspace_id", updatedColumn: "updated_at", required: ["id", "title", "model_id"], columns: ["id", "workspace_id", "title", "model_id", "created_at", "updated_at"] },
  { kind: "chat-message", table: "chat_messages", primaryKey: "id", parent: { table: "conversations", localColumn: "conversation_id", parentColumn: "id", workspaceColumn: "workspace_id" }, required: ["id", "conversation_id", "role", "content_markdown"], columns: ["id", "conversation_id", "role", "content_markdown", "run_id", "created_at"] },
  { kind: "connector-outbox", table: "connector_outbox", primaryKey: "id", workspaceColumn: "workspace_id", statusColumn: "status", required: ["id", "channel", "payload_markdown", "status"], columns: ["id", "workspace_id", "channel", "payload_markdown", "status", "created_at", "sent_at"] },
  { kind: "connector-outbox-detail", table: "connector_outbox_details", primaryKey: "outbox_id", parent: { table: "connector_outbox", localColumn: "outbox_id", parentColumn: "id", workspaceColumn: "workspace_id" }, required: ["outbox_id", "target", "metadata_json"], columns: ["outbox_id", "target", "metadata_json"] },
  { kind: "connector-delivery-attempt", table: "connector_delivery_attempts", primaryKey: "id", parent: { table: "connector_outbox", localColumn: "outbox_id", parentColumn: "id", workspaceColumn: "workspace_id" }, required: ["id", "outbox_id", "channel", "status", "response_markdown"], columns: ["id", "outbox_id", "channel", "status", "response_markdown", "created_at"] },
] as const satisfies readonly EntitySpec[];

const specByKind = new Map<string, EntitySpec>(specs.map((spec) => [spec.kind, spec]));
const statusRank: Record<string, number> = { review: 1, rejected: 2, approved: 3, sending: 4, failed: 5, sent: 6 };

function numberValue(value: unknown) {
  const result = Number(value);
  return Number.isFinite(result) ? result : 0;
}

function timeValue(value: unknown) {
  const result = Date.parse(String(value ?? ""));
  return Number.isFinite(result) ? result : 0;
}

function comparable(row: Record<string, unknown>, spec: EntitySpec) {
  const ignored = new Set(["created_at", "updated_at"]);
  return JSON.stringify(Object.fromEntries(spec.columns.filter((column) => !ignored.has(column)).sort().map((column) => [column, row[column] ?? null])));
}

export type SnapshotMergeDecision = "insert" | "replace" | "same" | "keep-local" | "conflict";

export function decideSnapshotMerge(local: Record<string, unknown> | null, remote: Record<string, unknown>, kind: string): SnapshotMergeDecision {
  const spec = specByKind.get(kind);
  if (!spec) return "keep-local";
  if (!local) return "insert";
  if (comparable(local, spec) === comparable(remote, spec)) return "same";

  if (spec.revisionColumn) {
    const localRevision = numberValue(local[spec.revisionColumn]);
    const remoteRevision = numberValue(remote[spec.revisionColumn]);
    if (remoteRevision > localRevision) return "replace";
    if (remoteRevision < localRevision) return "keep-local";
    return "conflict";
  }

  if (spec.statusColumn) {
    const localRank = statusRank[String(local[spec.statusColumn] ?? "")] ?? 0;
    const remoteRank = statusRank[String(remote[spec.statusColumn] ?? "")] ?? 0;
    if (remoteRank > localRank) return "replace";
    if (remoteRank < localRank) return "keep-local";
  }

  if (spec.updatedColumn) {
    const localTime = timeValue(local[spec.updatedColumn]);
    const remoteTime = timeValue(remote[spec.updatedColumn]);
    if (remoteTime > localTime) return "replace";
    if (remoteTime < localTime) return "keep-local";
  }
  return "conflict";
}

function markdownRecord(title: string, row: Record<string, unknown>, body = "") {
  return [
    `# ${title}`,
    "",
    "```json",
    JSON.stringify(row, null, 2),
    "```",
    body ? `\n${body}` : "",
  ].join("\n");
}

async function globallyExisting(db: D1Database, spec: EntitySpec, primary: unknown) {
  return db.prepare(`SELECT * FROM ${spec.table} WHERE ${spec.primaryKey} = ? LIMIT 1`).bind(primary).first<Record<string, unknown>>();
}

async function ownsEntity(db: D1Database, workspaceId: string, spec: EntitySpec, primary: unknown) {
  if (spec.workspaceColumn) {
    return Boolean(await db.prepare(`SELECT 1 AS owned FROM ${spec.table} WHERE ${spec.primaryKey} = ? AND ${spec.workspaceColumn} = ? LIMIT 1`).bind(primary, workspaceId).first());
  }
  if (spec.parent) {
    return Boolean(await db.prepare(
      `SELECT 1 AS owned FROM ${spec.table} child JOIN ${spec.parent.table} parent ON parent.${spec.parent.parentColumn} = child.${spec.parent.localColumn}
       WHERE child.${spec.primaryKey} = ? AND parent.${spec.parent.workspaceColumn} = ? LIMIT 1`,
    ).bind(primary, workspaceId).first());
  }
  return false;
}

async function parentBelongsToWorkspace(db: D1Database, workspaceId: string, spec: EntitySpec, row: Record<string, unknown>) {
  if (!spec.parent) return true;
  return Boolean(await db.prepare(
    `SELECT 1 AS owned FROM ${spec.parent.table} WHERE ${spec.parent.parentColumn} = ? AND ${spec.parent.workspaceColumn} = ? LIMIT 1`,
  ).bind(row[spec.parent.localColumn], workspaceId).first());
}

function normalizedRow(entry: WorkspaceSnapshotEntry, workspaceId: string, spec: EntitySpec) {
  const row = Object.fromEntries(spec.columns.filter((column) => entry.data[column] !== undefined).map((column) => [column, entry.data[column]]));
  if (spec.workspaceColumn) row[spec.workspaceColumn] = workspaceId;
  return row;
}

function validRemoteRow(row: Record<string, unknown>, spec: EntitySpec) {
  return spec.required.every((column) => row[column] !== undefined && row[column] !== null && String(row[column]).length > 0);
}

async function upsertRow(db: D1Database, spec: EntitySpec, row: Record<string, unknown>) {
  const columns = spec.columns.filter((column) => row[column] !== undefined);
  const updates = columns.filter((column) => column !== spec.primaryKey).map((column) => `${column} = excluded.${column}`);
  const sql = `INSERT INTO ${spec.table} (${columns.join(", ")}) VALUES (${columns.map(() => "?").join(", ")})
    ON CONFLICT(${spec.primaryKey}) DO UPDATE SET ${updates.join(", ")}`;
  await db.prepare(sql).bind(...columns.map((column) => row[column])).run();
}

async function resolveConflict(db: D1Database, workspaceId: string, kind: string, entityId: string) {
  await db.prepare(
    `DELETE FROM connector_sync_conflicts
     WHERE workspace_id = ? AND provider = 'onedrive' AND entity_kind = ? AND entity_id = ? AND status = 'resolved'`,
  ).bind(workspaceId, kind, entityId).run();
  await db.prepare(
    `UPDATE connector_sync_conflicts SET status = 'resolved', resolved_at = CURRENT_TIMESTAMP
     WHERE workspace_id = ? AND provider = 'onedrive' AND entity_kind = ? AND entity_id = ? AND status = 'open'`,
  ).bind(workspaceId, kind, entityId).run();
}

async function recordConflict(db: D1Database, workspaceId: string, entry: WorkspaceSnapshotEntry, local: Record<string, unknown>, reason: string) {
  const details = [
    "# OneDrive 同步冲突",
    "",
    `- 类型：${entry.kind}`,
    `- 条目：${entry.id}`,
    `- 原因：${reason}`,
    `- 检测时间：${new Date().toISOString()}`,
    "",
    "SuperSophie 保留了 App Cloud 本地版本；OneDrive 版本完整保存在本冲突记录中，可人工核对后解决。",
  ].join("\n");
  await db.prepare(
    `INSERT INTO connector_sync_conflicts
      (id, workspace_id, provider, entity_kind, entity_id, local_markdown, remote_markdown, details_markdown, status)
     VALUES (?, ?, 'onedrive', ?, ?, ?, ?, ?, 'open')
     ON CONFLICT(workspace_id, provider, entity_kind, entity_id, status) DO UPDATE SET
       local_markdown = excluded.local_markdown,
       remote_markdown = excluded.remote_markdown,
       details_markdown = excluded.details_markdown,
       created_at = CURRENT_TIMESTAMP`,
  ).bind(
    crypto.randomUUID(), workspaceId, entry.kind, entry.id,
    markdownRecord(`App Cloud · ${entry.id}`, local),
    markdownRecord(`OneDrive · ${entry.id}`, entry.data, entry.markdown),
    details,
  ).run();
}

async function tombstoneFor(db: D1Database, workspaceId: string, kind: string, entityId: string) {
  return db.prepare(
    `SELECT deleted_revision AS deletedRevision, deleted_at AS deletedAt FROM workspace_tombstones
     WHERE workspace_id = ? AND entity_kind = ? AND entity_id = ? LIMIT 1`,
  ).bind(workspaceId, kind, entityId).first<{ deletedRevision: number; deletedAt: string }>();
}

async function applyTombstone(db: D1Database, workspaceId: string, entry: WorkspaceSnapshotEntry) {
  const targetKind = String(entry.data.entity_kind ?? "");
  const targetId = String(entry.data.entity_id ?? "");
  const spec = specByKind.get(targetKind);
  if (!spec?.deletable || !targetId) return { deleted: 0, conflicts: 0 };
  const local = await globallyExisting(db, spec, targetId);
  if (local && !(await ownsEntity(db, workspaceId, spec, targetId))) return { deleted: 0, conflicts: 1 };
  const deletedRevision = numberValue(entry.data.deleted_revision);
  const deletedAt = String(entry.data.deleted_at ?? "");
  if (local) {
    const localRevision = spec.revisionColumn ? numberValue(local[spec.revisionColumn]) : 0;
    const localUpdated = spec.updatedColumn ? timeValue(local[spec.updatedColumn]) : 0;
    if (localRevision > deletedRevision || localUpdated > timeValue(deletedAt)) {
      await recordConflict(db, workspaceId, { ...entry, kind: targetKind, id: targetId }, local, "远端删除与本地较新修改冲突");
      return { deleted: 0, conflicts: 1 };
    }
    await db.prepare(`DELETE FROM ${spec.table} WHERE ${spec.primaryKey} = ?`).bind(targetId).run();
  }
  await db.prepare(
    `INSERT INTO workspace_tombstones
      (id, workspace_id, entity_kind, entity_id, deleted_revision, deleted_at, details_markdown)
     VALUES (?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(workspace_id, entity_kind, entity_id) DO UPDATE SET
       deleted_revision = MAX(workspace_tombstones.deleted_revision, excluded.deleted_revision),
       deleted_at = MAX(workspace_tombstones.deleted_at, excluded.deleted_at),
       details_markdown = excluded.details_markdown`,
  ).bind(String(entry.data.id ?? crypto.randomUUID()), workspaceId, targetKind, targetId, deletedRevision, deletedAt || new Date().toISOString(), entry.markdown).run();
  return { deleted: local ? 1 : 0, conflicts: 0 };
}

export type WorkspaceMergeResult = {
  inserted: number;
  updated: number;
  unchanged: number;
  keptLocal: number;
  deleted: number;
  conflicts: number;
  skipped: number;
};

export async function mergeWorkspaceSnapshot(db: D1Database, workspaceId: string, snapshot: WorkspaceSnapshot): Promise<WorkspaceMergeResult> {
  if (snapshot.workspaceId !== workspaceId) throw new Error("OneDrive 快照属于另一个工作区，已拒绝合并");
  const result: WorkspaceMergeResult = { inserted: 0, updated: 0, unchanged: 0, keptLocal: 0, deleted: 0, conflicts: 0, skipped: 0 };

  for (const entry of snapshot.entries.filter((item) => item.kind === "tombstone")) {
    const outcome = await applyTombstone(db, workspaceId, entry);
    result.deleted += outcome.deleted;
    result.conflicts += outcome.conflicts;
  }

  for (const entry of snapshot.entries.filter((item) => item.kind !== "tombstone")) {
    const spec = specByKind.get(entry.kind);
    if (!spec) { result.skipped += 1; continue; }
    const row = normalizedRow(entry, workspaceId, spec);
    if (!validRemoteRow(row, spec) || !(await parentBelongsToWorkspace(db, workspaceId, spec, row))) {
      result.skipped += 1;
      continue;
    }
    const primary = row[spec.primaryKey];
    const existing = await globallyExisting(db, spec, primary);
    if (existing && !(await ownsEntity(db, workspaceId, spec, primary))) {
      result.conflicts += 1;
      continue;
    }

    const tombstone = await tombstoneFor(db, workspaceId, entry.kind, entry.id);
    if (tombstone) {
      const remoteRevision = spec.revisionColumn ? numberValue(row[spec.revisionColumn]) : 0;
      const remoteUpdated = spec.updatedColumn ? timeValue(row[spec.updatedColumn]) : 0;
      if (remoteRevision <= tombstone.deletedRevision && remoteUpdated <= timeValue(tombstone.deletedAt)) {
        result.keptLocal += 1;
        continue;
      }
      await db.prepare(`DELETE FROM workspace_tombstones WHERE workspace_id = ? AND entity_kind = ? AND entity_id = ?`)
        .bind(workspaceId, entry.kind, entry.id).run();
    }

    const decision = decideSnapshotMerge(existing, row, entry.kind);
    if (decision === "insert" || decision === "replace") {
      await upsertRow(db, spec, row);
      await resolveConflict(db, workspaceId, entry.kind, entry.id);
      if (decision === "insert") result.inserted += 1;
      else result.updated += 1;
    } else if (decision === "same") {
      await resolveConflict(db, workspaceId, entry.kind, entry.id);
      result.unchanged += 1;
    } else if (decision === "keep-local") {
      result.keptLocal += 1;
    } else {
      await recordConflict(db, workspaceId, entry, existing ?? {}, "同一修订包含不同内容");
      result.conflicts += 1;
    }
  }
  return result;
}

function parseConflictCopy(markdown: string) {
  const match = markdown.match(/```json\r?\n([\s\S]*?)\r?\n```([\s\S]*)$/);
  if (!match) throw new Error("冲突副本缺少结构化元数据");
  const data = JSON.parse(match[1]) as Record<string, unknown>;
  if (!data || typeof data !== "object" || Array.isArray(data)) throw new Error("冲突副本元数据无效");
  return { data, markdown: match[2].trim() };
}

export async function resolveWorkspaceSyncConflict(input: {
  db: D1Database;
  workspaceId: string;
  conflictId: string;
  resolution: "keep-local" | "use-remote";
}) {
  const conflict = await input.db.prepare(
    `SELECT id, entity_kind AS entityKind, entity_id AS entityId, remote_markdown AS remoteMarkdown
     FROM connector_sync_conflicts
     WHERE id = ? AND workspace_id = ? AND provider = 'onedrive' AND status = 'open' LIMIT 1`,
  ).bind(input.conflictId, input.workspaceId).first<{ id: string; entityKind: string; entityId: string; remoteMarkdown: string }>();
  if (!conflict) throw new Error("同步冲突不存在或已经解决");

  if (input.resolution === "use-remote") {
    const spec = specByKind.get(conflict.entityKind);
    if (!spec) throw new Error("此类冲突不支持自动采用 OneDrive 版本");
    const copy = parseConflictCopy(conflict.remoteMarkdown);
    const entry: WorkspaceSnapshotEntry = { kind: conflict.entityKind, id: conflict.entityId, data: copy.data, markdown: copy.markdown };
    const row = normalizedRow(entry, input.workspaceId, spec);
    if (!validRemoteRow(row, spec) || !(await parentBelongsToWorkspace(input.db, input.workspaceId, spec, row))) {
      throw new Error("OneDrive 冲突副本引用了无效的父级资源");
    }
    const existing = await globallyExisting(input.db, spec, row[spec.primaryKey]);
    if (existing && !(await ownsEntity(input.db, input.workspaceId, spec, row[spec.primaryKey]))) {
      throw new Error("冲突条目不属于当前工作区");
    }
    await upsertRow(input.db, spec, row);
    await input.db.prepare(
      `DELETE FROM workspace_tombstones WHERE workspace_id = ? AND entity_kind = ? AND entity_id = ?`,
    ).bind(input.workspaceId, conflict.entityKind, conflict.entityId).run();
  }

  await input.db.prepare(
    `DELETE FROM connector_sync_conflicts
     WHERE workspace_id = ? AND provider = 'onedrive' AND entity_kind = ? AND entity_id = ? AND status = 'resolved'`,
  ).bind(input.workspaceId, conflict.entityKind, conflict.entityId).run();
  await input.db.prepare(
    `UPDATE connector_sync_conflicts SET
       status = 'resolved',
       resolved_at = CURRENT_TIMESTAMP,
       details_markdown = details_markdown || ?
     WHERE id = ? AND workspace_id = ? AND status = 'open'`,
  ).bind(`\n\n- 人工处理：${input.resolution === "keep-local" ? "保留 App Cloud" : "采用 OneDrive"}`, input.conflictId, input.workspaceId).run();
  return { id: input.conflictId, resolution: input.resolution };
}
