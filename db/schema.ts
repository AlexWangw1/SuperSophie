import { sql } from "drizzle-orm";
import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const documents = sqliteTable("documents", {
  id: text("id").primaryKey(),
  workspaceId: text("workspace_id").notNull().default("default"),
  title: text("title").notNull(),
  icon: text("icon").notNull().default("📄"),
  kind: text("kind").notNull().default("page"),
  markdown: text("markdown").notNull().default(""),
  propertiesJson: text("properties_json").notNull().default("{}"),
  revision: integer("revision").notNull().default(1),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});

export const agentRuns = sqliteTable("agent_runs", {
  id: text("id").primaryKey(),
  parentId: text("parent_id"),
  workspaceId: text("workspace_id").notNull().default("default"),
  name: text("name").notNull(),
  goalMarkdown: text("goal_markdown").notNull(),
  model: text("model").notNull(),
  status: text("status").notNull().default("planned"),
  approval: text("approval").notNull().default("auto"),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});

export const agentRunEvents = sqliteTable("agent_run_events", {
  id: text("id").primaryKey(),
  runId: text("run_id").notNull(),
  agentName: text("agent_name").notNull(),
  eventType: text("event_type").notNull(),
  contentMarkdown: text("content_markdown").notNull().default(""),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});

export const conversations = sqliteTable("conversations", {
  id: text("id").primaryKey(),
  workspaceId: text("workspace_id").notNull().default("default"),
  title: text("title").notNull(),
  modelId: text("model_id").notNull(),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});

export const chatMessages = sqliteTable("chat_messages", {
  id: text("id").primaryKey(),
  conversationId: text("conversation_id").notNull(),
  role: text("role").notNull(),
  contentMarkdown: text("content_markdown").notNull(),
  runId: text("run_id"),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});

export const dataSources = sqliteTable("data_sources", {
  id: text("id").primaryKey(),
  workspaceId: text("workspace_id").notNull().default("default"),
  name: text("name").notNull(),
  schemaMarkdown: text("schema_markdown").notNull(),
  revision: integer("revision").notNull().default(1),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});

export const databaseViews = sqliteTable("database_views", {
  id: text("id").primaryKey(),
  dataSourceId: text("data_source_id").notNull(),
  name: text("name").notNull(),
  viewType: text("view_type").notNull(),
  configMarkdown: text("config_markdown").notNull(),
  configJson: text("config_json").notNull().default("{}"),
  revision: integer("revision").notNull().default(1),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});

export const databaseRecords = sqliteTable("database_records", {
  id: text("id").primaryKey(),
  dataSourceId: text("data_source_id").notNull(),
  title: text("title").notNull(),
  markdown: text("markdown").notNull(),
  propertiesJson: text("properties_json").notNull().default("{}"),
  revision: integer("revision").notNull().default(1),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});

export const codeProjects = sqliteTable("code_projects", {
  id: text("id").primaryKey(),
  workspaceId: text("workspace_id").notNull().default("default"),
  name: text("name").notNull(),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});

export const codeFiles = sqliteTable("code_files", {
  id: text("id").primaryKey(),
  projectId: text("project_id").notNull(),
  path: text("path").notNull(),
  language: text("language").notNull().default("text"),
  contentMarkdown: text("content_markdown").notNull(),
  contentText: text("content_text").notNull().default(""),
  revision: integer("revision").notNull().default(1),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});

export const connectorOutbox = sqliteTable("connector_outbox", {
  id: text("id").primaryKey(),
  workspaceId: text("workspace_id").notNull().default("default"),
  channel: text("channel").notNull(),
  payloadMarkdown: text("payload_markdown").notNull(),
  status: text("status").notNull().default("review"),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  sentAt: text("sent_at"),
});

export const connectorOutboxDetails = sqliteTable("connector_outbox_details", {
  outboxId: text("outbox_id").primaryKey(),
  target: text("target").notNull(),
  metadataJson: text("metadata_json").notNull().default("{}"),
});

export const connectorDeliveryAttempts = sqliteTable("connector_delivery_attempts", {
  id: text("id").primaryKey(),
  outboxId: text("outbox_id").notNull(),
  channel: text("channel").notNull(),
  status: text("status").notNull(),
  responseMarkdown: text("response_markdown").notNull().default(""),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});

export const connectorCredentials = sqliteTable("connector_credentials", {
  id: text("id").primaryKey(),
  workspaceId: text("workspace_id").notNull().default("default"),
  provider: text("provider").notNull(),
  credentialCiphertext: text("credential_ciphertext").notNull(),
  accountLabel: text("account_label").notNull().default(""),
  scopes: text("scopes").notNull().default(""),
  expiresAt: text("expires_at"),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});

export const connectorOauthStates = sqliteTable("connector_oauth_states", {
  state: text("state").primaryKey(),
  workspaceId: text("workspace_id").notNull().default("default"),
  provider: text("provider").notNull(),
  codeVerifier: text("code_verifier").notNull(),
  redirectUri: text("redirect_uri").notNull(),
  expiresAt: text("expires_at").notNull(),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});

export const connectorSyncEvents = sqliteTable("connector_sync_events", {
  id: text("id").primaryKey(),
  workspaceId: text("workspace_id").notNull().default("default"),
  provider: text("provider").notNull(),
  status: text("status").notNull(),
  remotePath: text("remote_path").notNull().default(""),
  detailsMarkdown: text("details_markdown").notNull().default(""),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});

export const assets = sqliteTable("assets", {
  id: text("id").primaryKey(),
  documentId: text("document_id"),
  name: text("name").notNull(),
  mime: text("mime").notNull(),
  size: integer("size").notNull(),
  sha256: text("sha256").notNull(),
  r2Key: text("r2_key").notNull().unique(),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});
