import { env } from "cloudflare:workers";

let schemaReady: Promise<unknown[]> | undefined;

export function ensureSchema() {
  if (!env.DB) throw new Error("D1 binding DB is unavailable");
  schemaReady ??= env.DB.batch([
    env.DB.prepare(`CREATE TABLE IF NOT EXISTS documents (
      id TEXT PRIMARY KEY,
      workspace_id TEXT NOT NULL DEFAULT 'default',
      title TEXT NOT NULL,
      icon TEXT NOT NULL DEFAULT '📄',
      kind TEXT NOT NULL DEFAULT 'page',
      markdown TEXT NOT NULL DEFAULT '',
      properties_json TEXT NOT NULL DEFAULT '{}',
      revision INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`),
    env.DB.prepare(`CREATE INDEX IF NOT EXISTS documents_workspace_updated_idx
      ON documents (workspace_id, updated_at DESC)`),
    env.DB.prepare(`CREATE TABLE IF NOT EXISTS agent_runs (
      id TEXT PRIMARY KEY,
      parent_id TEXT,
      workspace_id TEXT NOT NULL DEFAULT 'default',
      name TEXT NOT NULL,
      goal_markdown TEXT NOT NULL,
      model TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'planned',
      approval TEXT NOT NULL DEFAULT 'auto',
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`),
    env.DB.prepare(`CREATE TABLE IF NOT EXISTS connector_outbox (
      id TEXT PRIMARY KEY,
      workspace_id TEXT NOT NULL DEFAULT 'default',
      channel TEXT NOT NULL,
      payload_markdown TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'review',
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      sent_at TEXT
    )`),
    env.DB.prepare(`CREATE TABLE IF NOT EXISTS assets (
      id TEXT PRIMARY KEY,
      document_id TEXT,
      name TEXT NOT NULL,
      mime TEXT NOT NULL,
      size INTEGER NOT NULL,
      sha256 TEXT NOT NULL,
      r2_key TEXT NOT NULL UNIQUE,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`),
  ]);
  return schemaReady;
}

