CREATE TABLE "cms_board_operations" (
	"actor_id" text NOT NULL,
	"operation_id" uuid NOT NULL,
	"person_id" text NOT NULL,
	"scope_hash" text NOT NULL,
	"request_hash" text NOT NULL,
	"kind" text NOT NULL,
	"version" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "cms_board_operations_actor_id_operation_id_pk" PRIMARY KEY("actor_id","operation_id")
);
--> statement-breakpoint
ALTER TABLE "cms_board_operations" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "cms_board_private_notes" (
	"user_id" text NOT NULL,
	"person_id" text NOT NULL,
	"meeting_id" text NOT NULL,
	"point_id" text NOT NULL,
	"text" text NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "cms_board_private_notes_user_id_meeting_id_point_id_pk" PRIMARY KEY("user_id","meeting_id","point_id")
);
--> statement-breakpoint
ALTER TABLE "cms_board_private_notes" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "cms_board_revisions" (
	"id" uuid PRIMARY KEY NOT NULL,
	"version" integer NOT NULL,
	"snapshot" jsonb NOT NULL,
	"actor_id" text NOT NULL,
	"person_id" text NOT NULL,
	"role" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "cms_board_revisions" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "cms_board_state" (
	"id" text PRIMARY KEY NOT NULL,
	"data" jsonb NOT NULL,
	"version" integer DEFAULT 0 NOT NULL,
	"updated_by" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "cms_board_state" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "cms_board_operations" ADD CONSTRAINT "cms_board_operations_actor_id_auth_user_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."auth_user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cms_board_operations" ADD CONSTRAINT "cms_board_operations_person_id_cms_records_id_fk" FOREIGN KEY ("person_id") REFERENCES "public"."cms_records"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cms_board_private_notes" ADD CONSTRAINT "cms_board_private_notes_user_id_auth_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."auth_user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cms_board_private_notes" ADD CONSTRAINT "cms_board_private_notes_person_id_cms_records_id_fk" FOREIGN KEY ("person_id") REFERENCES "public"."cms_records"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cms_board_revisions" ADD CONSTRAINT "cms_board_revisions_actor_id_auth_user_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."auth_user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cms_board_revisions" ADD CONSTRAINT "cms_board_revisions_person_id_cms_records_id_fk" FOREIGN KEY ("person_id") REFERENCES "public"."cms_records"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cms_board_state" ADD CONSTRAINT "cms_board_state_updated_by_auth_user_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."auth_user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "board_operation_created_idx" ON "cms_board_operations" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "board_note_person_idx" ON "cms_board_private_notes" USING btree ("person_id");--> statement-breakpoint
CREATE UNIQUE INDEX "board_revision_version_idx" ON "cms_board_revisions" USING btree ("version");
--> statement-breakpoint
ALTER TABLE cms_board_state ADD CONSTRAINT board_singleton CHECK(id='club'), ADD CONSTRAINT board_version CHECK(version>=0),
 ADD CONSTRAINT board_no_private_notes CHECK(NOT jsonb_path_exists(data,'$.meetings[*].points[*].privateNotes.*'));
ALTER TABLE cms_board_revisions ADD CONSTRAINT board_revision_positive CHECK(version>0),
 ADD CONSTRAINT board_revision_no_private_notes CHECK(NOT jsonb_path_exists(snapshot,'$.meetings[*].points[*].privateNotes.*'));
ALTER TABLE cms_board_private_notes ADD CONSTRAINT board_note_size CHECK(length(text)<=20000);
ALTER TABLE cms_board_operations ADD CONSTRAINT board_operation_hashes CHECK(request_hash ~ '^[a-f0-9]{64}$' AND scope_hash ~ '^[a-f0-9]{64}$'),
 ADD CONSTRAINT board_operation_version CHECK(version>0), ADD CONSTRAINT board_operation_kind CHECK(kind IN ('state','planning','communication'));
--> statement-breakpoint
INSERT INTO cms_board_state(id,data,version) VALUES ('club','{"counters":{},"meetings":[],"proposals":[],"decisions":[],"actions":[],"alvs":[],"alvItems":[],"communications":[],"handoffs":[],"portfolios":[],"dossiers":[]}'::jsonb,0) ON CONFLICT(id) DO NOTHING;
--> statement-breakpoint
WITH added AS (
 INSERT INTO cms_roles(id,name,description,team_scoped) VALUES
 ('board-chair','Bestuur · Voorzitter','Persoonlijke voorzittersrol; wijs bewust toe aan een bestaand account.',false),
 ('board-secretary','Bestuur · Secretaris','Persoonlijke secretarisrol; wijs bewust toe aan een bestaand account.',false),
 ('board-member','Bestuur · Bestuurslid','Persoonlijke bestuursrol; wijs bewust toe aan een bestaand account.',false),
 ('board-committee','Bestuur · Commissielid','Eigen inbreng en actuele commissieacties; wijs bewust toe aan een bestaand account.',false)
 ON CONFLICT(id) DO NOTHING RETURNING id
)
INSERT INTO cms_grants(role_id,module,action)
 SELECT added.id,'board',granted.action FROM added CROSS JOIN LATERAL (VALUES('read'),(substring(added.id from 7))) AS granted(action)
 ON CONFLICT DO NOTHING;
--> statement-breakpoint
CREATE FUNCTION cms_preserve_board_history() RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog,public AS $body$
BEGIN
 RAISE EXCEPTION 'Bestuurshistorie en idempotentiebewijs zijn onveranderlijk';
END $body$;
CREATE TRIGGER board_operations_immutable BEFORE UPDATE OR DELETE ON cms_board_operations FOR EACH ROW EXECUTE FUNCTION cms_preserve_board_history();
CREATE TRIGGER board_revisions_immutable BEFORE UPDATE OR DELETE ON cms_board_revisions FOR EACH ROW EXECUTE FUNCTION cms_preserve_board_history();
CREATE FUNCTION cms_preserve_board_version() RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog,public AS $body$
BEGIN
 IF TG_OP='DELETE' THEN RAISE EXCEPTION 'De bestuursadministratie wordt niet verwijderd'; END IF;
 IF NEW.id IS DISTINCT FROM OLD.id OR NEW.version<>OLD.version+1 THEN RAISE EXCEPTION 'De bestuursversie moet precies één stap stijgen'; END IF;
 RETURN NEW;
END $body$;
CREATE TRIGGER board_state_version BEFORE UPDATE OR DELETE ON cms_board_state FOR EACH ROW EXECUTE FUNCTION cms_preserve_board_version();
REVOKE ALL ON FUNCTION cms_preserve_board_history(),cms_preserve_board_version() FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON cms_board_state,cms_board_operations,cms_board_private_notes,cms_board_revisions FROM PUBLIC,anon,authenticated,service_role;
DO $backend$
DECLARE target text;
BEGIN
 IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='duindorp_app') THEN
  GRANT SELECT,INSERT,UPDATE ON cms_board_state TO duindorp_app;
  GRANT SELECT,INSERT ON cms_board_operations,cms_board_revisions TO duindorp_app;
  GRANT SELECT,INSERT,UPDATE,DELETE ON cms_board_private_notes TO duindorp_app;
  FOREACH target IN ARRAY ARRAY['cms_board_state','cms_board_operations','cms_board_private_notes','cms_board_revisions'] LOOP
   EXECUTE format('CREATE POLICY duindorp_backend ON %I TO duindorp_app USING(true) WITH CHECK(true)',target);
  END LOOP;
 END IF;
END $backend$;
