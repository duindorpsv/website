ALTER TABLE "cms_records" ADD COLUMN "author_id" text;--> statement-breakpoint
ALTER TABLE "cms_records" ADD COLUMN "parent_id" text;--> statement-breakpoint
ALTER TABLE "cms_records" ADD COLUMN "season" text;--> statement-breakpoint
ALTER TABLE "cms_records" ADD COLUMN "category" text;--> statement-breakpoint
ALTER TABLE "cms_records" ADD CONSTRAINT "cms_records_author_id_cms_records_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."cms_records"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cms_records" ADD CONSTRAINT "cms_records_parent_id_cms_records_id_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."cms_records"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "records_author_idx" ON "cms_records" USING btree ("author_id");--> statement-breakpoint
CREATE INDEX "records_parent_idx" ON "cms_records" USING btree ("parent_id");--> statement-breakpoint
CREATE INDEX "records_season_idx" ON "cms_records" USING btree ("season");--> statement-breakpoint
CREATE INDEX "records_category_idx" ON "cms_records" USING btree ("category");
--> statement-breakpoint
CREATE FUNCTION normalize_cms_metadata() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 NEW.author_id := nullif(NEW.draft->>'authorId','');
 NEW.parent_id := nullif(NEW.draft->>'parentId','');
 NEW.season := nullif(NEW.draft->>'season','');
 NEW.category := nullif(NEW.draft->>'category','');
 RETURN NEW; END $$;
--> statement-breakpoint
CREATE TRIGGER cms_metadata_normalization BEFORE INSERT OR UPDATE OF draft ON cms_records FOR EACH ROW EXECUTE FUNCTION normalize_cms_metadata();
--> statement-breakpoint
UPDATE cms_records SET draft=draft;
