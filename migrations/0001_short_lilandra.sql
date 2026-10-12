CREATE TABLE `shared_snapshots` (
	`share_id` text PRIMARY KEY NOT NULL,
	`document_json` text NOT NULL,
	`created_at` integer NOT NULL,
	`expires_at` integer NOT NULL,
	`management_token_hash` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `shared_snapshots_expiry` ON `shared_snapshots` (`expires_at`);