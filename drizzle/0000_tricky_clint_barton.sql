CREATE TABLE `agent_runs` (
	`id` text PRIMARY KEY NOT NULL,
	`parent_id` text,
	`workspace_id` text DEFAULT 'default' NOT NULL,
	`name` text NOT NULL,
	`goal_markdown` text NOT NULL,
	`model` text NOT NULL,
	`status` text DEFAULT 'planned' NOT NULL,
	`approval` text DEFAULT 'auto' NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE TABLE `assets` (
	`id` text PRIMARY KEY NOT NULL,
	`document_id` text,
	`name` text NOT NULL,
	`mime` text NOT NULL,
	`size` integer NOT NULL,
	`sha256` text NOT NULL,
	`r2_key` text NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `assets_r2_key_unique` ON `assets` (`r2_key`);--> statement-breakpoint
CREATE TABLE `connector_outbox` (
	`id` text PRIMARY KEY NOT NULL,
	`workspace_id` text DEFAULT 'default' NOT NULL,
	`channel` text NOT NULL,
	`payload_markdown` text NOT NULL,
	`status` text DEFAULT 'review' NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`sent_at` text
);
--> statement-breakpoint
CREATE TABLE `documents` (
	`id` text PRIMARY KEY NOT NULL,
	`workspace_id` text DEFAULT 'default' NOT NULL,
	`title` text NOT NULL,
	`icon` text DEFAULT '📄' NOT NULL,
	`kind` text DEFAULT 'page' NOT NULL,
	`markdown` text DEFAULT '' NOT NULL,
	`properties_json` text DEFAULT '{}' NOT NULL,
	`revision` integer DEFAULT 1 NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
