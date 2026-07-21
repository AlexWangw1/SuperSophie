CREATE TABLE `agent_run_events` (
	`id` text PRIMARY KEY NOT NULL,
	`run_id` text NOT NULL,
	`agent_name` text NOT NULL,
	`event_type` text NOT NULL,
	`content_markdown` text DEFAULT '' NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE TABLE `asset_ownership` (
	`asset_id` text NOT NULL,
	`workspace_id` text NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE TABLE `auth_login_limits` (
	`id` text PRIMARY KEY NOT NULL,
	`failures` integer DEFAULT 0 NOT NULL,
	`window_started_at` text NOT NULL,
	`blocked_until` text,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE TABLE `chat_messages` (
	`id` text PRIMARY KEY NOT NULL,
	`conversation_id` text NOT NULL,
	`role` text NOT NULL,
	`content_markdown` text NOT NULL,
	`run_id` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE TABLE `code_files` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text NOT NULL,
	`path` text NOT NULL,
	`language` text DEFAULT 'text' NOT NULL,
	`content_markdown` text NOT NULL,
	`content_text` text DEFAULT '' NOT NULL,
	`revision` integer DEFAULT 1 NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE TABLE `code_projects` (
	`id` text PRIMARY KEY NOT NULL,
	`workspace_id` text DEFAULT 'default' NOT NULL,
	`name` text NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE TABLE `connector_credentials` (
	`id` text PRIMARY KEY NOT NULL,
	`workspace_id` text DEFAULT 'default' NOT NULL,
	`provider` text NOT NULL,
	`credential_ciphertext` text NOT NULL,
	`account_label` text DEFAULT '' NOT NULL,
	`scopes` text DEFAULT '' NOT NULL,
	`expires_at` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE TABLE `connector_delivery_attempts` (
	`id` text PRIMARY KEY NOT NULL,
	`outbox_id` text NOT NULL,
	`channel` text NOT NULL,
	`status` text NOT NULL,
	`response_markdown` text DEFAULT '' NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE TABLE `connector_oauth_states` (
	`state` text PRIMARY KEY NOT NULL,
	`workspace_id` text DEFAULT 'default' NOT NULL,
	`provider` text NOT NULL,
	`code_verifier` text NOT NULL,
	`redirect_uri` text NOT NULL,
	`expires_at` text NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE TABLE `connector_outbox_details` (
	`outbox_id` text PRIMARY KEY NOT NULL,
	`target` text NOT NULL,
	`metadata_json` text DEFAULT '{}' NOT NULL
);
--> statement-breakpoint
CREATE TABLE `connector_sync_conflicts` (
	`id` text PRIMARY KEY NOT NULL,
	`workspace_id` text NOT NULL,
	`provider` text NOT NULL,
	`entity_kind` text NOT NULL,
	`entity_id` text NOT NULL,
	`local_markdown` text NOT NULL,
	`remote_markdown` text NOT NULL,
	`details_markdown` text NOT NULL,
	`status` text DEFAULT 'open' NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`resolved_at` text
);
--> statement-breakpoint
CREATE UNIQUE INDEX `connector_sync_conflicts_open_idx` ON `connector_sync_conflicts` (`workspace_id`,`provider`,`entity_kind`,`entity_id`,`status`);--> statement-breakpoint
CREATE TABLE `connector_sync_events` (
	`id` text PRIMARY KEY NOT NULL,
	`workspace_id` text DEFAULT 'default' NOT NULL,
	`provider` text NOT NULL,
	`status` text NOT NULL,
	`remote_path` text DEFAULT '' NOT NULL,
	`details_markdown` text DEFAULT '' NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE TABLE `conversations` (
	`id` text PRIMARY KEY NOT NULL,
	`workspace_id` text DEFAULT 'default' NOT NULL,
	`title` text NOT NULL,
	`model_id` text NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE TABLE `data_sources` (
	`id` text PRIMARY KEY NOT NULL,
	`workspace_id` text DEFAULT 'default' NOT NULL,
	`name` text NOT NULL,
	`schema_markdown` text NOT NULL,
	`revision` integer DEFAULT 1 NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE TABLE `database_records` (
	`id` text PRIMARY KEY NOT NULL,
	`data_source_id` text NOT NULL,
	`title` text NOT NULL,
	`markdown` text NOT NULL,
	`properties_json` text DEFAULT '{}' NOT NULL,
	`revision` integer DEFAULT 1 NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE TABLE `database_views` (
	`id` text PRIMARY KEY NOT NULL,
	`data_source_id` text NOT NULL,
	`name` text NOT NULL,
	`view_type` text NOT NULL,
	`config_markdown` text NOT NULL,
	`config_json` text DEFAULT '{}' NOT NULL,
	`revision` integer DEFAULT 1 NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE TABLE `security_events` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text,
	`workspace_id` text,
	`event_type` text NOT NULL,
	`details_markdown` text DEFAULT '' NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE TABLE `sessions` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`token_hash` text NOT NULL,
	`active_workspace_id` text NOT NULL,
	`device_label` text DEFAULT '' NOT NULL,
	`expires_at` text NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`last_seen_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `sessions_token_hash_unique` ON `sessions` (`token_hash`);--> statement-breakpoint
CREATE TABLE `users` (
	`id` text PRIMARY KEY NOT NULL,
	`handle` text NOT NULL,
	`display_name` text NOT NULL,
	`access_key_hash` text NOT NULL,
	`access_key_salt` text NOT NULL,
	`access_key_iterations` integer DEFAULT 600000 NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `users_handle_unique` ON `users` (`handle`);--> statement-breakpoint
CREATE TABLE `workspace_members` (
	`workspace_id` text NOT NULL,
	`user_id` text NOT NULL,
	`role` text DEFAULT 'owner' NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE TABLE `workspace_tombstones` (
	`id` text PRIMARY KEY NOT NULL,
	`workspace_id` text NOT NULL,
	`entity_kind` text NOT NULL,
	`entity_id` text NOT NULL,
	`deleted_revision` integer DEFAULT 0 NOT NULL,
	`deleted_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`details_markdown` text DEFAULT '' NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `workspace_tombstones_entity_idx` ON `workspace_tombstones` (`workspace_id`,`entity_kind`,`entity_id`);--> statement-breakpoint
CREATE TABLE `workspaces` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`owner_user_id` text NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
