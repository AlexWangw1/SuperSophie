CREATE TABLE `database_templates` (
	`id` text PRIMARY KEY NOT NULL,
	`data_source_id` text NOT NULL,
	`name` text NOT NULL,
	`icon` text DEFAULT '✦' NOT NULL,
	`description` text DEFAULT '' NOT NULL,
	`title_template` text DEFAULT '未命名' NOT NULL,
	`template_markdown` text DEFAULT '' NOT NULL,
	`properties_json` text DEFAULT '{}' NOT NULL,
	`revision` integer DEFAULT 1 NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
INSERT OR IGNORE INTO `database_templates`
  (`id`, `data_source_id`, `name`, `icon`, `description`, `title_template`, `template_markdown`, `properties_json`)
SELECT
  `id` || ':template:standard',
  `id`,
  '标准记录',
  '✦',
  '带有基础状态与正文的记录',
  '未命名',
  '---' || char(10) ||
    'sophie: 1' || char(10) ||
    'id: ' || `id` || ':template:standard' || char(10) ||
    'kind: database-template' || char(10) ||
    'dataSourceId: ' || `id` || char(10) ||
    'name: "标准记录"' || char(10) ||
    'titleTemplate: "未命名"' || char(10) ||
    'properties: {"status":"Inbox","tags":[]}' || char(10) ||
    '---' || char(10) || char(10) ||
    '# 标准记录' || char(10) || char(10) ||
    '在这里填写记录正文。' || char(10),
  '{"status":"Inbox","tags":[]}'
FROM `data_sources`;
