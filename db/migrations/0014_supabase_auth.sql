-- Created with Supabase CLI migration new cms_supabase_auth; kept in the
-- existing Drizzle journal so an installation has one authoritative history.
ALTER TABLE auth_user ADD COLUMN supabase_user_id uuid UNIQUE;
--> statement-breakpoint
CREATE TABLE cms_auth_revocations (
  user_id text PRIMARY KEY REFERENCES auth_user(id) ON DELETE CASCADE,
  invalid_before timestamptz NOT NULL
);
--> statement-breakpoint
CREATE TABLE cms_auth_recoveries (
  token_hash text PRIMARY KEY,
  user_id text NOT NULL UNIQUE REFERENCES auth_user(id) ON DELETE CASCADE,
  session_id uuid NOT NULL,
  expires_at timestamptz NOT NULL
);
--> statement-breakpoint
-- Preserve CMS profile IDs and all historical references. Existing local
-- accounts require explicit identity migration; email is never auto-linked.
DO $$ BEGIN
  IF to_regclass('auth.users') IS NULL THEN
    RAISE EXCEPTION 'This release requires Supabase Auth in the target database';
  END IF;
  ALTER TABLE auth_user ADD CONSTRAINT auth_user_supabase_fk
    FOREIGN KEY (supabase_user_id) REFERENCES auth.users(id) ON DELETE SET NULL;
END $$;
--> statement-breakpoint
-- This dedicated project exposes no CMS data through Supabase's Data API.
-- Future tables stay private until their migration and runtime policy are ready.
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON TABLES FROM PUBLIC, anon, authenticated, service_role;
--> statement-breakpoint
-- End all legacy Better Auth sessions at the cutover. Password hashes and
-- encrypted legacy factors remain private until the operator completes migration.
DELETE FROM auth_session;
--> statement-breakpoint
DO $$ DECLARE item record; access_role text; BEGIN
  FOR item IN SELECT tablename FROM pg_tables WHERE schemaname='public'
    AND (tablename LIKE 'cms\_%' ESCAPE '\' OR tablename LIKE 'auth\_%' ESCAPE '\' OR tablename LIKE 'sportlink\_%' ESCAPE '\') LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY',item.tablename);
    EXECUTE format('REVOKE ALL ON TABLE public.%I FROM PUBLIC',item.tablename);
    FOREACH access_role IN ARRAY ARRAY['anon','authenticated','service_role'] LOOP
      IF EXISTS(SELECT FROM pg_roles WHERE rolname=access_role) THEN
        EXECUTE format('REVOKE ALL ON TABLE public.%I FROM %I',item.tablename,access_role);
      END IF;
    END LOOP;
  END LOOP;
END $$;

--> statement-breakpoint
-- Supabase owns the auth schema. Expose only the required live-session check
-- through an invoker function for the server secret key, never by granting the
-- runtime SQL role membership in a privileged Supabase role.
CREATE FUNCTION public.cms_auth_session(provider_session uuid, provider_user uuid)
RETURNS TABLE(created_at timestamptz, not_after timestamptz)
LANGUAGE sql STABLE SECURITY INVOKER SET search_path = '' AS $$
  SELECT s.created_at,s.not_after FROM auth.sessions s
  WHERE s.id=provider_session AND s.user_id=provider_user
    AND (s.not_after IS NULL OR s.not_after>now());
$$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION public.cms_auth_session(uuid,uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.cms_auth_session(uuid,uuid) TO service_role;
GRANT SELECT(id,user_id,created_at,not_after) ON auth.sessions TO service_role;
--> statement-breakpoint
NOTIFY pgrst, 'reload schema';

--> statement-breakpoint
ALTER FUNCTION public.reject_cms_audit_mutation() SET search_path = '';
ALTER FUNCTION public.normalize_cms_metadata() SET search_path = '';
