# Supabase verification

`config.toml` describes the isolated **CI** stack (CLI 2.121.0). It starts real PostgreSQL, GoTrue/Auth, Storage/S3 and the API gateway on an ephemeral GitHub-hosted runner. It is not a second deployment environment or a cloud project. Do not start its Docker services on a shared VPS without checking port reservations and loopback binding first.

The existing Drizzle journal in `db/migrations` remains the single application migration history. Migration 0014 was scaffolded with `supabase migration new cms_supabase_auth` and moved into that journal. CLI application migrations/seeding are disabled to prevent a second runner from applying them. Provider schemas are initialized by the local Supabase stack.

CI creates its own private bucket and random runtime database password, masks generated credentials, checks actual email-code Auth and private media, and destroys only its own verification stack. It never links to or mutates a cloud project. Production configuration is documented in `ops/github-environments.md`.
