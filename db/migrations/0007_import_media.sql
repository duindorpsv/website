CREATE TABLE cms_import_media (checksum text NOT NULL, source_id text NOT NULL, media_id text NOT NULL REFERENCES cms_records(id), PRIMARY KEY(checksum,source_id));
CREATE INDEX import_media_target_idx ON cms_import_media(media_id);
