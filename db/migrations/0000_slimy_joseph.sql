CREATE TABLE "auth_account" (
	"id" text PRIMARY KEY NOT NULL,
	"account_id" text NOT NULL,
	"provider_id" text NOT NULL,
	"user_id" text NOT NULL,
	"access_token" text,
	"refresh_token" text,
	"id_token" text,
	"access_token_expires_at" timestamp with time zone,
	"refresh_token_expires_at" timestamp with time zone,
	"scope" text,
	"password" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "cms_album_media" (
	"album_id" text NOT NULL,
	"media_id" text NOT NULL,
	"position" integer NOT NULL,
	CONSTRAINT "cms_album_media_album_id_media_id_pk" PRIMARY KEY("album_id","media_id")
);
--> statement-breakpoint
CREATE TABLE "cms_audit" (
	"id" text PRIMARY KEY NOT NULL,
	"actor_id" text,
	"action" text NOT NULL,
	"record_id" text,
	"request_id" text NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "cms_departments" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"emails" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"confirmation" text DEFAULT '' NOT NULL,
	"version" integer DEFAULT 1 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "cms_grants" (
	"role_id" text NOT NULL,
	"module" text NOT NULL,
	"action" text NOT NULL,
	CONSTRAINT "cms_grants_role_id_module_action_pk" PRIMARY KEY("role_id","module","action")
);
--> statement-breakpoint
CREATE TABLE "cms_heartbeats" (
	"id" text PRIMARY KEY NOT NULL,
	"at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "cms_imports" (
	"id" text PRIMARY KEY NOT NULL,
	"checksum" text NOT NULL,
	"archive_key" text NOT NULL,
	"report" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "cms_imports_checksum_unique" UNIQUE("checksum")
);
--> statement-breakpoint
CREATE TABLE "cms_jobs" (
	"id" text PRIMARY KEY NOT NULL,
	"operation_id" text NOT NULL,
	"kind" text NOT NULL,
	"payload" jsonb NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"max_attempts" integer DEFAULT 6 NOT NULL,
	"run_at" timestamp with time zone DEFAULT now() NOT NULL,
	"lease_until" timestamp with time zone,
	"lease_owner" text,
	"last_error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "cms_jobs_operation_id_unique" UNIQUE("operation_id")
);
--> statement-breakpoint
CREATE TABLE "cms_media_objects" (
	"id" text PRIMARY KEY NOT NULL,
	"storage_key" text NOT NULL,
	"checksum" text NOT NULL,
	"mime" text NOT NULL,
	"bytes" bigint NOT NULL,
	"width" integer,
	"height" integer,
	"state" text NOT NULL,
	"variants" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "cms_media_objects_storage_key_unique" UNIQUE("storage_key")
);
--> statement-breakpoint
CREATE TABLE "cms_memberships" (
	"user_id" text PRIMARY KEY NOT NULL,
	"role_id" text NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"version" integer DEFAULT 1 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "cms_paths" (
	"path" text PRIMARY KEY NOT NULL,
	"record_id" text NOT NULL,
	"kind" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "cms_rate_limits" (
	"key" text PRIMARY KEY NOT NULL,
	"count" integer NOT NULL,
	"expires_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "cms_records" (
	"id" text PRIMARY KEY NOT NULL,
	"module" text NOT NULL,
	"title" text DEFAULT '' NOT NULL,
	"slug" text,
	"content_type" text,
	"story_format" text,
	"team_id" text,
	"department_id" text,
	"status" text DEFAULT 'draft' NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"draft" jsonb NOT NULL,
	"live" jsonb,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	"import_batch" text
);
--> statement-breakpoint
CREATE TABLE "cms_redirects" (
	"from_path" text PRIMARY KEY NOT NULL,
	"to_path" text NOT NULL,
	"record_id" text
);
--> statement-breakpoint
CREATE TABLE "cms_references" (
	"record_id" text NOT NULL,
	"target_id" text NOT NULL,
	"snapshot" text NOT NULL,
	CONSTRAINT "cms_references_record_id_target_id_snapshot_pk" PRIMARY KEY("record_id","target_id","snapshot")
);
--> statement-breakpoint
CREATE TABLE "cms_revisions" (
	"id" text PRIMARY KEY NOT NULL,
	"record_id" text NOT NULL,
	"version" integer NOT NULL,
	"snapshot" jsonb NOT NULL,
	"label" text NOT NULL,
	"actor_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "cms_roles" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"team_scoped" boolean DEFAULT false NOT NULL,
	"version" integer DEFAULT 1 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "auth_session" (
	"id" text PRIMARY KEY NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"token" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"ip_address" text,
	"user_agent" text,
	"user_id" text NOT NULL,
	"impersonated_by" text,
	CONSTRAINT "auth_session_token_unique" UNIQUE("token")
);
--> statement-breakpoint
CREATE TABLE "sportlink_cache" (
	"cache_key" text PRIMARY KEY NOT NULL,
	"payload_json" text,
	"updated_at" bigint DEFAULT 0 NOT NULL,
	"expires_at" bigint DEFAULT 0 NOT NULL,
	"refresh_after" bigint DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sportlink_clubs" (
	"club_code" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"logo_url" text,
	"updated_at" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sportlink_matches" (
	"id" text PRIMARY KEY NOT NULL,
	"kickoff" text NOT NULL,
	"home_team_code" text NOT NULL,
	"away_team_code" text NOT NULL,
	"home_club_code" text NOT NULL,
	"away_club_code" text NOT NULL,
	"status" text NOT NULL,
	"payload_json" text NOT NULL,
	"updated_at" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sportlink_teams" (
	"id" text PRIMARY KEY NOT NULL,
	"team_code" text NOT NULL,
	"local_team_code" text NOT NULL,
	"name" text NOT NULL,
	"category" text NOT NULL,
	"gender" text NOT NULL,
	"sport" text NOT NULL,
	"day" text NOT NULL,
	"competitions_json" text NOT NULL,
	"active" integer DEFAULT 1 NOT NULL,
	"updated_at" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "cms_submission_history" (
	"id" text PRIMARY KEY NOT NULL,
	"submission_id" text NOT NULL,
	"actor_id" text,
	"from_status" text NOT NULL,
	"to_status" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "cms_submission_notes" (
	"id" text PRIMARY KEY NOT NULL,
	"submission_id" text NOT NULL,
	"actor_id" text NOT NULL,
	"note" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "cms_submissions" (
	"id" text PRIMARY KEY NOT NULL,
	"operation_id" text NOT NULL,
	"form_id" text NOT NULL,
	"form_version" integer NOT NULL,
	"kind" text NOT NULL,
	"department_id" text NOT NULL,
	"snapshot" jsonb NOT NULL,
	"answers" jsonb NOT NULL,
	"status" text DEFAULT 'new' NOT NULL,
	"delivery_status" text DEFAULT 'pending' NOT NULL,
	"integration_status" text DEFAULT 'not-applicable' NOT NULL,
	"external_ref" text,
	"assignee_id" text,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"retain_until" timestamp with time zone,
	CONSTRAINT "cms_submissions_operation_id_unique" UNIQUE("operation_id")
);
--> statement-breakpoint
CREATE TABLE "cms_teams" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "auth_two_factor" (
	"id" text PRIMARY KEY NOT NULL,
	"secret" text NOT NULL,
	"backup_codes" text NOT NULL,
	"user_id" text NOT NULL,
	"verified" boolean DEFAULT false
);
--> statement-breakpoint
CREATE TABLE "auth_user" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"email_verified" boolean DEFAULT false NOT NULL,
	"image" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"two_factor_enabled" boolean DEFAULT false,
	"role" text DEFAULT 'user',
	"banned" boolean DEFAULT false,
	"ban_reason" text,
	"ban_expires" timestamp with time zone,
	CONSTRAINT "auth_user_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "cms_user_departments" (
	"user_id" text NOT NULL,
	"department_id" text NOT NULL,
	"kind" text NOT NULL,
	CONSTRAINT "cms_user_departments_user_id_department_id_kind_pk" PRIMARY KEY("user_id","department_id","kind")
);
--> statement-breakpoint
CREATE TABLE "cms_user_teams" (
	"user_id" text NOT NULL,
	"team_id" text NOT NULL,
	CONSTRAINT "cms_user_teams_user_id_team_id_pk" PRIMARY KEY("user_id","team_id")
);
--> statement-breakpoint
CREATE TABLE "auth_verification" (
	"id" text PRIMARY KEY NOT NULL,
	"identifier" text NOT NULL,
	"value" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "auth_account" ADD CONSTRAINT "auth_account_user_id_auth_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."auth_user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cms_album_media" ADD CONSTRAINT "cms_album_media_album_id_cms_records_id_fk" FOREIGN KEY ("album_id") REFERENCES "public"."cms_records"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cms_album_media" ADD CONSTRAINT "cms_album_media_media_id_cms_records_id_fk" FOREIGN KEY ("media_id") REFERENCES "public"."cms_records"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cms_audit" ADD CONSTRAINT "cms_audit_actor_id_auth_user_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."auth_user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cms_grants" ADD CONSTRAINT "cms_grants_role_id_cms_roles_id_fk" FOREIGN KEY ("role_id") REFERENCES "public"."cms_roles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cms_media_objects" ADD CONSTRAINT "cms_media_objects_id_cms_records_id_fk" FOREIGN KEY ("id") REFERENCES "public"."cms_records"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cms_memberships" ADD CONSTRAINT "cms_memberships_user_id_auth_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."auth_user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cms_memberships" ADD CONSTRAINT "cms_memberships_role_id_cms_roles_id_fk" FOREIGN KEY ("role_id") REFERENCES "public"."cms_roles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cms_paths" ADD CONSTRAINT "cms_paths_record_id_cms_records_id_fk" FOREIGN KEY ("record_id") REFERENCES "public"."cms_records"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cms_records" ADD CONSTRAINT "cms_records_team_id_cms_teams_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."cms_teams"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cms_records" ADD CONSTRAINT "cms_records_department_id_cms_departments_id_fk" FOREIGN KEY ("department_id") REFERENCES "public"."cms_departments"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cms_redirects" ADD CONSTRAINT "cms_redirects_record_id_cms_records_id_fk" FOREIGN KEY ("record_id") REFERENCES "public"."cms_records"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cms_references" ADD CONSTRAINT "cms_references_record_id_cms_records_id_fk" FOREIGN KEY ("record_id") REFERENCES "public"."cms_records"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cms_references" ADD CONSTRAINT "cms_references_target_id_cms_records_id_fk" FOREIGN KEY ("target_id") REFERENCES "public"."cms_records"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cms_revisions" ADD CONSTRAINT "cms_revisions_record_id_cms_records_id_fk" FOREIGN KEY ("record_id") REFERENCES "public"."cms_records"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cms_revisions" ADD CONSTRAINT "cms_revisions_actor_id_auth_user_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."auth_user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "auth_session" ADD CONSTRAINT "auth_session_user_id_auth_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."auth_user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cms_submission_history" ADD CONSTRAINT "cms_submission_history_submission_id_cms_submissions_id_fk" FOREIGN KEY ("submission_id") REFERENCES "public"."cms_submissions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cms_submission_history" ADD CONSTRAINT "cms_submission_history_actor_id_auth_user_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."auth_user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cms_submission_notes" ADD CONSTRAINT "cms_submission_notes_submission_id_cms_submissions_id_fk" FOREIGN KEY ("submission_id") REFERENCES "public"."cms_submissions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cms_submission_notes" ADD CONSTRAINT "cms_submission_notes_actor_id_auth_user_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."auth_user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cms_submissions" ADD CONSTRAINT "cms_submissions_form_id_cms_records_id_fk" FOREIGN KEY ("form_id") REFERENCES "public"."cms_records"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cms_submissions" ADD CONSTRAINT "cms_submissions_department_id_cms_departments_id_fk" FOREIGN KEY ("department_id") REFERENCES "public"."cms_departments"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cms_submissions" ADD CONSTRAINT "cms_submissions_assignee_id_auth_user_id_fk" FOREIGN KEY ("assignee_id") REFERENCES "public"."auth_user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "auth_two_factor" ADD CONSTRAINT "auth_two_factor_user_id_auth_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."auth_user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cms_user_departments" ADD CONSTRAINT "cms_user_departments_user_id_auth_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."auth_user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cms_user_departments" ADD CONSTRAINT "cms_user_departments_department_id_cms_departments_id_fk" FOREIGN KEY ("department_id") REFERENCES "public"."cms_departments"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cms_user_teams" ADD CONSTRAINT "cms_user_teams_user_id_auth_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."auth_user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cms_user_teams" ADD CONSTRAINT "cms_user_teams_team_id_cms_teams_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."cms_teams"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "account_user_idx" ON "auth_account" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "account_provider_idx" ON "auth_account" USING btree ("provider_id","account_id");--> statement-breakpoint
CREATE INDEX "album_media_media_idx" ON "cms_album_media" USING btree ("media_id");--> statement-breakpoint
CREATE INDEX "audit_time_idx" ON "cms_audit" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "audit_actor_idx" ON "cms_audit" USING btree ("actor_id");--> statement-breakpoint
CREATE INDEX "job_claim_idx" ON "cms_jobs" USING btree ("status","run_at","lease_until");--> statement-breakpoint
CREATE INDEX "membership_role_idx" ON "cms_memberships" USING btree ("role_id");--> statement-breakpoint
CREATE INDEX "path_record_idx" ON "cms_paths" USING btree ("record_id");--> statement-breakpoint
CREATE INDEX "records_listing_idx" ON "cms_records" USING btree ("module","content_type","status","updated_at","id");--> statement-breakpoint
CREATE INDEX "records_team_idx" ON "cms_records" USING btree ("team_id");--> statement-breakpoint
CREATE INDEX "records_department_idx" ON "cms_records" USING btree ("department_id");--> statement-breakpoint
CREATE INDEX "redirect_record_idx" ON "cms_redirects" USING btree ("record_id");--> statement-breakpoint
CREATE INDEX "reference_target_idx" ON "cms_references" USING btree ("target_id");--> statement-breakpoint
CREATE UNIQUE INDEX "revision_record_version_idx" ON "cms_revisions" USING btree ("record_id","version");--> statement-breakpoint
CREATE INDEX "revision_actor_idx" ON "cms_revisions" USING btree ("actor_id");--> statement-breakpoint
CREATE INDEX "session_user_idx" ON "auth_session" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "sportlink_match_kickoff_idx" ON "sportlink_matches" USING btree ("kickoff");--> statement-breakpoint
CREATE INDEX "history_submission_idx" ON "cms_submission_history" USING btree ("submission_id");--> statement-breakpoint
CREATE INDEX "history_actor_idx" ON "cms_submission_history" USING btree ("actor_id");--> statement-breakpoint
CREATE INDEX "note_submission_idx" ON "cms_submission_notes" USING btree ("submission_id");--> statement-breakpoint
CREATE INDEX "note_actor_idx" ON "cms_submission_notes" USING btree ("actor_id");--> statement-breakpoint
CREATE INDEX "submission_listing_idx" ON "cms_submissions" USING btree ("kind","department_id","created_at","id");--> statement-breakpoint
CREATE INDEX "submission_form_idx" ON "cms_submissions" USING btree ("form_id");--> statement-breakpoint
CREATE INDEX "submission_assignee_idx" ON "cms_submissions" USING btree ("assignee_id");--> statement-breakpoint
CREATE INDEX "submission_retention_idx" ON "cms_submissions" USING btree ("retain_until");--> statement-breakpoint
CREATE INDEX "two_factor_user_idx" ON "auth_two_factor" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "user_department_department_idx" ON "cms_user_departments" USING btree ("department_id");--> statement-breakpoint
CREATE INDEX "user_team_team_idx" ON "cms_user_teams" USING btree ("team_id");--> statement-breakpoint
CREATE INDEX "verification_identifier_idx" ON "auth_verification" USING btree ("identifier");