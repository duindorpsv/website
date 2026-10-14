INSERT INTO cms_grants(role_id,module,action) SELECT role_id,'stories',action FROM cms_grants WHERE module='news' ON CONFLICT DO NOTHING;
