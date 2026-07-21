CREATE TABLE `document_assets` (
	`document_id` text NOT NULL,
	`asset_id` text NOT NULL,
	`workspace_id` text NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `document_assets_document_asset_idx` ON `document_assets` (`document_id`,`asset_id`);--> statement-breakpoint
DELETE FROM `asset_ownership`
WHERE rowid NOT IN (
	SELECT MIN(rowid) FROM `asset_ownership` GROUP BY `asset_id`, `workspace_id`
);--> statement-breakpoint
CREATE UNIQUE INDEX `asset_ownership_asset_workspace_idx` ON `asset_ownership` (`asset_id`,`workspace_id`);
