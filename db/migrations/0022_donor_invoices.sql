CREATE TABLE "cms_donor_invoice_documents" (
	"invoice_id" text PRIMARY KEY NOT NULL,
	"snapshot_bytes" text NOT NULL,
	"document_hash" text NOT NULL,
	"storage_key" text NOT NULL,
	"file_hash" text NOT NULL,
	"bytes" bigint NOT NULL,
	"created_by" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "cms_donor_invoice_documents_storage_key_unique" UNIQUE("storage_key")
);
--> statement-breakpoint
ALTER TABLE "cms_donor_invoice_documents" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "cms_invoice_numbers" (
	"number_key" text PRIMARY KEY NOT NULL,
	"number" text NOT NULL,
	"record_id" text NOT NULL,
	"source" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "cms_invoice_numbers_record_id_unique" UNIQUE("record_id")
);
--> statement-breakpoint
ALTER TABLE "cms_invoice_numbers" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "cms_donor_invoice_documents" ADD CONSTRAINT "cms_donor_invoice_documents_invoice_id_cms_sponsor_records_id_fk" FOREIGN KEY ("invoice_id") REFERENCES "public"."cms_sponsor_records"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cms_donor_invoice_documents" ADD CONSTRAINT "cms_donor_invoice_documents_created_by_auth_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."auth_user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE cms_sponsor_records DROP CONSTRAINT cms_sponsor_records_kind_check;
ALTER TABLE cms_sponsor_records ADD CONSTRAINT cms_sponsor_records_kind_check CHECK(kind IN ('items','packages','proposals','agreements','invoices','tasks','activities','profileRequests','businessChangeRequests','contractTemplates','events','settings','donorPeople','donorContributions','donorInvoices'));
ALTER TABLE cms_sponsor_records ADD CONSTRAINT donor_records_standalone CHECK(kind NOT IN ('donorPeople','donorContributions','donorInvoices') OR sponsor_id IS NULL);
CREATE UNIQUE INDEX donor_active_contribution_invoice_idx ON cms_sponsor_records((data->>'contributionId')) WHERE kind='donorInvoices' AND data->>'status'<>'cancelled';
ALTER TABLE cms_invoice_numbers ADD CONSTRAINT invoice_number_key CHECK(number_key=lower(number) AND length(number)>0);
ALTER TABLE cms_invoice_numbers ADD CONSTRAINT invoice_number_source CHECK(source IN ('sponsors','donors'));
ALTER TABLE cms_donor_invoice_documents ADD CONSTRAINT donor_document_hashes CHECK(document_hash~'^[a-f0-9]{64}$' AND file_hash~'^[a-f0-9]{64}$' AND bytes>0);
-- Fail on conflicting historical numbers; never renumber or discard financial history.
INSERT INTO cms_invoice_numbers(number_key,number,record_id,source)
 SELECT lower(data->>'number'),data->>'number',id,CASE WHEN kind='invoices' THEN 'sponsors' ELSE 'donors' END
 FROM cms_sponsor_records WHERE kind IN ('invoices','donorInvoices');
--> statement-breakpoint
CREATE FUNCTION cms_invoice_number_reserved() RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog,public AS $body$
DECLARE reservation public.cms_invoice_numbers;
DECLARE expected_source text;
BEGIN
 IF NEW.kind IN ('invoices','donorInvoices') THEN
  expected_source := CASE WHEN NEW.kind='invoices' THEN 'sponsors' ELSE 'donors' END;
  IF NEW.data->>'number' IS NULL OR length(NEW.data->>'number')=0 THEN RAISE EXCEPTION 'Factuurnummer ontbreekt' USING ERRCODE='23514'; END IF;
  INSERT INTO public.cms_invoice_numbers(number_key,number,record_id,source) VALUES(lower(NEW.data->>'number'),NEW.data->>'number',NEW.id,CASE WHEN NEW.kind='invoices' THEN 'sponsors' ELSE 'donors' END) ON CONFLICT(number_key) DO NOTHING;
  SELECT * INTO reservation FROM public.cms_invoice_numbers WHERE number_key=lower(NEW.data->>'number');
  IF reservation.record_id IS DISTINCT FROM NEW.id OR reservation.number IS DISTINCT FROM NEW.data->>'number' OR reservation.source IS DISTINCT FROM expected_source THEN RAISE EXCEPTION 'Factuurnummer is al gereserveerd' USING ERRCODE='23505'; END IF;
 END IF;
 RETURN NEW;
END $body$;
CREATE TRIGGER invoice_number_reserved BEFORE INSERT OR UPDATE ON cms_sponsor_records FOR EACH ROW EXECUTE FUNCTION cms_invoice_number_reserved();
CREATE FUNCTION cms_preserve_invoice_archive() RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog,public AS $body$
BEGIN
 IF TG_TABLE_NAME IN ('cms_invoice_numbers','cms_donor_invoice_documents') THEN RAISE EXCEPTION 'Het factuurarchief is onveranderlijk'; END IF;
 IF OLD.kind='donorInvoices' AND (TG_OP='DELETE' OR NEW.kind IS DISTINCT FROM OLD.kind OR NEW.sponsor_id IS DISTINCT FROM OLD.sponsor_id OR (NEW.data-ARRAY['status','paidAt','paymentMethod','paymentReference','cancelledAt','cancellationReason','mailStatus','mailAcceptedAt','mailError']) IS DISTINCT FROM (OLD.data-ARRAY['status','paidAt','paymentMethod','paymentReference','cancelledAt','cancellationReason','mailStatus','mailAcceptedAt','mailError'])) THEN RAISE EXCEPTION 'Vastgelegde donateursfacturen zijn onveranderlijk'; END IF;
 IF OLD.kind='donorInvoices' AND OLD.data->>'status' IN ('paid','cancelled') AND NEW.data->>'status' IS DISTINCT FROM OLD.data->>'status' THEN RAISE EXCEPTION 'Een afgesloten factuur kan niet opnieuw worden geopend'; END IF;
 IF TG_OP='DELETE' THEN RETURN OLD; END IF;
 RETURN NEW;
END $body$;
CREATE TRIGGER donor_invoice_immutable BEFORE UPDATE OR DELETE ON cms_sponsor_records FOR EACH ROW EXECUTE FUNCTION cms_preserve_invoice_archive();
CREATE TRIGGER invoice_number_immutable BEFORE UPDATE OR DELETE ON cms_invoice_numbers FOR EACH ROW EXECUTE FUNCTION cms_preserve_invoice_archive();
CREATE TRIGGER donor_document_immutable BEFORE UPDATE OR DELETE ON cms_donor_invoice_documents FOR EACH ROW EXECUTE FUNCTION cms_preserve_invoice_archive();
REVOKE ALL ON FUNCTION cms_invoice_number_reserved(),cms_preserve_invoice_archive() FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON cms_invoice_numbers,cms_donor_invoice_documents FROM PUBLIC,anon,authenticated,service_role;
DO $backend$
BEGIN
 IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='duindorp_app') THEN
  GRANT SELECT,INSERT ON cms_invoice_numbers,cms_donor_invoice_documents TO duindorp_app;
  CREATE POLICY duindorp_backend ON cms_invoice_numbers TO duindorp_app USING(true) WITH CHECK(true);
  CREATE POLICY duindorp_backend ON cms_donor_invoice_documents TO duindorp_app USING(true) WITH CHECK(true);
 END IF;
END $backend$;
