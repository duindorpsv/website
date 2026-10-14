CREATE TABLE cms_newsletter (
 id text PRIMARY KEY, email text NOT NULL UNIQUE, name text NOT NULL DEFAULT '', topics jsonb NOT NULL DEFAULT '[]',
 status text NOT NULL DEFAULT 'pending-confirmation', consent_version text NOT NULL,
 confirmation_hash text NOT NULL, unsubscribe_hash text NOT NULL, expires_at timestamptz NOT NULL,
 provider_ref text, confirmed_at timestamptz, unsubscribed_at timestamptz, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX newsletter_status_idx ON cms_newsletter(status);
