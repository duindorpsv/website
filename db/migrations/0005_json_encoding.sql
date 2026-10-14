-- Correct development imports made before explicit PostgreSQL JSON encoders.
-- Fresh imports already store objects. Original seed archives remain intact.
UPDATE cms_records SET draft=(draft#>>'{}')::jsonb WHERE jsonb_typeof(draft)='string';
UPDATE cms_records SET live=(live#>>'{}')::jsonb WHERE jsonb_typeof(live)='string';
ALTER TABLE cms_publications DISABLE TRIGGER cms_publications_immutable;
UPDATE cms_publications SET snapshot=(snapshot#>>'{}')::jsonb WHERE jsonb_typeof(snapshot)='string';
ALTER TABLE cms_publications ENABLE TRIGGER cms_publications_immutable;
ALTER TABLE cms_revisions DISABLE TRIGGER cms_revisions_immutable;
UPDATE cms_revisions SET snapshot=(snapshot#>>'{}')::jsonb WHERE jsonb_typeof(snapshot)='string';
ALTER TABLE cms_revisions ENABLE TRIGGER cms_revisions_immutable;
UPDATE cms_departments SET emails=(emails#>>'{}')::jsonb WHERE jsonb_typeof(emails)='string';
UPDATE cms_jobs SET payload=(payload#>>'{}')::jsonb WHERE jsonb_typeof(payload)='string';
UPDATE cms_media_objects SET variants=(variants#>>'{}')::jsonb WHERE jsonb_typeof(variants)='string';
ALTER TABLE cms_records ADD CONSTRAINT record_draft_object CHECK(jsonb_typeof(draft)='object');
ALTER TABLE cms_records ADD CONSTRAINT record_live_object CHECK(live IS NULL OR jsonb_typeof(live)='object');
