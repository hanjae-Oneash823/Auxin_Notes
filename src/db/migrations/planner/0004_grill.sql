-- Adds the 'grill' pool (the few most important tasks). Same column swap as 0003: SQLite cannot edit a
-- CHECK in place, and rebuilding nodes would cascade-delete its children.
ALTER TABLE nodes ADD COLUMN pool_next TEXT NOT NULL DEFAULT 'hot' CHECK(pool_next IN ('inbox','grill','hot','cold','freezer'));
UPDATE nodes SET pool_next = pool;
DROP INDEX IF EXISTS idx_nodes_pool;
ALTER TABLE nodes DROP COLUMN pool;
ALTER TABLE nodes RENAME COLUMN pool_next TO pool;
CREATE INDEX IF NOT EXISTS idx_nodes_pool ON nodes(pool);
