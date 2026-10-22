-- Private application tables. Provisioning grants only the existing backend role.
ALTER TABLE cms_person_accounts ADD COLUMN created_at timestamptz NOT NULL DEFAULT now();
--> statement-breakpoint
CREATE TABLE cms_directory_profiles (
 person_id text PRIMARY KEY REFERENCES cms_records(id),
 data jsonb NOT NULL,
 source_club text NOT NULL DEFAULT '',
 source_ref text,
 version integer NOT NULL DEFAULT 1,
 updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX directory_source_identity_idx ON cms_directory_profiles(source_club,source_ref) WHERE source_ref IS NOT NULL;
CREATE INDEX directory_profile_status_idx ON cms_directory_profiles((data->>'status'));
--> statement-breakpoint
CREATE TABLE cms_directory_assignments (
 id text PRIMARY KEY,person_id text NOT NULL REFERENCES cms_records(id),data jsonb NOT NULL,version integer NOT NULL DEFAULT 1
);
CREATE INDEX directory_assignment_person_idx ON cms_directory_assignments(person_id);
CREATE TABLE cms_directory_guardians (
 id text PRIMARY KEY,guardian_person_id text NOT NULL REFERENCES cms_records(id),child_person_id text NOT NULL REFERENCES cms_records(id),
 status text NOT NULL CHECK(status IN ('pending','approved','revoked')),data jsonb NOT NULL,version integer NOT NULL DEFAULT 1,
 CHECK(guardian_person_id<>child_person_id)
);
CREATE UNIQUE INDEX directory_guardian_pair_idx ON cms_directory_guardians(guardian_person_id,child_person_id) WHERE status<>'revoked';
CREATE INDEX directory_guardian_child_idx ON cms_directory_guardians(child_person_id,status);
--> statement-breakpoint
CREATE TABLE cms_sponsor_companies (
 id text PRIMARY KEY,data jsonb NOT NULL,version integer NOT NULL DEFAULT 1,created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE cms_sponsor_memberships (
 id text PRIMARY KEY,sponsor_id text NOT NULL REFERENCES cms_sponsor_companies(id),user_id text NOT NULL REFERENCES auth_user(id),
 roles text[] NOT NULL CHECK(cardinality(roles)>0 AND roles<@ARRAY['signer','billing','marketing']::text[]),version integer NOT NULL DEFAULT 1,
 UNIQUE(sponsor_id,user_id)
);
CREATE INDEX sponsor_membership_user_idx ON cms_sponsor_memberships(user_id,sponsor_id);
--> statement-breakpoint
CREATE TABLE cms_directory_invitations (
 id text PRIMARY KEY,person_id text NOT NULL REFERENCES cms_records(id),email text NOT NULL CHECK(email=lower(trim(email))),
 scope text NOT NULL CHECK(scope IN ('club','sponsor')),sponsor_id text REFERENCES cms_sponsor_companies(id),sponsor_roles text[] NOT NULL DEFAULT '{}',
 token_hash text NOT NULL UNIQUE CHECK(token_hash~'^[a-f0-9]{64}$'),status text NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','accepted','revoked')),
 created_by text NOT NULL REFERENCES auth_user(id),created_at timestamptz NOT NULL DEFAULT now(),expires_at timestamptz NOT NULL,
 accepted_at timestamptz,user_id text REFERENCES auth_user(id),mail_status text NOT NULL DEFAULT 'prepared' CHECK(mail_status IN ('prepared','accepted','failed')),
 code_hash text,code_nonce_hash text,provider_id uuid,code_expires_at timestamptz,issued_at timestamptz,attempts integer NOT NULL DEFAULT 0 CHECK(attempts BETWEEN 0 AND 5),
 CHECK((scope='club' AND sponsor_id IS NULL AND cardinality(sponsor_roles)=0) OR
       (scope='sponsor' AND sponsor_id IS NOT NULL AND cardinality(sponsor_roles)>0 AND sponsor_roles<@ARRAY['signer','billing','marketing']::text[]))
);
CREATE UNIQUE INDEX directory_invitation_email_claim_idx ON cms_directory_invitations(email) WHERE status='pending';
CREATE UNIQUE INDEX directory_invitation_person_pending_idx ON cms_directory_invitations(person_id) WHERE status='pending';
CREATE INDEX directory_invitation_expiry_idx ON cms_directory_invitations(expires_at) WHERE status='pending';
CREATE INDEX directory_invitation_person_created_idx ON cms_directory_invitations(person_id,created_at DESC);
CREATE INDEX directory_invitation_sponsor_idx ON cms_directory_invitations(sponsor_id,person_id);
CREATE TABLE cms_directory_invitation_views (
 nonce_hash text PRIMARY KEY CHECK(nonce_hash~'^[a-f0-9]{64}$'),invitation_id text NOT NULL REFERENCES cms_directory_invitations(id),expires_at timestamptz NOT NULL
);
CREATE INDEX directory_invitation_view_expiry_idx ON cms_directory_invitation_views(expires_at);
CREATE TABLE cms_directory_events (
 id text PRIMARY KEY,person_id text NOT NULL REFERENCES cms_records(id),actor_id text REFERENCES auth_user(id),action text NOT NULL,created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX directory_event_person_idx ON cms_directory_events(person_id,created_at DESC);
--> statement-breakpoint
CREATE TABLE cms_sponsor_records (
 id text PRIMARY KEY,kind text NOT NULL CHECK(kind IN ('items','packages','proposals','agreements','invoices','tasks','activities','profileRequests','businessChangeRequests','contractTemplates','events','settings')),
 sponsor_id text REFERENCES cms_sponsor_companies(id),data jsonb NOT NULL,version integer NOT NULL DEFAULT 1,
 snapshot_bytes text,created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX sponsor_record_kind_idx ON cms_sponsor_records(kind,updated_at DESC);
CREATE INDEX sponsor_record_company_idx ON cms_sponsor_records(sponsor_id,kind);
CREATE UNIQUE INDEX sponsor_document_number_idx ON cms_sponsor_records(kind,(data->>'number')) WHERE kind IN ('agreements','invoices');
CREATE UNIQUE INDEX sponsor_agreement_proposal_idx ON cms_sponsor_records((data->>'proposalId')) WHERE kind='agreements' AND data->>'status'<>'cancelled';
CREATE UNIQUE INDEX sponsor_invoice_installment_idx ON cms_sponsor_records((data->>'agreementId'),(coalesce(data#>>'{installment,index}','1'))) WHERE kind='invoices' AND data->>'status'<>'cancelled';
--> statement-breakpoint
CREATE TABLE cms_sponsor_documents (
 agreement_id text PRIMARY KEY REFERENCES cms_sponsor_records(id),sponsor_id text NOT NULL REFERENCES cms_sponsor_companies(id),
 snapshot_bytes text NOT NULL,document_hash text NOT NULL CHECK(document_hash~'^[a-f0-9]{64}$'),hash_format text NOT NULL DEFAULT 'json-utf8-v1' CHECK(hash_format='json-utf8-v1'),
 document_version integer NOT NULL,created_at timestamptz NOT NULL DEFAULT now(),UNIQUE(agreement_id,document_hash)
);
CREATE TABLE cms_sponsor_signing_challenges (
 id text PRIMARY KEY,agreement_id text NOT NULL,sponsor_id text NOT NULL REFERENCES cms_sponsor_companies(id),user_id text NOT NULL REFERENCES auth_user(id),
 party text NOT NULL CHECK(party IN ('sponsor','club')),email text NOT NULL,document_hash text NOT NULL,
 code_hash text NOT NULL CHECK(code_hash~'^[a-f0-9]{64}$'),status text NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','consumed','revoked')),
 attempts integer NOT NULL DEFAULT 0 CHECK(attempts BETWEEN 0 AND 5),created_at timestamptz NOT NULL DEFAULT now(),expires_at timestamptz NOT NULL,
 issued_at timestamptz,consumed_at timestamptz,mail_status text NOT NULL DEFAULT 'prepared' CHECK(mail_status IN ('prepared','accepted','failed')),
 FOREIGN KEY(agreement_id,document_hash) REFERENCES cms_sponsor_documents(agreement_id,document_hash)
);
CREATE UNIQUE INDEX sponsor_challenge_pending_idx ON cms_sponsor_signing_challenges(agreement_id,user_id,party) WHERE status='pending';
CREATE INDEX sponsor_challenge_expiry_idx ON cms_sponsor_signing_challenges(expires_at);
CREATE TABLE cms_sponsor_signatures (
 id text PRIMARY KEY,agreement_id text NOT NULL,user_id text NOT NULL REFERENCES auth_user(id),party text NOT NULL CHECK(party IN ('sponsor','club')),
 document_hash text NOT NULL,challenge_id text NOT NULL UNIQUE REFERENCES cms_sponsor_signing_challenges(id),proof jsonb NOT NULL,created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(agreement_id,party),FOREIGN KEY(agreement_id,document_hash) REFERENCES cms_sponsor_documents(agreement_id,document_hash),
 CHECK(proof->>'verification'='email-otp' AND proof->>'userId'=user_id AND proof->>'party'=party AND proof->>'documentHash'=document_hash AND proof->>'consent'='true')
);
--> statement-breakpoint
CREATE TABLE cms_sponsor_files (
 id text PRIMARY KEY,sponsor_id text NOT NULL REFERENCES cms_sponsor_companies(id),agreement_id text REFERENCES cms_sponsor_documents(agreement_id),kind text NOT NULL,
 storage_key text NOT NULL UNIQUE,file_hash text NOT NULL CHECK(file_hash~'^[a-f0-9]{64}$'),bytes bigint NOT NULL CHECK(bytes>0),mime text NOT NULL,name text NOT NULL,
 document_hash text,view_fingerprint text NOT NULL DEFAULT '',created_by text REFERENCES auth_user(id),created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX sponsor_file_company_idx ON cms_sponsor_files(sponsor_id,kind);
CREATE UNIQUE INDEX sponsor_final_pdf_idx ON cms_sponsor_files(agreement_id) WHERE kind='agreement-final';
CREATE TABLE cms_sponsor_deliveries (
 id text PRIMARY KEY,sponsor_id text NOT NULL REFERENCES cms_sponsor_companies(id),user_id text REFERENCES auth_user(id),reference_id text NOT NULL,
 kind text NOT NULL,status text NOT NULL DEFAULT 'queued',created_at timestamptz NOT NULL DEFAULT now(),delivered_at timestamptz
);
CREATE INDEX sponsor_delivery_company_idx ON cms_sponsor_deliveries(sponsor_id,created_at DESC);
CREATE TABLE cms_sponsor_notification_reads (
 user_id text NOT NULL REFERENCES auth_user(id),reference_id text NOT NULL,read_at timestamptz NOT NULL DEFAULT now(),PRIMARY KEY(user_id,reference_id)
);
CREATE TABLE cms_domain_operations (
 id uuid PRIMARY KEY,actor_id text NOT NULL REFERENCES auth_user(id),request_hash text NOT NULL,result jsonb NOT NULL,created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX domain_operation_actor_idx ON cms_domain_operations(actor_id,created_at DESC);
CREATE TABLE cms_domain_revision (id boolean PRIMARY KEY DEFAULT true CHECK(id),version bigint NOT NULL DEFAULT 0);
INSERT INTO cms_domain_revision(id) VALUES(true);
--> statement-breakpoint
-- No users are replaced or invited. Existing identity links are checked first.
DO $migration$
BEGIN
 IF EXISTS(SELECT draft->>'backofficeUserId' FROM cms_records WHERE module='people' AND coalesce(draft->>'backofficeUserId','')<>'' GROUP BY 1 HAVING count(*)>1) THEN
  RAISE EXCEPTION 'Dubbele bestaande account-persoonkoppeling: beoordeel de registerkoppelingen voor migratie';
 END IF;
 IF EXISTS(SELECT 1 FROM cms_records p LEFT JOIN auth_user u ON u.id=p.draft->>'backofficeUserId' WHERE p.module='people' AND coalesce(p.draft->>'backofficeUserId','')<>'' AND u.id IS NULL) THEN
  RAISE EXCEPTION 'Bestaande persoonskoppeling verwijst naar een ontbrekend account';
 END IF;
 IF EXISTS(SELECT 1 FROM cms_records p JOIN cms_person_accounts a ON a.person_id=p.id OR a.user_id=p.draft->>'backofficeUserId' WHERE p.module='people' AND coalesce(p.draft->>'backofficeUserId','')<>'' AND (a.person_id<>p.id OR a.user_id<>p.draft->>'backofficeUserId')) THEN RAISE EXCEPTION 'Bestaande centrale koppeling wijkt af van het websiteprofiel'; END IF;
END $migration$;
INSERT INTO cms_person_accounts(person_id,user_id)
 SELECT id,draft->>'backofficeUserId' FROM cms_records WHERE module='people' AND coalesce(draft->>'backofficeUserId','')<>'' AND NOT EXISTS(SELECT 1 FROM cms_person_accounts a WHERE a.person_id=cms_records.id AND a.user_id=cms_records.draft->>'backofficeUserId');
INSERT INTO cms_records(id,module,title,draft,status)
 SELECT 'person-account-'||u.id,'people',u.name,jsonb_build_object('id','person-account-'||u.id,'name',u.name,'role','','group','','teamId','','bio','','mediaId','','email',u.email,'phone','','showContact',false,'published',false,'order',0),'draft'
 FROM auth_user u WHERE NOT EXISTS(SELECT 1 FROM cms_person_accounts a WHERE a.user_id=u.id);
INSERT INTO cms_person_accounts(person_id,user_id)
 SELECT 'person-account-'||u.id,u.id FROM auth_user u WHERE NOT EXISTS(SELECT 1 FROM cms_person_accounts a WHERE a.user_id=u.id);
INSERT INTO cms_directory_profiles(person_id,data,source_ref)
 SELECT p.id,jsonb_build_object('personId',p.id,'birthDate','','membership','none','status','active','labels','[]'::jsonb,'teamIds',CASE WHEN coalesce(p.draft->>'teamId','')<>'' THEN jsonb_build_array(p.draft->>'teamId') ELSE '[]'::jsonb END,
 'address','','postalCode','','city','','source',CASE WHEN coalesce(p.draft->>'sportlinkId','')<>'' THEN 'sportlink' WHEN a.user_id IS NOT NULL THEN 'account' ELSE 'manual' END,
 'sourceUpdatedAt','','updatedAt',to_char(now() AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),'sponsorIds','[]'::jsonb),nullif(upper(trim(p.draft->>'sportlinkId')),'')
 FROM cms_records p LEFT JOIN cms_person_accounts a ON a.person_id=p.id WHERE p.module='people';
INSERT INTO cms_roles(id,name,description,team_scoped) VALUES
 ('portal','Portaalgebruiker','Eigen gegevens en goedgekeurde relaties; geen backofficerechten.',false),
 ('sponsor','Sponsorcontact','Toegang uitsluitend via expliciete bedrijfskoppelingen.',false),
 ('ledenadministratie','Ledenadministratie','Personen, lidmaatschappen, functies, uitnodigingen en ouderrelaties.',false),
 ('sponsorcommissie','Sponsorcommissie','Sponsordossiers, sponsorcontacten en bedrijfsdocumenten.',false) ON CONFLICT(id) DO NOTHING;
INSERT INTO cms_grants(role_id,module,action) VALUES ('ledenadministratie','directory','*'),('sponsorcommissie','sponsors','*') ON CONFLICT DO NOTHING;
--> statement-breakpoint
CREATE FUNCTION cms_preserve_sponsor_document() RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog,public AS $body$
BEGIN
 IF TG_OP='DELETE' OR NEW.snapshot_bytes IS DISTINCT FROM OLD.snapshot_bytes OR NEW.document_hash IS DISTINCT FROM OLD.document_hash OR NEW.hash_format IS DISTINCT FROM OLD.hash_format OR NEW.sponsor_id IS DISTINCT FROM OLD.sponsor_id OR NEW.document_version IS DISTINCT FROM OLD.document_version THEN
  RAISE EXCEPTION 'Vastgelegde documentinhoud is onveranderlijk';
 END IF;
 RETURN NEW;
END $body$;
CREATE TRIGGER sponsor_document_immutable BEFORE UPDATE OR DELETE ON cms_sponsor_documents FOR EACH ROW EXECUTE FUNCTION cms_preserve_sponsor_document();
CREATE FUNCTION cms_preserve_sponsor_signature() RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog,public AS $body$
BEGIN
 RAISE EXCEPTION 'Ondertekenbewijzen zijn onveranderlijk';
END $body$;
CREATE TRIGGER sponsor_signature_immutable BEFORE UPDATE OR DELETE ON cms_sponsor_signatures FOR EACH ROW EXECUTE FUNCTION cms_preserve_sponsor_signature();
CREATE FUNCTION cms_validate_sponsor_signature() RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog,public AS $body$
BEGIN
 IF NEW.party='club' AND NOT EXISTS(SELECT 1 FROM public.cms_sponsor_signatures s WHERE s.agreement_id=NEW.agreement_id AND s.party='sponsor' AND s.user_id<>NEW.user_id) THEN
  RAISE EXCEPTION 'De sponsor tekent eerst; partijen gebruiken verschillende accounts';
 END IF;
 IF NOT EXISTS(SELECT 1 FROM public.cms_sponsor_signing_challenges c WHERE c.id=NEW.challenge_id AND c.status='consumed' AND c.user_id=NEW.user_id AND c.party=NEW.party AND c.agreement_id=NEW.agreement_id AND c.document_hash=NEW.document_hash AND c.mail_status='accepted') THEN
  RAISE EXCEPTION 'Een verbruikte eigen e-mailverificatie ontbreekt';
 END IF;
 RETURN NEW;
END $body$;
CREATE TRIGGER sponsor_signature_verified BEFORE INSERT ON cms_sponsor_signatures FOR EACH ROW EXECUTE FUNCTION cms_validate_sponsor_signature();
--> statement-breakpoint
CREATE FUNCTION cms_portal_changed() RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog,public AS $body$
BEGIN
 UPDATE public.cms_domain_revision SET version=version+1 WHERE id=true;
 RETURN NULL;
END $body$;
DO $privacy$
DECLARE name text;
BEGIN
 FOREACH name IN ARRAY ARRAY['cms_person_accounts','cms_directory_profiles','cms_directory_assignments','cms_directory_guardians','cms_directory_invitations','cms_directory_invitation_views','cms_directory_events','cms_sponsor_companies','cms_sponsor_memberships','cms_sponsor_records','cms_sponsor_documents','cms_sponsor_signing_challenges','cms_sponsor_signatures','cms_sponsor_files','cms_sponsor_deliveries','cms_sponsor_notification_reads','cms_domain_operations','cms_domain_revision'] LOOP
  EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY',name);
  EXECUTE format('REVOKE ALL ON public.%I FROM PUBLIC,anon,authenticated,service_role',name);
 END LOOP;
 FOREACH name IN ARRAY ARRAY['cms_records','auth_user','cms_memberships','cms_grants','cms_person_accounts','cms_directory_profiles','cms_directory_guardians','cms_directory_assignments','cms_directory_invitations','cms_sponsor_companies','cms_sponsor_memberships','cms_sponsor_records'] LOOP
  EXECUTE format('CREATE TRIGGER domain_revision_changed AFTER INSERT OR UPDATE OR DELETE ON public.%I FOR EACH STATEMENT EXECUTE FUNCTION public.cms_portal_changed()',name);
 END LOOP;
END $privacy$;
REVOKE ALL ON FUNCTION cms_portal_changed(),cms_preserve_sponsor_document(),cms_preserve_sponsor_signature(),cms_validate_sponsor_signature() FROM PUBLIC,anon,authenticated,service_role;

--> statement-breakpoint
CREATE FUNCTION cms_preserve_sponsor_snapshot() RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog,public AS $body$
BEGIN
 IF OLD.snapshot_bytes IS NOT NULL AND (TG_OP='DELETE' OR NEW.snapshot_bytes IS DISTINCT FROM OLD.snapshot_bytes OR NEW.sponsor_id IS DISTINCT FROM OLD.sponsor_id OR NEW.kind IS DISTINCT FROM OLD.kind OR NEW.data->'snapshot' IS DISTINCT FROM OLD.data->'snapshot') THEN
  RAISE EXCEPTION 'Verzonden documentinhoud is onveranderlijk';
 END IF;
 IF OLD.kind='invoices' AND (TG_OP='DELETE' OR NEW.sponsor_id IS DISTINCT FROM OLD.sponsor_id OR NEW.kind IS DISTINCT FROM OLD.kind OR (NEW.data-ARRAY['status','paidAt','paymentMethod']) IS DISTINCT FROM (OLD.data-ARRAY['status','paidAt','paymentMethod'])) THEN RAISE EXCEPTION 'Vastgelegde factuurbedragen en referenties zijn onveranderlijk'; END IF;
 IF OLD.kind='agreements' AND (NEW.data->>'documentHash' IS DISTINCT FROM OLD.data->>'documentHash' OR NEW.data->>'version' IS DISTINCT FROM OLD.data->>'version') THEN RAISE EXCEPTION 'Documenthash en versie zijn onveranderlijk'; END IF;
 RETURN CASE WHEN TG_OP='DELETE' THEN OLD ELSE NEW END;
END $body$;
CREATE TRIGGER sponsor_snapshot_immutable BEFORE UPDATE OR DELETE ON cms_sponsor_records FOR EACH ROW EXECUTE FUNCTION cms_preserve_sponsor_snapshot();
REVOKE ALL ON FUNCTION cms_preserve_sponsor_snapshot() FROM PUBLIC,anon,authenticated,service_role;

--> statement-breakpoint
CREATE TABLE cms_directory_family_codes (person_id text PRIMARY KEY REFERENCES cms_records(id),code_hash text NOT NULL UNIQUE,expires_at timestamptz NOT NULL,created_by text NOT NULL REFERENCES auth_user(id));
ALTER TABLE cms_directory_family_codes ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON cms_directory_family_codes FROM PUBLIC,anon,authenticated,service_role;

--> statement-breakpoint
CREATE FUNCTION cms_preserve_final_sponsor_file() RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog,public AS $body$
BEGIN
 IF OLD.kind='agreement-final' THEN RAISE EXCEPTION 'De definitieve PDF en bestandshash zijn onveranderlijk'; END IF;
 RETURN CASE WHEN TG_OP='DELETE' THEN OLD ELSE NEW END;
END $body$;
CREATE TRIGGER sponsor_final_file_immutable BEFORE UPDATE OR DELETE ON cms_sponsor_files FOR EACH ROW EXECUTE FUNCTION cms_preserve_final_sponsor_file();
REVOKE ALL ON FUNCTION cms_preserve_final_sponsor_file() FROM PUBLIC,anon,authenticated,service_role;
