CREATE TABLE "cms_publications" (
	"id" text PRIMARY KEY NOT NULL,
	"record_id" text NOT NULL,
	"record_version" integer NOT NULL,
	"snapshot" jsonb NOT NULL,
	"actor_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "cms_records" ADD COLUMN "live_id" text;--> statement-breakpoint
ALTER TABLE "cms_publications" ADD CONSTRAINT "cms_publications_record_id_cms_records_id_fk" FOREIGN KEY ("record_id") REFERENCES "public"."cms_records"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cms_publications" ADD CONSTRAINT "cms_publications_actor_id_auth_user_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."auth_user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "publication_record_idx" ON "cms_publications" USING btree ("record_id");--> statement-breakpoint
CREATE INDEX "publication_actor_idx" ON "cms_publications" USING btree ("actor_id");