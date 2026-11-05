CREATE TABLE "cms_sponsor_logo_uploads" (
	"id" text PRIMARY KEY NOT NULL,
	"sponsor_id" text NOT NULL,
	"storage_key" text NOT NULL,
	"file_hash" text NOT NULL,
	"bytes" bigint NOT NULL,
	"name" text NOT NULL,
	"created_by" text NOT NULL,
	"session_fingerprint" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	CONSTRAINT "cms_sponsor_logo_uploads_storage_key_unique" UNIQUE("storage_key")
);
--> statement-breakpoint
ALTER TABLE "cms_sponsor_logo_uploads" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "cms_sponsor_logo_uploads" ADD CONSTRAINT "cms_sponsor_logo_uploads_created_by_auth_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."auth_user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "sponsor_logo_upload_expiry_idx" ON "cms_sponsor_logo_uploads" USING btree ("expires_at");--> statement-breakpoint
CREATE INDEX "sponsor_logo_upload_actor_idx" ON "cms_sponsor_logo_uploads" USING btree ("created_by","sponsor_id");
--> statement-breakpoint
ALTER TABLE cms_sponsor_logo_uploads ADD CONSTRAINT sponsor_logo_upload_hash CHECK(file_hash~'^[a-f0-9]{64}$');
ALTER TABLE cms_sponsor_logo_uploads ADD CONSTRAINT sponsor_logo_upload_session CHECK(session_fingerprint~'^[a-f0-9]{64}$');
ALTER TABLE cms_sponsor_logo_uploads ADD CONSTRAINT sponsor_logo_upload_bytes CHECK(bytes>0 AND bytes<=8388608);
REVOKE ALL ON cms_sponsor_logo_uploads FROM PUBLIC,anon,authenticated,service_role;
DO $backend$
BEGIN
 IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='duindorp_app') THEN
  GRANT SELECT,INSERT,UPDATE,DELETE ON cms_sponsor_logo_uploads TO duindorp_app;
  CREATE POLICY duindorp_backend ON cms_sponsor_logo_uploads TO duindorp_app USING(true) WITH CHECK(true);
 END IF;
END $backend$;
