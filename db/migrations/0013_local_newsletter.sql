ALTER TABLE cms_newsletter ADD COLUMN version integer NOT NULL DEFAULT 1;
--> statement-breakpoint
UPDATE cms_newsletter SET status='active',version=version+1
 WHERE status='confirmed' AND confirmed_at IS NOT NULL;
--> statement-breakpoint
UPDATE cms_jobs SET status='cancelled',lease_owner=NULL,lease_until=NULL
 WHERE kind IN ('newsletter-provider','newsletter-unsubscribe')
 AND status IN ('pending','waiting','processing');
--> statement-breakpoint
CREATE INDEX newsletter_created_id_idx ON cms_newsletter(created_at DESC,id);
--> statement-breakpoint
CREATE INDEX newsletter_topics_idx ON cms_newsletter USING gin(topics);
