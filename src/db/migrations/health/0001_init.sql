-- Health schema (habits and sleep), migrated from Mycelium (oneash-DB.db). Like
-- planner.sqlite this is source of truth, so it lives in its own health.sqlite
-- next to it and survives index rebuilds.
--
-- Column names match Mycelium so the one-time importer
-- (scripts/import-mycelium-health.py) is a near 1:1 copy.
--
-- Dropped on purpose: habits.type, habits.times_per_week (the v1 habit kinds the
-- app stopped reading) and habits.source (always 'manual').
-- No triggers: the migration runner splits on semicolons.
--
-- Time formats: created_at / set_at are ISO8601 UTC with a Z. habit_logs.date and
-- sleep_entries.date are local YYYY-MM-DD. sleep_start / wake_time are local
-- wall-clock YYYY-MM-DDTHH:MM:SS with no timezone, and sleep_entries.date is the
-- EVENING the night began (a 01:30 bedtime is stored under the previous date).

CREATE TABLE IF NOT EXISTS habits (
  id          TEXT PRIMARY KEY,
  name        TEXT NOT NULL,
  color       TEXT NOT NULL DEFAULT '#4a8c6e',
  value_type  TEXT NOT NULL DEFAULT 'boolean' CHECK(value_type IN ('boolean','numeric')),
  goal_type   TEXT NOT NULL DEFAULT 'none' CHECK(goal_type IN
              ('every_day','times_per_month','times_per_week','at_least_per_day','at_most_per_day','monthly_total','none')),
  goal_value  REAL,
  sort_order  INTEGER NOT NULL DEFAULT 0,
  created_at  TEXT NOT NULL,
  archived_at TEXT
);

-- One row per habit per day; value is NULL for boolean habits.
CREATE TABLE IF NOT EXISTS habit_logs (
  id         TEXT PRIMARY KEY,
  habit_id   TEXT NOT NULL REFERENCES habits(id) ON DELETE CASCADE,
  date       TEXT NOT NULL,
  value      REAL,
  created_at TEXT NOT NULL,
  UNIQUE(habit_id, date)
);
CREATE INDEX IF NOT EXISTS idx_habit_logs_date ON habit_logs(date);

CREATE TABLE IF NOT EXISTS sleep_entries (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  date        TEXT NOT NULL,
  sleep_start TEXT NOT NULL,
  wake_time   TEXT NOT NULL,
  is_nap      INTEGER NOT NULL DEFAULT 0 CHECK(is_nap IN (0,1)),
  notes       TEXT NOT NULL DEFAULT '',
  created_at  TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_sleep_entries_date ON sleep_entries(date);

-- A history: the newest row is the active target.
CREATE TABLE IF NOT EXISTS sleep_targets (
  id                 INTEGER PRIMARY KEY AUTOINCREMENT,
  target_sleep_start TEXT NOT NULL,
  target_duration    REAL NOT NULL,
  set_at             TEXT NOT NULL
);
