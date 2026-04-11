-- Allow wiki_queue.entry_id to be NULL.
-- Wiki updates triggered by task status changes, notes, or pending response updates
-- may not have an associated entry (e.g., merged tasks, manual status changes).

ALTER TABLE wiki_queue ALTER COLUMN entry_id DROP NOT NULL;
