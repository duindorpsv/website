CREATE TABLE cms_sponsor_concepts (
 id text PRIMARY KEY,
 proposal_id text NOT NULL REFERENCES cms_sponsor_records(id),
 sponsor_id text NOT NULL REFERENCES cms_sponsor_companies(id),
 version integer NOT NULL CHECK(version>0),
 snapshot_bytes text NOT NULL,
 document_hash text NOT NULL CHECK(document_hash ~ '^[a-f0-9]{64}$'),
 file_id text NOT NULL CONSTRAINT cms_sponsor_concepts_file_id_unique UNIQUE REFERENCES cms_sponsor_files(id),
 recipient text NOT NULL,
 subject text NOT NULL,
 message text NOT NULL,
 created_by text NOT NULL REFERENCES auth_user(id),
 requested_by text NOT NULL REFERENCES auth_user(id),
 created_at timestamptz NOT NULL DEFAULT now(),
 status text NOT NULL DEFAULT 'queued' CHECK(status IN ('queued','accepted','failed','cancelled')),
 accepted_at timestamptz,
 first_attempt_at timestamptz,
 last_error text NOT NULL DEFAULT ''
);
ALTER TABLE cms_sponsor_concepts ENABLE ROW LEVEL SECURITY;
CREATE UNIQUE INDEX sponsor_concept_version_idx ON cms_sponsor_concepts(proposal_id,version);
CREATE INDEX sponsor_concept_company_idx ON cms_sponsor_concepts(sponsor_id,created_at);
--> statement-breakpoint
CREATE FUNCTION cms_preserve_sponsor_concept() RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog,public AS $body$
BEGIN
 IF TG_OP='DELETE' OR (to_jsonb(NEW)-ARRAY['status','accepted_at','last_error','requested_by','first_attempt_at']) IS DISTINCT FROM (to_jsonb(OLD)-ARRAY['status','accepted_at','last_error','requested_by','first_attempt_at']) THEN RAISE EXCEPTION 'Conceptversies zijn onveranderlijk'; END IF;
 IF OLD.status IN ('accepted','cancelled') AND to_jsonb(NEW) IS DISTINCT FROM to_jsonb(OLD) THEN RAISE EXCEPTION 'Afgesloten conceptverzending is onveranderlijk'; END IF;
 RETURN NEW;
END $body$;
CREATE TRIGGER sponsor_concept_immutable BEFORE UPDATE OR DELETE ON cms_sponsor_concepts FOR EACH ROW EXECUTE FUNCTION cms_preserve_sponsor_concept();
REVOKE ALL ON FUNCTION cms_preserve_sponsor_concept() FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON cms_sponsor_concepts FROM PUBLIC,anon,authenticated,service_role;
DO $backend$
BEGIN
 IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='duindorp_app') THEN
  GRANT SELECT,INSERT,UPDATE ON cms_sponsor_concepts TO duindorp_app;
  CREATE POLICY duindorp_backend ON cms_sponsor_concepts TO duindorp_app USING(true) WITH CHECK(true);
 END IF;
END $backend$;

--> statement-breakpoint
CREATE OR REPLACE FUNCTION cms_preserve_final_sponsor_file() RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog,public AS $body$
BEGIN
 IF OLD.kind IN ('agreement-final','concept-proposal') THEN RAISE EXCEPTION 'De definitieve PDF en bestandshash zijn onveranderlijk'; END IF;
 RETURN CASE WHEN TG_OP='DELETE' THEN OLD ELSE NEW END;
END $body$;
