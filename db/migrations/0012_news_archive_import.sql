CREATE TABLE cms_news_import_sessions (
 id text PRIMARY KEY, actor_id text NOT NULL REFERENCES auth_user(id), environment text NOT NULL,
 filename text NOT NULL, bytes bigint NOT NULL CHECK(bytes>0), fingerprint text NOT NULL,
 team_id text REFERENCES cms_teams(id), status text NOT NULL DEFAULT 'uploading',
 summary jsonb NOT NULL DEFAULT '{}', error text, target_status text NOT NULL DEFAULT 'draft',
 run_id text, batch integer NOT NULL DEFAULT 0, expires_at timestamptz NOT NULL DEFAULT now()+interval '7 days',
 created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
 CHECK(status IN ('uploading','queued','analyzing','ready','importing','completed','partial','failed','expired')),
 CHECK(target_status IN ('draft','published'))
);
CREATE INDEX news_import_actor_idx ON cms_news_import_sessions(actor_id,environment,created_at DESC);
CREATE INDEX news_import_expiry_idx ON cms_news_import_sessions(expires_at) WHERE status!='expired';
CREATE INDEX news_import_team_idx ON cms_news_import_sessions(team_id);
CREATE TABLE cms_news_import_parts (
 session_id text NOT NULL REFERENCES cms_news_import_sessions(id) ON DELETE CASCADE,
 part integer NOT NULL CHECK(part>=0), storage_key text NOT NULL UNIQUE, checksum text NOT NULL,
 bytes integer NOT NULL CHECK(bytes>0), PRIMARY KEY(session_id,part)
);
CREATE TABLE cms_news_import_rows (
 session_id text NOT NULL REFERENCES cms_news_import_sessions(id) ON DELETE CASCADE,
 source_id text NOT NULL, ordinal integer NOT NULL, title text NOT NULL DEFAULT '',
 published_at timestamptz, year text NOT NULL DEFAULT '', data jsonb, checksum text,
 status text NOT NULL DEFAULT 'ready', selected boolean NOT NULL DEFAULT false, run_id text,
 warnings jsonb NOT NULL DEFAULT '[]', error text, record_id text REFERENCES cms_records(id),
 PRIMARY KEY(session_id,source_id),
 CHECK(status IN ('ready','invalid','duplicate','queued','processing','imported','failed'))
);
CREATE INDEX news_import_row_work_idx ON cms_news_import_rows(session_id,run_id,status,ordinal);
CREATE INDEX news_import_row_record_idx ON cms_news_import_rows(record_id);
CREATE TABLE cms_news_import_identities (
 source text NOT NULL, source_id text NOT NULL, record_id text NOT NULL UNIQUE REFERENCES cms_records(id),
 session_id text REFERENCES cms_news_import_sessions(id) ON DELETE SET NULL,
 provenance jsonb NOT NULL, created_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY(source,source_id)
);
CREATE INDEX news_identity_session_idx ON cms_news_import_identities(session_id);
CREATE TABLE cms_news_import_assets (
 session_id text NOT NULL REFERENCES cms_news_import_sessions(id) ON DELETE CASCADE,
 path text NOT NULL, media_id text REFERENCES cms_records(id), kind text NOT NULL,
 used boolean NOT NULL DEFAULT false, error text, PRIMARY KEY(session_id,path)
);
CREATE INDEX news_asset_media_idx ON cms_news_import_assets(media_id);
