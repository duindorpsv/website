CREATE TABLE "cms_activity_reservations" (
	"activity_id" text NOT NULL,
	"location_id" text NOT NULL,
	"starts_at" timestamp with time zone NOT NULL,
	"ends_at" timestamp with time zone NOT NULL,
	CONSTRAINT "cms_activity_reservations_activity_id_location_id_pk" PRIMARY KEY("activity_id","location_id")
);

--> statement-breakpoint

CREATE TABLE "cms_person_accounts" (
	"person_id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	CONSTRAINT "cms_person_accounts_user_id_unique" UNIQUE("user_id")
);

--> statement-breakpoint

CREATE TABLE "cms_planning_legacy" (
	"source_id" text NOT NULL,
	"legacy_id" text NOT NULL,
	"activity_id" text,
	"report" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"source_version" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "cms_planning_legacy_source_id_legacy_id_pk" PRIMARY KEY("source_id","legacy_id")
);

--> statement-breakpoint

ALTER TABLE "cms_activity_reservations" ADD CONSTRAINT "cms_activity_reservations_activity_id_cms_records_id_fk" FOREIGN KEY ("activity_id") REFERENCES "public"."cms_records"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint

ALTER TABLE "cms_activity_reservations" ADD CONSTRAINT "cms_activity_reservations_location_id_cms_records_id_fk" FOREIGN KEY ("location_id") REFERENCES "public"."cms_records"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint

ALTER TABLE "cms_person_accounts" ADD CONSTRAINT "cms_person_accounts_person_id_cms_records_id_fk" FOREIGN KEY ("person_id") REFERENCES "public"."cms_records"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint

ALTER TABLE "cms_person_accounts" ADD CONSTRAINT "cms_person_accounts_user_id_auth_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."auth_user"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint

ALTER TABLE "cms_planning_legacy" ADD CONSTRAINT "cms_planning_legacy_activity_id_cms_records_id_fk" FOREIGN KEY ("activity_id") REFERENCES "public"."cms_records"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint

CREATE INDEX "activity_resource_time_idx" ON "cms_activity_reservations" USING btree ("location_id","starts_at","ends_at");
--> statement-breakpoint
ALTER TABLE cms_activity_reservations ADD CONSTRAINT activity_reservation_positive CHECK (ends_at>starts_at);
--> statement-breakpoint
CREATE UNIQUE INDEX cms_person_sportlink_identity_idx ON cms_records ((upper(btrim(draft->>'sportlinkId')))) WHERE module='people' AND deleted_at IS NULL AND coalesce(draft->>'sportlinkId','')<>'';
--> statement-breakpoint
CREATE UNIQUE INDEX cms_activity_source_identity_idx ON cms_records ((draft->>'source'),(draft->>'sourceId')) WHERE module='activities' AND deleted_at IS NULL AND draft->>'source'='sportlink';
--> statement-breakpoint
ALTER TABLE cms_activity_reservations ENABLE ROW LEVEL SECURITY;
ALTER TABLE cms_person_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE cms_planning_legacy ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON cms_activity_reservations,cms_person_accounts,cms_planning_legacy FROM PUBLIC,anon,authenticated,service_role;
