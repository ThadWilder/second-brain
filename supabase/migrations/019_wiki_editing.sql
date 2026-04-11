-- Add fields for manual wiki editing and page locking
-- locked: when true, the wiki processor skips auto-rewriting this page
-- last_manual_edit: timestamp of the last manual content edit by a user

ALTER TABLE wiki_pages ADD COLUMN locked boolean DEFAULT false;
ALTER TABLE wiki_pages ADD COLUMN last_manual_edit timestamptz;
