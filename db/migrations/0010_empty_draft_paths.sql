DELETE FROM cms_paths p USING cms_records r WHERE p.record_id=r.id AND p.kind='draft' AND coalesce(r.draft->>'slug','')='' AND r.live IS NULL;
