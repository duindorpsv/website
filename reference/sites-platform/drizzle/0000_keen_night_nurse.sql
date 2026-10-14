CREATE TABLE `sportlink_cache` (
	`cache_key` text PRIMARY KEY NOT NULL,
	`payload_json` text,
	`updated_at` integer DEFAULT 0 NOT NULL,
	`expires_at` integer DEFAULT 0 NOT NULL,
	`refresh_after` integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE `sportlink_clubs` (
	`club_code` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`logo_url` text,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `sportlink_matches` (
	`id` text PRIMARY KEY NOT NULL,
	`kickoff` text NOT NULL,
	`home_team_code` text NOT NULL,
	`away_team_code` text NOT NULL,
	`home_club_code` text NOT NULL,
	`away_club_code` text NOT NULL,
	`status` text NOT NULL,
	`payload_json` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `sportlink_teams` (
	`id` text PRIMARY KEY NOT NULL,
	`team_code` text NOT NULL,
	`local_team_code` text NOT NULL,
	`name` text NOT NULL,
	`category` text NOT NULL,
	`gender` text NOT NULL,
	`sport` text NOT NULL,
	`day` text NOT NULL,
	`competitions_json` text NOT NULL,
	`active` integer DEFAULT 1 NOT NULL,
	`updated_at` text NOT NULL
);
