-- Sprints: short-term themes smaller than a project. A sprint may sit inside an arc or a project, or stand alone.
-- sort_order is the hand-ranked position on the dashboard (lower first). A node belongs to at most one sprint.
CREATE TABLE IF NOT EXISTS sprints (
  id         TEXT PRIMARY KEY,
  name       TEXT NOT NULL,
  arc_id     TEXT REFERENCES arcs(id) ON DELETE SET NULL,
  project_id TEXT REFERENCES projects(id) ON DELETE SET NULL,
  status     TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active','done')),
  sort_order REAL,
  created_at TEXT NOT NULL
);

ALTER TABLE nodes ADD COLUMN sprint_id TEXT REFERENCES sprints(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_nodes_sprint ON nodes(sprint_id);
