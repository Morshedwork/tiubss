CREATE TABLE `admin_accounts` (
	`id` text PRIMARY KEY NOT NULL,
	`email` text NOT NULL,
	`name` text NOT NULL,
	`password_hash` text,
	`status` text NOT NULL,
	`invite_hash` text,
	`invite_expires_at` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `admin_accounts_email_unique` ON `admin_accounts` (`email`);--> statement-breakpoint
CREATE UNIQUE INDEX `admin_accounts_invite_hash_unique` ON `admin_accounts` (`invite_hash`);--> statement-breakpoint
ALTER TABLE `admin_audit` ADD `actor` text DEFAULT 'Admin' NOT NULL;--> statement-breakpoint
ALTER TABLE `admin_sessions` ADD `account_id` text;