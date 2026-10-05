-- Adds the 'freezer' pool (super long term). SQLite cannot edit a CHECK in place, and rebuilding
-- nodes would cascade-delete its children, so swap the column instead: add a widened copy, move the
-- values over, drop the old column (its index first), and rename the copy back to `pool`.
ALTER TABLE nodes ADD COLUMN pool_next TEXT NOT NULL DEFAULT 'hot' CHECK(pool_next IN ('inbox','cold','freezer','hot'));
UPDATE nodes SET pool_next = pool;
DROP INDEX IF EXISTS idx_nodes_pool;
ALTER TABLE nodes DROP COLUMN pool;
ALTER TABLE nodes RENAME COLUMN pool_next TO pool;
CREATE INDEX IF NOT EXISTS idx_nodes_pool ON nodes(pool);
