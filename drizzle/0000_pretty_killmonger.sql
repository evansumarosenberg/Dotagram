CREATE TABLE `event_dedup` (
	`key` text PRIMARY KEY NOT NULL,
	`state` text NOT NULL,
	`claim_token` text,
	`claim_expires_at` integer NOT NULL,
	`expires_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `event_dedup_expiry` ON `event_dedup` (`expires_at`);--> statement-breakpoint
CREATE TABLE `subscriptions` (
	`id` text PRIMARY KEY NOT NULL,
	`owner` text NOT NULL,
	`name` text NOT NULL,
	`args` text NOT NULL,
	`bot_id` text NOT NULL,
	`telegram_owner` text NOT NULL,
	`callback` text NOT NULL,
	`secret` text,
	`secret_hash` text NOT NULL,
	`previous_secret` text,
	`previous_secret_expires_at` integer,
	`verified_at` integer NOT NULL,
	`created_at` integer NOT NULL,
	`expires_at` integer NOT NULL,
	`active` integer NOT NULL
);
