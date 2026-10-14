-- Repair early development queue data; new workers use raw PostgreSQL JSON encoders.
UPDATE cms_media_objects SET variants=(variants#>>'{}')::jsonb WHERE jsonb_typeof(variants)='string';
UPDATE cms_jobs SET payload=(payload#>>'{}')::jsonb WHERE jsonb_typeof(payload)='string';
UPDATE cms_imports SET report=(report#>>'{}')::jsonb WHERE jsonb_typeof(report)='string';
ALTER TABLE cms_media_objects ADD CONSTRAINT media_variants_array CHECK(jsonb_typeof(variants)='array');
ALTER TABLE cms_jobs ADD CONSTRAINT job_payload_object CHECK(jsonb_typeof(payload)='object');
ALTER TABLE cms_imports ADD CONSTRAINT import_report_object CHECK(jsonb_typeof(report)='object');
ALTER TABLE cms_submissions ADD CONSTRAINT submission_snapshot_object CHECK(jsonb_typeof(snapshot)='object');
ALTER TABLE cms_submissions ADD CONSTRAINT submission_answers_array CHECK(jsonb_typeof(answers)='array');
ALTER TABLE cms_departments ADD CONSTRAINT department_emails_array CHECK(jsonb_typeof(emails)='array');
