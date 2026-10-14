CREATE TABLE cms_operations (id text PRIMARY KEY, actor_id text NOT NULL REFERENCES auth_user(id), response jsonb NOT NULL, created_at timestamptz NOT NULL DEFAULT now());
CREATE INDEX operations_actor_idx ON cms_operations(actor_id);
ALTER TABLE cms_records ADD CONSTRAINT content_type_check CHECK(content_type IS NULL OR content_type IN ('news','story'));
ALTER TABLE cms_submissions ADD CONSTRAINT submission_kind_check CHECK(kind IN ('contact','registration','request'));
ALTER TABLE cms_submissions ADD CONSTRAINT submission_status_check CHECK((kind='contact' AND status IN ('new','in-progress','done')) OR (kind='registration' AND status IN ('new','in-progress','accepted','waitlist','declined','done')) OR (kind='request' AND status IN ('new','in-progress','accepted','declined','done')));
ALTER TABLE cms_records ADD CONSTRAINT positive_record_version CHECK(version>0);
CREATE FUNCTION reject_cms_audit_mutation() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'Audit rows are append-only'; END $$;
CREATE TRIGGER cms_audit_append_only BEFORE UPDATE OR DELETE ON cms_audit FOR EACH ROW EXECUTE FUNCTION reject_cms_audit_mutation();
