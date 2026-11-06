CREATE TABLE "cms_sponsor_agreement_deliveries" (
	"id" text PRIMARY KEY NOT NULL,
	"agreement_id" text NOT NULL,
	"proposal_id" text NOT NULL,
	"sponsor_id" text NOT NULL,
	"agreement_number" text NOT NULL,
	"document_version" integer NOT NULL,
	"snapshot_bytes" text NOT NULL,
	"document_hash" text NOT NULL,
	"file_id" text NOT NULL,
	"recipient" text NOT NULL,
	"subject" text NOT NULL,
	"message" text NOT NULL,
	"signer_user_id" text,
	"created_by" text NOT NULL,
	"requested_by" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"status" text DEFAULT 'queued' NOT NULL,
	"accepted_at" timestamp with time zone,
	"provider_id" uuid,
	"first_attempt_at" timestamp with time zone,
	"last_error" text DEFAULT '' NOT NULL,
	CONSTRAINT "cms_sponsor_agreement_deliveries_file_id_unique" UNIQUE("file_id")
);
--> statement-breakpoint
ALTER TABLE "cms_sponsor_agreement_deliveries" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "cms_sponsor_agreement_deliveries" ADD CONSTRAINT "cms_sponsor_agreement_deliveries_agreement_id_cms_sponsor_documents_agreement_id_fk" FOREIGN KEY ("agreement_id") REFERENCES "public"."cms_sponsor_documents"("agreement_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cms_sponsor_agreement_deliveries" ADD CONSTRAINT "cms_sponsor_agreement_deliveries_proposal_id_cms_sponsor_records_id_fk" FOREIGN KEY ("proposal_id") REFERENCES "public"."cms_sponsor_records"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cms_sponsor_agreement_deliveries" ADD CONSTRAINT "cms_sponsor_agreement_deliveries_sponsor_id_cms_sponsor_companies_id_fk" FOREIGN KEY ("sponsor_id") REFERENCES "public"."cms_sponsor_companies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cms_sponsor_agreement_deliveries" ADD CONSTRAINT "cms_sponsor_agreement_deliveries_file_id_cms_sponsor_files_id_fk" FOREIGN KEY ("file_id") REFERENCES "public"."cms_sponsor_files"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cms_sponsor_agreement_deliveries" ADD CONSTRAINT "cms_sponsor_agreement_deliveries_signer_user_id_auth_user_id_fk" FOREIGN KEY ("signer_user_id") REFERENCES "public"."auth_user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cms_sponsor_agreement_deliveries" ADD CONSTRAINT "cms_sponsor_agreement_deliveries_created_by_auth_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."auth_user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cms_sponsor_agreement_deliveries" ADD CONSTRAINT "cms_sponsor_agreement_deliveries_requested_by_auth_user_id_fk" FOREIGN KEY ("requested_by") REFERENCES "public"."auth_user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "sponsor_agreement_delivery_company_idx" ON "cms_sponsor_agreement_deliveries" USING btree ("sponsor_id","created_at");--> statement-breakpoint
CREATE INDEX "sponsor_agreement_delivery_document_idx" ON "cms_sponsor_agreement_deliveries" USING btree ("agreement_id","created_at");
--> statement-breakpoint
ALTER TABLE cms_sponsor_agreement_deliveries
 ADD CONSTRAINT sponsor_agreement_delivery_version CHECK(document_version>0),
 ADD CONSTRAINT sponsor_agreement_delivery_hash CHECK(document_hash ~ '^[a-f0-9]{64}$'),
 ADD CONSTRAINT sponsor_agreement_delivery_status CHECK(status IN ('queued','accepted','failed','cancelled')),
 ADD CONSTRAINT sponsor_agreement_delivery_message CHECK(length(recipient) BETWEEN 3 AND 254 AND length(subject) BETWEEN 1 AND 180 AND subject !~ E'[\r\n]' AND length(message)<=5000),
 ADD CONSTRAINT sponsor_agreement_delivery_acceptance CHECK(status<>'accepted' OR (accepted_at IS NOT NULL AND provider_id IS NOT NULL));
--> statement-breakpoint
CREATE FUNCTION cms_preserve_sponsor_agreement_delivery() RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog,public AS $body$
BEGIN
 IF TG_OP='DELETE' THEN RAISE EXCEPTION 'Overeenkomstverzendingen zijn onveranderlijk'; END IF;
 IF TG_OP='UPDATE' THEN
  IF (to_jsonb(NEW)-ARRAY['status','accepted_at','provider_id','last_error','requested_by','first_attempt_at']) IS DISTINCT FROM (to_jsonb(OLD)-ARRAY['status','accepted_at','provider_id','last_error','requested_by','first_attempt_at'])
   OR OLD.status IN ('accepted','cancelled') AND to_jsonb(NEW) IS DISTINCT FROM to_jsonb(OLD)
   OR OLD.first_attempt_at IS NOT NULL AND NEW.first_attempt_at IS DISTINCT FROM OLD.first_attempt_at
  THEN RAISE EXCEPTION 'Overeenkomstverzendingen zijn onveranderlijk'; END IF;
 END IF;
 IF NOT EXISTS(
  SELECT 1 FROM cms_sponsor_documents d JOIN cms_sponsor_records a ON a.id=d.agreement_id JOIN cms_sponsor_files f ON f.id=NEW.file_id
  WHERE d.agreement_id=NEW.agreement_id AND d.sponsor_id=NEW.sponsor_id AND d.document_version=NEW.document_version
   AND d.snapshot_bytes=NEW.snapshot_bytes AND d.document_hash=NEW.document_hash
   AND a.kind='agreements' AND a.sponsor_id=NEW.sponsor_id AND a.data->>'proposalId'=NEW.proposal_id
   AND a.data->>'number'=NEW.agreement_number AND f.sponsor_id=NEW.sponsor_id AND f.agreement_id=NEW.agreement_id
   AND f.kind='agreement-delivery' AND f.document_hash=NEW.document_hash
 ) THEN RAISE EXCEPTION 'De verzendregistratie hoort niet bij het vaste document'; END IF;
 RETURN NEW;
END $body$;
CREATE TRIGGER sponsor_agreement_delivery_immutable BEFORE INSERT OR UPDATE OR DELETE ON cms_sponsor_agreement_deliveries FOR EACH ROW EXECUTE FUNCTION cms_preserve_sponsor_agreement_delivery();
REVOKE ALL ON FUNCTION cms_preserve_sponsor_agreement_delivery() FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON cms_sponsor_agreement_deliveries FROM PUBLIC,anon,authenticated,service_role;
DO $backend$
BEGIN
 IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='duindorp_app') THEN
  GRANT SELECT,INSERT,UPDATE ON cms_sponsor_agreement_deliveries TO duindorp_app;
  CREATE POLICY duindorp_backend ON cms_sponsor_agreement_deliveries TO duindorp_app USING(true) WITH CHECK(true);
 END IF;
END $backend$;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION cms_preserve_final_sponsor_file() RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog,public AS $body$
BEGIN
 IF OLD.kind IN ('agreement-final','concept-proposal','agreement-delivery') THEN RAISE EXCEPTION 'De definitieve PDF en bestandshash zijn onveranderlijk'; END IF;
 RETURN CASE WHEN TG_OP='DELETE' THEN OLD ELSE NEW END;
END $body$;
