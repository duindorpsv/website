CREATE TABLE "cms_archive_batches" (
	"id" text PRIMARY KEY NOT NULL,
	"owner_hash" text NOT NULL,
	"user_id" text,
	"operation_id" text NOT NULL,
	"draft" jsonb NOT NULL,
	"submitted_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	CONSTRAINT "cms_archive_batches_operation_id_unique" UNIQUE("operation_id")
);
--> statement-breakpoint
ALTER TABLE "cms_archive_batches" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "cms_archive_catalog" (
	"kind" text NOT NULL,
	"id" text NOT NULL,
	"draft" jsonb NOT NULL,
	"live" jsonb,
	"aliases" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"seed_hash" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "cms_archive_catalog_kind_id_pk" PRIMARY KEY("kind","id")
);
--> statement-breakpoint
ALTER TABLE "cms_archive_catalog" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "cms_archive_contributions" (
	"id" text PRIMARY KEY NOT NULL,
	"batch_id" text NOT NULL,
	"user_id" text,
	"proposed" jsonb NOT NULL,
	"draft" jsonb NOT NULL,
	"live" jsonb,
	"status" text DEFAULT 'pending' NOT NULL,
	"note" text DEFAULT '' NOT NULL,
	"consent_version" text NOT NULL,
	"consent_at" timestamp with time zone DEFAULT now() NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "cms_archive_contributions_batch_id_unique" UNIQUE("batch_id")
);
--> statement-breakpoint
ALTER TABLE "cms_archive_contributions" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "cms_archive_media" (
	"id" text PRIMARY KEY NOT NULL,
	"batch_id" text,
	"operation_id" text NOT NULL,
	"original_key" text NOT NULL,
	"safe_key" text NOT NULL,
	"name" text NOT NULL,
	"kind" text NOT NULL,
	"mime" text NOT NULL,
	"bytes" bigint NOT NULL,
	"checksum" text NOT NULL,
	"state" text DEFAULT 'processing' NOT NULL,
	"error" text,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "cms_archive_media_operation_id_unique" UNIQUE("operation_id")
);
--> statement-breakpoint
ALTER TABLE "cms_archive_media" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "cms_archive_relations" (
	"moment_id" text NOT NULL,
	"object_id" text NOT NULL,
	CONSTRAINT "cms_archive_relations_moment_id_object_id_pk" PRIMARY KEY("moment_id","object_id")
);
--> statement-breakpoint
ALTER TABLE "cms_archive_relations" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "cms_archive_revisions" (
	"id" text PRIMARY KEY NOT NULL,
	"kind" text NOT NULL,
	"record_id" text NOT NULL,
	"version" integer NOT NULL,
	"snapshot" jsonb NOT NULL,
	"action" text NOT NULL,
	"reason" text DEFAULT '' NOT NULL,
	"actor_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "cms_archive_revisions" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "cms_archive_batches" ADD CONSTRAINT "cms_archive_batches_user_id_auth_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."auth_user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cms_archive_contributions" ADD CONSTRAINT "cms_archive_contributions_batch_id_cms_archive_batches_id_fk" FOREIGN KEY ("batch_id") REFERENCES "public"."cms_archive_batches"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cms_archive_contributions" ADD CONSTRAINT "cms_archive_contributions_user_id_auth_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."auth_user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cms_archive_media" ADD CONSTRAINT "cms_archive_media_batch_id_cms_archive_batches_id_fk" FOREIGN KEY ("batch_id") REFERENCES "public"."cms_archive_batches"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cms_archive_revisions" ADD CONSTRAINT "cms_archive_revisions_actor_id_auth_user_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."auth_user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "archive_batch_owner_idx" ON "cms_archive_batches" USING btree ("owner_hash");--> statement-breakpoint
CREATE INDEX "archive_batch_expiry_idx" ON "cms_archive_batches" USING btree ("expires_at");--> statement-breakpoint
CREATE INDEX "archive_batch_user_idx" ON "cms_archive_batches" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "archive_catalog_kind_idx" ON "cms_archive_catalog" USING btree ("kind","updated_at");--> statement-breakpoint
CREATE INDEX "archive_contribution_listing_idx" ON "cms_archive_contributions" USING btree ("status","created_at");--> statement-breakpoint
CREATE INDEX "archive_contribution_user_idx" ON "cms_archive_contributions" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "archive_media_batch_idx" ON "cms_archive_media" USING btree ("batch_id");--> statement-breakpoint
CREATE INDEX "archive_relation_object_idx" ON "cms_archive_relations" USING btree ("object_id");--> statement-breakpoint
CREATE INDEX "archive_revision_record_idx" ON "cms_archive_revisions" USING btree ("kind","record_id","version");--> statement-breakpoint
CREATE INDEX "archive_revision_actor_idx" ON "cms_archive_revisions" USING btree ("actor_id");
--> statement-breakpoint
REVOKE ALL ON cms_archive_catalog,cms_archive_batches,cms_archive_media,cms_archive_contributions,cms_archive_revisions,cms_archive_relations FROM anon,authenticated,service_role;
