-- Created with the Supabase CLI; Drizzle remains the authoritative journal.
CREATE TABLE cms_auth_login_challenges (
 user_id text PRIMARY KEY REFERENCES auth_user(id) ON DELETE CASCADE,
 nonce_hash text NOT NULL UNIQUE CHECK (nonce_hash ~ '^[a-f0-9]{64}$'),
 code_hash text NOT NULL CHECK (code_hash ~ '^[a-f0-9]{64}$'),
 expires_at timestamptz NOT NULL,
 issued_at timestamptz,
 attempts integer NOT NULL DEFAULT 0 CHECK (attempts BETWEEN 0 AND 5)
);
CREATE INDEX cms_auth_login_challenges_expiry ON cms_auth_login_challenges(expires_at);
CREATE TABLE cms_auth_email_sessions (
 session_id uuid PRIMARY KEY,
 user_id text NOT NULL REFERENCES auth_user(id) ON DELETE CASCADE,
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX cms_auth_email_sessions_user ON cms_auth_email_sessions(user_id);
CREATE INDEX cms_auth_email_sessions_expiry ON cms_auth_email_sessions(created_at);
ALTER TABLE cms_auth_login_challenges ENABLE ROW LEVEL SECURITY;
ALTER TABLE cms_auth_email_sessions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON cms_auth_login_challenges,cms_auth_email_sessions FROM anon,authenticated,service_role;
