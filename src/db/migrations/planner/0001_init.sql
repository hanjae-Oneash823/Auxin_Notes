-- Planner schema, migrated from Mycelium (oneash-DB.db). Unlike index.sqlite
-- this is NOT a derived cache: every row is source of truth, which is why it
-- lives in its own planner.sqlite next to usage.sqlite and survives index rebuilds.
--
-- Column names deliberately match Mycelium so the one-time importer
-- (scripts/import-mycelium-planner.py) is a near 1:1 copy.
--
-- Dropped on purpose: nodes.is_overdue and nodes.computed_urgency_level are
-- derived from importance + due date, so they are computed in code, not stored.
-- No triggers: the migration runner splits on semicolons. The two Mycelium
-- triggers (touch updated_at, keep every node in a group) become app code.
--
-- Time formats: instants (created_at, sessions, logs) are ISO8601 UTC with a Z.
-- nodes.planned_start_at is local wall-clock: YYYY-MM-DD (date only) or
-- YYYY-MM-DDTHH:MM:SS. due_at and rule dates are YYYY-MM-DD.

CREATE TABLE IF NOT EXISTS arcs (
  id          TEXT PRIMARY KEY,
  name        TEXT NOT NULL,
  color_hex   TEXT NOT NULL DEFAULT '#00c4a7',
  description TEXT NOT NULL DEFAULT '',
  status      TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active','done','archived')),
  created_at  TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS projects (
  id          TEXT PRIMARY KEY,
  arc_id      TEXT REFERENCES arcs(id) ON DELETE SET NULL,
  name        TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  status      TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active','done','archived')),
  start_date  TEXT,
  end_date    TEXT,
  created_at  TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_projects_arc ON projects(arc_id);

CREATE TABLE IF NOT EXISTS planner_groups (
  id           TEXT PRIMARY KEY,
  name         TEXT NOT NULL,
  color_hex    TEXT NOT NULL DEFAULT '#64c8ff',
  sort_order   INTEGER NOT NULL DEFAULT 0,
  is_ungrouped INTEGER NOT NULL DEFAULT 0,
  created_at   TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS routines (
  id               TEXT PRIMARY KEY,
  title            TEXT NOT NULL,
  node_type        TEXT NOT NULL DEFAULT 'task' CHECK(node_type IN ('task','event')),
  arc_id           TEXT REFERENCES arcs(id) ON DELETE SET NULL,
  project_id       TEXT REFERENCES projects(id) ON DELETE SET NULL,
  importance_level INTEGER NOT NULL DEFAULT 0 CHECK(importance_level IN (0,1)),
  created_at       TEXT NOT NULL,
  updated_at       TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS routine_rules (
  id               TEXT PRIMARY KEY,
  routine_id       TEXT NOT NULL REFERENCES routines(id) ON DELETE CASCADE,
  sort_order       INTEGER NOT NULL DEFAULT 0,
  freq             TEXT NOT NULL DEFAULT 'weekly' CHECK(freq IN ('daily','weekly','monthly','manual')),
  repeat_interval  INTEGER NOT NULL DEFAULT 1,
  days             TEXT,                 -- JSON array of weekday numbers, 0 = Sun
  start_date       TEXT NOT NULL,        -- YYYY-MM-DD (for manual rules, the one-off date)
  end_mode         TEXT NOT NULL DEFAULT 'count' CHECK(end_mode IN ('count','date')),
  end_count        INTEGER,
  end_date         TEXT,
  start_time       TEXT,                 -- HH:MM
  duration_minutes INTEGER,
  exceptions       TEXT                  -- JSON array of YYYY-MM-DD dates to skip
);
CREATE INDEX IF NOT EXISTS idx_routine_rules_routine ON routine_rules(routine_id);

CREATE TABLE IF NOT EXISTS routine_groups (
  routine_id TEXT NOT NULL REFERENCES routines(id) ON DELETE CASCADE,
  group_id   TEXT NOT NULL REFERENCES planner_groups(id) ON DELETE CASCADE,
  PRIMARY KEY (routine_id, group_id)
);

CREATE TABLE IF NOT EXISTS nodes (
  id                         TEXT PRIMARY KEY,
  project_id                 TEXT REFERENCES projects(id) ON DELETE SET NULL,
  arc_id                     TEXT REFERENCES arcs(id) ON DELETE SET NULL,
  title                      TEXT NOT NULL,
  node_type                  TEXT NOT NULL DEFAULT 'task' CHECK(node_type IN ('task','event')),
  planned_start_at           TEXT,
  due_at                     TEXT,
  actual_completed_at        TEXT,
  estimated_duration_minutes INTEGER,
  importance_level           INTEGER NOT NULL DEFAULT 0 CHECK(importance_level IN (0,1)),
  is_completed               INTEGER NOT NULL DEFAULT 0,
  is_locked                  INTEGER NOT NULL DEFAULT 0,
  is_pinned                  INTEGER NOT NULL DEFAULT 0,
  is_frog_pinned             INTEGER NOT NULL DEFAULT 0,
  is_routine                 INTEGER NOT NULL DEFAULT 0,
  routine_id                 TEXT REFERENCES routines(id) ON DELETE SET NULL,
  created_at                 TEXT NOT NULL,
  updated_at                 TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_nodes_project   ON nodes(project_id);
CREATE INDEX IF NOT EXISTS idx_nodes_arc       ON nodes(arc_id);
CREATE INDEX IF NOT EXISTS idx_nodes_planned   ON nodes(planned_start_at);
CREATE INDEX IF NOT EXISTS idx_nodes_due       ON nodes(due_at);
CREATE INDEX IF NOT EXISTS idx_nodes_completed ON nodes(is_completed);
CREATE INDEX IF NOT EXISTS idx_nodes_routine   ON nodes(routine_id);

CREATE TABLE IF NOT EXISTS node_groups (
  node_id  TEXT NOT NULL REFERENCES nodes(id) ON DELETE CASCADE,
  group_id TEXT NOT NULL REFERENCES planner_groups(id) ON DELETE CASCADE,
  PRIMARY KEY (node_id, group_id)
);
CREATE INDEX IF NOT EXISTS idx_node_groups_group ON node_groups(group_id);

CREATE TABLE IF NOT EXISTS sub_tasks (
  id           TEXT PRIMARY KEY,
  node_id      TEXT NOT NULL REFERENCES nodes(id) ON DELETE CASCADE,
  title        TEXT NOT NULL,
  is_completed INTEGER NOT NULL DEFAULT 0,
  sort_order   INTEGER NOT NULL DEFAULT 0,
  created_at   TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_sub_tasks_node ON sub_tasks(node_id);

-- Dependency edges between nodes ("tendrils"): source blocks target.
CREATE TABLE IF NOT EXISTS tendril_edges (
  id         TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  source_id  TEXT NOT NULL REFERENCES nodes(id) ON DELETE CASCADE,
  target_id  TEXT NOT NULL REFERENCES nodes(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_tendril_edges_project ON tendril_edges(project_id);

CREATE TABLE IF NOT EXISTS work_locations (
  id         TEXT PRIMARY KEY,
  name       TEXT NOT NULL UNIQUE,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS work_sessions (
  id           TEXT PRIMARY KEY,
  title        TEXT NOT NULL,
  location_id  TEXT REFERENCES work_locations(id) ON DELETE SET NULL,
  planned_date TEXT NOT NULL,
  actual_start TEXT,
  actual_end   TEXT,
  status       TEXT NOT NULL DEFAULT 'planned' CHECK(status IN ('planned','active','paused','completed','interrupted')),
  created_at   TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_work_sessions_date ON work_sessions(planned_date);

CREATE TABLE IF NOT EXISTS session_nodes (
  session_id    TEXT NOT NULL REFERENCES work_sessions(id) ON DELETE CASCADE,
  node_id       TEXT NOT NULL REFERENCES nodes(id) ON DELETE CASCADE,
  sort_order    INTEGER NOT NULL DEFAULT 0,
  status        TEXT NOT NULL DEFAULT 'queued' CHECK(status IN ('queued','in_progress','done','incomplete')),
  time_started  TEXT,
  time_finished TEXT,
  total_minutes REAL,
  PRIMARY KEY (session_id, node_id)
);
CREATE INDEX IF NOT EXISTS idx_session_nodes_node ON session_nodes(node_id);

CREATE TABLE IF NOT EXISTS session_pauses (
  id         TEXT PRIMARY KEY,
  session_id TEXT NOT NULL REFERENCES work_sessions(id) ON DELETE CASCADE,
  paused_at  TEXT NOT NULL,
  resumed_at TEXT,
  pause_type TEXT NOT NULL DEFAULT 'manual' CHECK(pause_type IN ('manual','pomo_short','pomo_long'))
);
CREATE INDEX IF NOT EXISTS idx_session_pauses_session ON session_pauses(session_id);

CREATE TABLE IF NOT EXISTS productivity_logs (
  id              TEXT PRIMARY KEY,
  node_id         TEXT REFERENCES nodes(id) ON DELETE SET NULL,
  completed_at    TEXT NOT NULL,
  duration_actual INTEGER
);
CREATE INDEX IF NOT EXISTS idx_productivity_logs_node ON productivity_logs(node_id);

CREATE TABLE IF NOT EXISTS user_capacity (
  id            TEXT PRIMARY KEY DEFAULT 'default',
  daily_minutes INTEGER NOT NULL DEFAULT 480,
  peak_start    TEXT NOT NULL DEFAULT '09:00',
  peak_end      TEXT NOT NULL DEFAULT '12:00',
  updated_at    TEXT NOT NULL
);
