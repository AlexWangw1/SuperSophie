CREATE TABLE `database_property_schemas` (
	`data_source_id` text PRIMARY KEY NOT NULL,
	`schema_json` text DEFAULT '{}' NOT NULL,
	`schema_markdown` text DEFAULT '' NOT NULL,
	`revision` integer DEFAULT 1 NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
