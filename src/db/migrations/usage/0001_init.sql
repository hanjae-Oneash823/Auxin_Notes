-- Auxin usage-events log. Deliberately separate from index.sqlite: that
-- database is a pure derived cache of the vault's markdown files and gets
-- dropped/rebuilt freely (see its own header comment) — usage history must
-- survive a rebuild, so it can't live there.

CREATE TABLE IF NOT EXISTS events (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  event_type  TEXT NOT NULL,   -- 'create' | 'edit' | 'delete' | 'delete_folder' | 'rename'
  path        TEXT NOT NULL,   -- vault-relative path at the time of the event
  title       TEXT NOT NULL,
  occurred_at TEXT NOT NULL,   -- ISO8601, set client-side (new Date().toISOString())
  detail      TEXT             -- optional JSON, e.g. {"oldTitle":...}, {"noteCount":...}
);
CREATE INDEX IF NOT EXISTS idx_events_occurred_at ON events(occurred_at);
CREATE INDEX IF NOT EXISTS idx_events_type ON events(event_type);
