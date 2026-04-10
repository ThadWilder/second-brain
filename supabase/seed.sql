-- Dumpbox seed data
-- 10 brands, 3 team members, 2 vendors

TRUNCATE wiki_links, wiki_pages, decision_entities, task_events, task_entities,
  entry_entities, entity_relationships, entity_aliases, pending_responses,
  decisions, tasks, entries, entities CASCADE;

INSERT INTO entities (org_id, name, normalized_name, type, first_seen, last_seen) VALUES
  -- Brands
  ('00000000-0000-0000-0000-000000000001', 'MaidPro', 'maidpro', 'brand', now(), now()),
  ('00000000-0000-0000-0000-000000000001', 'USA Insulation', 'usa insulation', 'brand', now(), now()),
  ('00000000-0000-0000-0000-000000000001', 'Pestmaster', 'pestmaster', 'brand', now(), now()),
  ('00000000-0000-0000-0000-000000000001', 'Men In Kilts', 'men in kilts', 'brand', now(), now()),
  ('00000000-0000-0000-0000-000000000001', 'Mold Medics', 'mold medics', 'brand', now(), now()),
  ('00000000-0000-0000-0000-000000000001', 'Miracle Method', 'miracle method', 'brand', now(), now()),
  ('00000000-0000-0000-0000-000000000001', 'Granite Garage Floors', 'granite garage floors', 'brand', now(), now()),
  ('00000000-0000-0000-0000-000000000001', 'PHP', 'php', 'brand', now(), now()),
  ('00000000-0000-0000-0000-000000000001', 'HAP', 'hap', 'brand', now(), now()),
  ('00000000-0000-0000-0000-000000000001', 'PLP', 'plp', 'brand', now(), now()),
  -- Team
  ('00000000-0000-0000-0000-000000000001', 'Brandy Murch', 'brandy murch', 'contact', now(), now()),
  ('00000000-0000-0000-0000-000000000001', 'Michelle', 'michelle', 'contact', now(), now()),
  ('00000000-0000-0000-0000-000000000001', 'Dustin', 'dustin', 'contact', now(), now()),
  ('00000000-0000-0000-0000-000000000001', 'Amanda', 'amanda', 'contact', now(), now()),
  -- Vendors
  ('00000000-0000-0000-0000-000000000001', 'Moe', 'moe', 'vendor', now(), now()),
  ('00000000-0000-0000-0000-000000000001', 'Red Brick', 'red brick', 'vendor', now(), now());

-- Brand aliases (full names for abbreviated brands)
INSERT INTO entity_aliases (entity_id, alias, normalized_alias)
  SELECT id, 'Plumbing & Heating Paramedics', 'plumbing & heating paramedics'
  FROM entities WHERE name = 'PHP' AND org_id = '00000000-0000-0000-0000-000000000001'
UNION ALL
  SELECT id, 'Heating & Air Paramedics', 'heating & air paramedics'
  FROM entities WHERE name = 'HAP' AND org_id = '00000000-0000-0000-0000-000000000001'
UNION ALL
  SELECT id, 'Plumbing Paramedics', 'plumbing paramedics'
  FROM entities WHERE name = 'PLP' AND org_id = '00000000-0000-0000-0000-000000000001'
UNION ALL
  SELECT id, 'Brandy', 'brandy'
  FROM entities WHERE name = 'Brandy Murch' AND org_id = '00000000-0000-0000-0000-000000000001'
UNION ALL
  SELECT id, 'bmurch', 'bmurch'
  FROM entities WHERE name = 'Brandy Murch' AND org_id = '00000000-0000-0000-0000-000000000001';
