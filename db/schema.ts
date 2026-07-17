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

export const connectorOutbox = sqliteTable("connector_outbox", {
  id: text("id").primaryKey(),
  workspaceId: text("workspace_id").notNull().default("default"),
  channel: text("channel").notNull(),
  payloadMarkdown: text("payload_markdown").notNull(),
  status: text("status").notNull().default("review"),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  sentAt: text("sent_at"),
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

