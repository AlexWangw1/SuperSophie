export async function recordWorkspaceTombstone(input: {
  db: D1Database;
  workspaceId: string;
  entityKind: string;
  entityId: string;
  deletedRevision?: number;
}) {
  const deletedAt = new Date().toISOString();
  const details = [
    "---",
    "sophie: 1",
    "kind: deletion-tombstone",
    `entityKind: ${input.entityKind}`,
    `entityId: ${input.entityId}`,
    `deletedRevision: ${input.deletedRevision ?? 0}`,
    `deletedAt: ${deletedAt}`,
    "---",
    "",
    "此记录用于在 App Cloud 与用户自选云盘之间同步删除操作。",
  ].join("\n");
  await input.db.prepare(
    `INSERT INTO workspace_tombstones
      (id, workspace_id, entity_kind, entity_id, deleted_revision, deleted_at, details_markdown)
     VALUES (?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(workspace_id, entity_kind, entity_id) DO UPDATE SET
       deleted_revision = MAX(workspace_tombstones.deleted_revision, excluded.deleted_revision),
       deleted_at = excluded.deleted_at,
       details_markdown = excluded.details_markdown`,
  ).bind(
    crypto.randomUUID(), input.workspaceId, input.entityKind, input.entityId,
    input.deletedRevision ?? 0, deletedAt, details,
  ).run();
}

export async function clearWorkspaceTombstone(db: D1Database, workspaceId: string, entityKind: string, entityId: string) {
  await db.prepare(
    `DELETE FROM workspace_tombstones WHERE workspace_id = ? AND entity_kind = ? AND entity_id = ?`,
  ).bind(workspaceId, entityKind, entityId).run();
}
