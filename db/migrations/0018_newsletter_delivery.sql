CREATE TABLE "cms_newsletter_deliveries" (
	"id" text PRIMARY KEY NOT NULL,
	"campaign_id" text NOT NULL,
	"edition_id" text NOT NULL,
	"email" text NOT NULL,
	"contact_id" text,
	"test" boolean DEFAULT false NOT NULL,
	"status" text DEFAULT 'queued' NOT NULL,
	"message" jsonb NOT NULL,
	"provider_id" text,
	"attempts" integer DEFAULT 0 NOT NULL,
	"first_attempt_at" timestamp with time zone,
	"provider_event_at" timestamp with time zone,
	"error_code" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "cms_newsletter_deliveries_provider_id_unique" UNIQUE("provider_id")
);
--> statement-breakpoint
ALTER TABLE "cms_newsletter_deliveries" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "cms_newsletter_events" (
	"id" text PRIMARY KEY NOT NULL,
	"provider_id" text NOT NULL,
	"kind" text NOT NULL,
	"occurred_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "cms_newsletter_events" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "cms_newsletter_resources" (
	"id" text PRIMARY KEY NOT NULL,
	"kind" text NOT NULL,
	"data" jsonb NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "cms_newsletter_resources" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "cms_newsletter_tokens" (
	"hash" text PRIMARY KEY NOT NULL,
	"contact_id" text NOT NULL,
	"purpose" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "cms_newsletter_tokens" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "cms_newsletter_deliveries" ADD CONSTRAINT "cms_newsletter_deliveries_campaign_id_cms_newsletter_resources_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."cms_newsletter_resources"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "newsletter_edition_email_idx" ON "cms_newsletter_deliveries" USING btree ("edition_id","email");--> statement-breakpoint
CREATE INDEX "newsletter_delivery_campaign_idx" ON "cms_newsletter_deliveries" USING btree ("campaign_id","status");--> statement-breakpoint
CREATE INDEX "newsletter_resource_kind_idx" ON "cms_newsletter_resources" USING btree ("kind","updated_at");--> statement-breakpoint
CREATE INDEX "newsletter_token_contact_idx" ON "cms_newsletter_tokens" USING btree ("contact_id");--> statement-breakpoint
ALTER TABLE cms_newsletter ADD COLUMN consent_at timestamptz;
--> statement-breakpoint
ALTER TABLE cms_newsletter ADD COLUMN source text NOT NULL DEFAULT 'signup';
--> statement-breakpoint
UPDATE cms_newsletter SET consent_at=confirmed_at WHERE confirmed_at IS NOT NULL;
--> statement-breakpoint
CREATE INDEX newsletter_normalized_email_idx ON cms_newsletter(lower(btrim(email)));
--> statement-breakpoint
REVOKE ALL ON cms_newsletter_resources,cms_newsletter_deliveries,cms_newsletter_tokens,cms_newsletter_events FROM anon,authenticated,service_role;
