-- Pools replace per-task dates: a task lives in inbox, cold or hot instead of being scheduled.
-- planned_start_at now belongs only to events and routine occurrences.
ALTER TABLE nodes ADD COLUMN pool TEXT NOT NULL DEFAULT 'hot' CHECK(pool IN ('inbox','cold','hot'));
UPDATE nodes SET planned_start_at = NULL WHERE node_type = 'task' AND is_routine = 0 AND routine_id IS NULL;
CREATE INDEX IF NOT EXISTS idx_nodes_pool ON nodes(pool);
