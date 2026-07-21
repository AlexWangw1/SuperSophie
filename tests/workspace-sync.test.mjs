import assert from "node:assert/strict";
import test from "node:test";
import { DatabaseSync } from "node:sqlite";
import { mergeWorkspaceSnapshot, resolveWorkspaceSyncConflict } from "../lib/connectors/workspace-sync.ts";

class D1StatementAdapter {
  constructor(database, sql) {
    this.statement = database.prepare(sql);
    this.values = [];
  }

  bind(...values) {
    this.values = values;
    return this;
  }

  first() {
    return this.statement.get(...this.values) ?? null;
  }

  all() {
    return { results: this.statement.all(...this.values) };
  }

  run() {
    const result = this.statement.run(...this.values);
    return { meta: { changes: Number(result.changes) } };
  }
}

function d1Fixture() {
  const sqlite = new DatabaseSync(":memory:");
  sqlite.exec(`
    CREATE TABLE documents (
      id TEXT PRIMARY KEY,
      workspace_id TEXT NOT NULL,
      title TEXT NOT NULL,
      icon TEXT NOT NULL DEFAULT '📄',
      kind TEXT NOT NULL DEFAULT 'page',
      markdown TEXT NOT NULL,
      properties_json TEXT NOT NULL DEFAULT '{}',
      revision INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE TABLE connector_sync_conflicts (
      id TEXT PRIMARY KEY,
      workspace_id TEXT NOT NULL,
      provider TEXT NOT NULL,
      entity_kind TEXT NOT NULL,
      entity_id TEXT NOT NULL,
      local_markdown TEXT NOT NULL,
      remote_markdown TEXT NOT NULL,
      details_markdown TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'open',
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      resolved_at TEXT
    );
    CREATE UNIQUE INDEX connector_sync_conflicts_open_idx
      ON connector_sync_conflicts (workspace_id, provider, entity_kind, entity_id, status);
    CREATE TABLE workspace_tombstones (
      id TEXT PRIMARY KEY,
      workspace_id TEXT NOT NULL,
      entity_kind TEXT NOT NULL,
      entity_id TEXT NOT NULL,
      deleted_revision INTEGER NOT NULL DEFAULT 0,
      deleted_at TEXT NOT NULL,
      details_markdown TEXT NOT NULL DEFAULT ''
    );
    CREATE UNIQUE INDEX workspace_tombstones_entity_idx
      ON workspace_tombstones (workspace_id, entity_kind, entity_id);
  `);
  return {
    sqlite,
    d1: { prepare: (sql) => new D1StatementAdapter(sqlite, sql) },
  };
}

function documentEntry(overrides = {}) {
  const data = {
    id: "workspace-1:page-1",
    workspace_id: "workspace-1",
    title: "远端页面",
    icon: "📄",
    kind: "page",
    markdown: "# 远端页面",
    properties_json: "{}",
    revision: 2,
    created_at: "2026-07-21T09:00:00.000Z",
    updated_at: "2026-07-21T10:00:00.000Z",
    ...overrides,
  };
  return { kind: "document", id: data.id, data, markdown: data.markdown };
}

test("D1 merge records equal-revision divergence and lets the user adopt OneDrive", async () => {
  const { sqlite, d1 } = d1Fixture();
  sqlite.prepare(`INSERT INTO documents
    (id, workspace_id, title, icon, kind, markdown, properties_json, revision, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
    .run("workspace-1:page-1", "workspace-1", "本地页面", "📄", "page", "# 本地页面", "{}", 2, "2026-07-21T09:00:00.000Z", "2026-07-21T10:00:00.000Z");

  const result = await mergeWorkspaceSnapshot(d1, "workspace-1", {
    version: 2,
    workspaceId: "workspace-1",
    generatedAt: "2026-07-21T10:01:00.000Z",
    entries: [documentEntry()],
  });
  assert.equal(result.conflicts, 1);
  assert.equal(sqlite.prepare("SELECT markdown FROM documents WHERE id = ?").get("workspace-1:page-1").markdown, "# 本地页面");

  const conflict = sqlite.prepare("SELECT id, status FROM connector_sync_conflicts").get();
  assert.equal(conflict.status, "open");
  await resolveWorkspaceSyncConflict({ db: d1, workspaceId: "workspace-1", conflictId: conflict.id, resolution: "use-remote" });
  assert.equal(sqlite.prepare("SELECT markdown FROM documents WHERE id = ?").get("workspace-1:page-1").markdown, "# 远端页面");
  assert.equal(sqlite.prepare("SELECT status FROM connector_sync_conflicts WHERE id = ?").get(conflict.id).status, "resolved");
  sqlite.close();
});

test("D1 merge accepts a newer revision and propagates a newer remote deletion", async () => {
  const { sqlite, d1 } = d1Fixture();
  const first = await mergeWorkspaceSnapshot(d1, "workspace-1", {
    version: 2,
    workspaceId: "workspace-1",
    generatedAt: "2026-07-21T10:01:00.000Z",
    entries: [documentEntry({ revision: 3 })],
  });
  assert.equal(first.inserted, 1);

  const tombstone = {
    id: "tombstone-1",
    workspace_id: "workspace-1",
    entity_kind: "document",
    entity_id: "workspace-1:page-1",
    deleted_revision: 4,
    deleted_at: "2026-07-21T11:00:00.000Z",
    details_markdown: "# 删除页面",
  };
  const second = await mergeWorkspaceSnapshot(d1, "workspace-1", {
    version: 2,
    workspaceId: "workspace-1",
    generatedAt: "2026-07-21T11:01:00.000Z",
    entries: [{ kind: "tombstone", id: tombstone.id, data: tombstone, markdown: tombstone.details_markdown }],
  });
  assert.equal(second.deleted, 1);
  assert.equal(sqlite.prepare("SELECT COUNT(*) AS count FROM documents").get().count, 0);
  assert.equal(sqlite.prepare("SELECT COUNT(*) AS count FROM workspace_tombstones").get().count, 1);
  sqlite.close();
});
