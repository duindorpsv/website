CREATE TABLE "cms_mollie_credentials" (
	"binding_id" text PRIMARY KEY NOT NULL,
	"mode" text NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"ciphertext" text NOT NULL,
	"iv" text NOT NULL,
	"auth_tag" text NOT NULL,
	"binding" jsonb NOT NULL,
	"key_preview" text NOT NULL,
	"created_by" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "cms_mollie_credentials_mode_check" CHECK ("cms_mollie_credentials"."mode" in ('test','live')),
	CONSTRAINT "cms_mollie_credentials_binding_check" CHECK ("cms_mollie_credentials"."binding_id" ~ '^[a-f0-9]{64}$')
);
--> statement-breakpoint
ALTER TABLE "cms_mollie_credentials" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP INDEX "mollie_active_source_idx";--> statement-breakpoint
ALTER TABLE "cms_mollie_credentials" ADD CONSTRAINT "cms_mollie_credentials_created_by_auth_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."auth_user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "mollie_current_credential_idx" ON "cms_mollie_credentials" USING btree ("mode") WHERE "cms_mollie_credentials"."active"=true;--> statement-breakpoint
CREATE INDEX "mollie_credential_actor_idx" ON "cms_mollie_credentials" USING btree ("created_by");--> statement-breakpoint
CREATE UNIQUE INDEX "mollie_active_source_idx" ON "cms_mollie_payment_attempts" USING btree ("source_kind","source_id",("snapshot_bytes"::jsonb->>'mode')) WHERE "cms_mollie_payment_attempts"."status" not in ('failed','canceled','expired');
--> statement-breakpoint
REVOKE ALL ON cms_mollie_credentials FROM PUBLIC,anon,authenticated,service_role;
DO $backend$ BEGIN
 IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='duindorp_app') THEN
  GRANT SELECT,INSERT,UPDATE ON cms_mollie_credentials TO duindorp_app;
  CREATE POLICY duindorp_backend ON cms_mollie_credentials TO duindorp_app USING(true) WITH CHECK(true);
 END IF;
END $backend$;
