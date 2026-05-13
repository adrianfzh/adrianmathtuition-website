-- Add order_index column to subgroups for Feature 4 (sub-group reorder)
-- Using real (float) so insertions between existing values don't require rewriting every row
ALTER TABLE subgroups ADD COLUMN IF NOT EXISTS order_index real;

-- Seed existing rows monotonically per (level, topic) partition, ordered by id
WITH ranked AS (
  SELECT id, row_number() OVER (PARTITION BY level, topic ORDER BY id) AS rn
  FROM subgroups
)
UPDATE subgroups s SET order_index = r.rn FROM ranked r WHERE s.id = r.id;

CREATE INDEX IF NOT EXISTS idx_subgroups_level_topic_order
  ON subgroups (level, topic, order_index);

NOTIFY pgrst, 'reload schema';
