INSERT INTO cms_publications(id,record_id,record_version,snapshot) SELECT 'initial:'||id,id,version,live FROM cms_records WHERE live IS NOT NULL AND live_id IS NULL;
UPDATE cms_records SET live_id='initial:'||id WHERE live IS NOT NULL AND live_id IS NULL;
ALTER TABLE cms_records ADD CONSTRAINT cms_live_publication_fk FOREIGN KEY(live_id) REFERENCES cms_publications(id);
CREATE INDEX records_live_id_idx ON cms_records(live_id);
CREATE TRIGGER cms_publications_immutable BEFORE UPDATE OR DELETE ON cms_publications FOR EACH ROW EXECUTE FUNCTION reject_cms_audit_mutation();
CREATE TRIGGER cms_revisions_immutable BEFORE UPDATE OR DELETE ON cms_revisions FOR EACH ROW EXECUTE FUNCTION reject_cms_audit_mutation();
