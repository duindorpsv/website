CREATE TABLE cms_mollie_payment_attempts (
 id text PRIMARY KEY,
 operation_id uuid NOT NULL CONSTRAINT cms_mollie_payment_attempts_operation_id_unique UNIQUE,
 actor_id text NOT NULL CONSTRAINT cms_mollie_payment_attempts_actor_id_auth_user_id_fk REFERENCES auth_user(id),
 source_kind text NOT NULL CHECK(source_kind IN ('donors','sponsors')),
 source_id text NOT NULL CONSTRAINT cms_mollie_payment_attempts_source_id_cms_sponsor_records_id_fk REFERENCES cms_sponsor_records(id),
 snapshot_bytes text NOT NULL,
 snapshot_hash text NOT NULL CHECK(snapshot_hash ~ '^[a-f0-9]{64}$'),
 status text NOT NULL DEFAULT 'prepared' CHECK(status IN ('prepared','uncertain','open','pending','authorized','paid','failed','canceled','expired','review')),
 provider_id text CONSTRAINT cms_mollie_payment_attempts_provider_id_unique UNIQUE,
 checkout_url text,
 error_code text,
 settled_at timestamptz,
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now()
);
--> statement-breakpoint
ALTER TABLE cms_mollie_payment_attempts ENABLE ROW LEVEL SECURITY;
CREATE UNIQUE INDEX mollie_active_source_idx ON cms_mollie_payment_attempts(source_kind,source_id) WHERE status NOT IN ('failed','canceled','expired');
CREATE FUNCTION cms_preserve_mollie_attempt() RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog,public AS $body$
BEGIN
 IF TG_OP='DELETE' THEN RAISE EXCEPTION 'Betaalpogingen blijven bewaard'; END IF;
 IF ROW(NEW.id,NEW.operation_id,NEW.actor_id,NEW.source_kind,NEW.source_id,NEW.snapshot_bytes,NEW.snapshot_hash,NEW.created_at) IS DISTINCT FROM ROW(OLD.id,OLD.operation_id,OLD.actor_id,OLD.source_kind,OLD.source_id,OLD.snapshot_bytes,OLD.snapshot_hash,OLD.created_at) THEN RAISE EXCEPTION 'De betaalpoging is onveranderlijk'; END IF;
 IF OLD.provider_id IS NOT NULL AND NEW.provider_id IS DISTINCT FROM OLD.provider_id THEN RAISE EXCEPTION 'De provideridentiteit blijft behouden'; END IF;
 IF OLD.settled_at IS NOT NULL AND NEW.settled_at IS DISTINCT FROM OLD.settled_at THEN RAISE EXCEPTION 'De financiële verwerking blijft behouden'; END IF;
 RETURN NEW;
END $body$;
CREATE TRIGGER mollie_attempt_immutable BEFORE UPDATE OR DELETE ON cms_mollie_payment_attempts FOR EACH ROW EXECUTE FUNCTION cms_preserve_mollie_attempt();
REVOKE ALL ON FUNCTION cms_preserve_mollie_attempt() FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON cms_mollie_payment_attempts FROM PUBLIC,anon,authenticated,service_role;
DO $backend$ BEGIN
 IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='duindorp_app') THEN
  GRANT SELECT,INSERT,UPDATE ON cms_mollie_payment_attempts TO duindorp_app;
  CREATE POLICY duindorp_backend ON cms_mollie_payment_attempts TO duindorp_app USING(true) WITH CHECK(true);
 END IF;
END $backend$;
