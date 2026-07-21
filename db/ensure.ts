import { env } from "cloudflare:workers";

let schemaReady: Promise<unknown[]> | undefined;

export function ensureSchema() {
  if (!env.DB) throw new Error("D1 binding DB is unavailable");
  schemaReady ??= env.DB.batch([
    env.DB.prepare(`CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      handle TEXT NOT NULL UNIQUE,
      display_name TEXT NOT NULL,
      access_key_hash TEXT NOT NULL,
      access_key_salt TEXT NOT NULL,
      access_key_iterations INTEGER NOT NULL DEFAULT 600000,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`),
    env.DB.prepare(`CREATE TABLE IF NOT EXISTS workspaces (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      owner_user_id TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`),
    env.DB.prepare(`CREATE TABLE IF NOT EXISTS workspace_members (
      workspace_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'owner',
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (workspace_id, user_id)
    )`),
    env.DB.prepare(`CREATE INDEX IF NOT EXISTS workspace_members_user_idx
      ON workspace_members (user_id, created_at)`),
    env.DB.prepare(`CREATE TABLE IF NOT EXISTS sessions (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      token_hash TEXT NOT NULL UNIQUE,
      active_workspace_id TEXT NOT NULL,
      device_label TEXT NOT NULL DEFAULT '',
      expires_at TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      last_seen_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`),
    env.DB.prepare(`CREATE INDEX IF NOT EXISTS sessions_user_expires_idx
      ON sessions (user_id, expires_at)`),
    env.DB.prepare(`CREATE TABLE IF NOT EXISTS auth_login_limits (
      id TEXT PRIMARY KEY,
      failures INTEGER NOT NULL DEFAULT 0,
      window_started_at TEXT NOT NULL,
      blocked_until TEXT,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`),
    env.DB.prepare(`CREATE TABLE IF NOT EXISTS security_events (
      id TEXT PRIMARY KEY,
      user_id TEXT,
      workspace_id TEXT,
      event_type TEXT NOT NULL,
      details_markdown TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`),
    env.DB.prepare(`CREATE INDEX IF NOT EXISTS security_events_user_created_idx
      ON security_events (user_id, created_at DESC)`),
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
    env.DB.prepare(`CREATE INDEX IF NOT EXISTS agent_runs_workspace_updated_idx
      ON agent_runs (workspace_id, updated_at DESC)`),
    env.DB.prepare(`CREATE TABLE IF NOT EXISTS agent_run_events (
      id TEXT PRIMARY KEY,
      run_id TEXT NOT NULL,
      agent_name TEXT NOT NULL,
      event_type TEXT NOT NULL,
      content_markdown TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`),
    env.DB.prepare(`CREATE INDEX IF NOT EXISTS agent_run_events_run_created_idx
      ON agent_run_events (run_id, created_at)`),
    env.DB.prepare(`CREATE TABLE IF NOT EXISTS conversations (
      id TEXT PRIMARY KEY,
      workspace_id TEXT NOT NULL DEFAULT 'default',
      title TEXT NOT NULL,
      model_id TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`),
    env.DB.prepare(`CREATE INDEX IF NOT EXISTS conversations_workspace_updated_idx
      ON conversations (workspace_id, updated_at DESC)`),
    env.DB.prepare(`CREATE TABLE IF NOT EXISTS chat_messages (
      id TEXT PRIMARY KEY,
      conversation_id TEXT NOT NULL,
      role TEXT NOT NULL,
      content_markdown TEXT NOT NULL,
      run_id TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`),
    env.DB.prepare(`CREATE INDEX IF NOT EXISTS chat_messages_conversation_created_idx
      ON chat_messages (conversation_id, created_at)`),
    env.DB.prepare(`CREATE TABLE IF NOT EXISTS data_sources (
      id TEXT PRIMARY KEY,
      workspace_id TEXT NOT NULL DEFAULT 'default',
      name TEXT NOT NULL,
      schema_markdown TEXT NOT NULL,
      revision INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`),
    env.DB.prepare(`CREATE TABLE IF NOT EXISTS database_property_schemas (
      data_source_id TEXT PRIMARY KEY,
      schema_json TEXT NOT NULL DEFAULT '{}',
      schema_markdown TEXT NOT NULL DEFAULT '',
      revision INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`),
    env.DB.prepare(`CREATE TABLE IF NOT EXISTS database_views (
      id TEXT PRIMARY KEY,
      data_source_id TEXT NOT NULL,
      name TEXT NOT NULL,
      view_type TEXT NOT NULL,
      config_markdown TEXT NOT NULL,
      config_json TEXT NOT NULL DEFAULT '{}',
      revision INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`),
    env.DB.prepare(`CREATE INDEX IF NOT EXISTS database_views_source_idx
      ON database_views (data_source_id, updated_at)`),
    env.DB.prepare(`CREATE TABLE IF NOT EXISTS database_records (
      id TEXT PRIMARY KEY,
      data_source_id TEXT NOT NULL,
      title TEXT NOT NULL,
      markdown TEXT NOT NULL,
      properties_json TEXT NOT NULL DEFAULT '{}',
      revision INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`),
    env.DB.prepare(`CREATE INDEX IF NOT EXISTS database_records_source_updated_idx
      ON database_records (data_source_id, updated_at DESC)`),
    env.DB.prepare(`CREATE TABLE IF NOT EXISTS code_projects (
      id TEXT PRIMARY KEY,
      workspace_id TEXT NOT NULL DEFAULT 'default',
      name TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`),
    env.DB.prepare(`CREATE TABLE IF NOT EXISTS code_files (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL,
      path TEXT NOT NULL,
      language TEXT NOT NULL DEFAULT 'text',
      content_markdown TEXT NOT NULL,
      content_text TEXT NOT NULL DEFAULT '',
      revision INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE (project_id, path)
    )`),
    env.DB.prepare(`CREATE INDEX IF NOT EXISTS code_files_project_path_idx
      ON code_files (project_id, path)`),
    env.DB.prepare(`CREATE TABLE IF NOT EXISTS connector_outbox (
      id TEXT PRIMARY KEY,
      workspace_id TEXT NOT NULL DEFAULT 'default',
      channel TEXT NOT NULL,
      payload_markdown TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'review',
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      sent_at TEXT
    )`),
    env.DB.prepare(`CREATE TABLE IF NOT EXISTS connector_outbox_details (
      outbox_id TEXT PRIMARY KEY,
      target TEXT NOT NULL,
      metadata_json TEXT NOT NULL DEFAULT '{}'
    )`),
    env.DB.prepare(`CREATE TABLE IF NOT EXISTS connector_delivery_attempts (
      id TEXT PRIMARY KEY,
      outbox_id TEXT NOT NULL,
      channel TEXT NOT NULL,
      status TEXT NOT NULL,
      response_markdown TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`),
    env.DB.prepare(`CREATE INDEX IF NOT EXISTS connector_delivery_attempts_outbox_idx
      ON connector_delivery_attempts (outbox_id, created_at DESC)`),
    env.DB.prepare(`CREATE TABLE IF NOT EXISTS connector_credentials (
      id TEXT PRIMARY KEY,
      workspace_id TEXT NOT NULL DEFAULT 'default',
      provider TEXT NOT NULL,
      credential_ciphertext TEXT NOT NULL,
      account_label TEXT NOT NULL DEFAULT '',
      scopes TEXT NOT NULL DEFAULT '',
      expires_at TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE (workspace_id, provider)
    )`),
    env.DB.prepare(`CREATE TABLE IF NOT EXISTS connector_oauth_states (
      state TEXT PRIMARY KEY,
      workspace_id TEXT NOT NULL DEFAULT 'default',
      provider TEXT NOT NULL,
      code_verifier TEXT NOT NULL,
      redirect_uri TEXT NOT NULL,
      expires_at TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`),
    env.DB.prepare(`CREATE TABLE IF NOT EXISTS connector_sync_events (
      id TEXT PRIMARY KEY,
      workspace_id TEXT NOT NULL DEFAULT 'default',
      provider TEXT NOT NULL,
      status TEXT NOT NULL,
      remote_path TEXT NOT NULL DEFAULT '',
      details_markdown TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`),
    env.DB.prepare(`CREATE INDEX IF NOT EXISTS connector_sync_events_workspace_idx
      ON connector_sync_events (workspace_id, provider, created_at DESC)`),
    env.DB.prepare(`CREATE TABLE IF NOT EXISTS connector_sync_conflicts (
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
    )`),
    env.DB.prepare(`CREATE UNIQUE INDEX IF NOT EXISTS connector_sync_conflicts_open_idx
      ON connector_sync_conflicts (workspace_id, provider, entity_kind, entity_id, status)`),
    env.DB.prepare(`CREATE TABLE IF NOT EXISTS workspace_tombstones (
      id TEXT PRIMARY KEY,
      workspace_id TEXT NOT NULL,
      entity_kind TEXT NOT NULL,
      entity_id TEXT NOT NULL,
      deleted_revision INTEGER NOT NULL DEFAULT 0,
      deleted_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      details_markdown TEXT NOT NULL DEFAULT ''
    )`),
    env.DB.prepare(`CREATE UNIQUE INDEX IF NOT EXISTS workspace_tombstones_entity_idx
      ON workspace_tombstones (workspace_id, entity_kind, entity_id)`),
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
    env.DB.prepare(`CREATE TABLE IF NOT EXISTS asset_ownership (
      asset_id TEXT NOT NULL,
      workspace_id TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (asset_id, workspace_id)
    )`),
    env.DB.prepare(`CREATE INDEX IF NOT EXISTS asset_ownership_workspace_idx
      ON asset_ownership (workspace_id, created_at DESC)`),
    env.DB.prepare(`CREATE TABLE IF NOT EXISTS document_assets (
      document_id TEXT NOT NULL,
      asset_id TEXT NOT NULL,
      workspace_id TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (document_id, asset_id)
    )`),
    env.DB.prepare(`CREATE INDEX IF NOT EXISTS document_assets_workspace_idx
      ON document_assets (workspace_id, created_at DESC)`),
  ]);
  return schemaReady;
}
