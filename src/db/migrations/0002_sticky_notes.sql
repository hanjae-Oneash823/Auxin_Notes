-- Sticky notes: unlike the `notes` table above, this is NOT a derived cache
-- of anything on disk. These rows are the source of truth — created, edited,
-- and deleted directly by the app, with no backing file and nothing to
-- reconcile against on startup.

CREATE TABLE IF NOT EXISTS sticky_notes (
  id            TEXT PRIMARY KEY,            -- ULID
  type          TEXT NOT NULL DEFAULT 'text', -- 'text' | 'checklist'
  title         TEXT,                         -- optional short label, shown in the pinned dock
  content       TEXT NOT NULL DEFAULT '',     -- body for a 'text' note; unused for 'checklist'
  color         TEXT NOT NULL DEFAULT 'yellow',
  pinned        INTEGER NOT NULL DEFAULT 0,
  pinned_order  INTEGER,                      -- position within the pinned dock; NULL when unpinned
  board_x       REAL,                         -- last dragged/simulated board position;
  board_y       REAL,                         -- NULL lets the physics layout place it fresh
  created       TEXT NOT NULL,                -- ISO8601
  modified      TEXT NOT NULL                 -- ISO8601
);
CREATE INDEX IF NOT EXISTS idx_sticky_notes_pinned ON sticky_notes(pinned, pinned_order);

CREATE TABLE IF NOT EXISTS sticky_note_items (
  id       TEXT PRIMARY KEY,                  -- ULID
  note_id  TEXT NOT NULL REFERENCES sticky_notes(id) ON DELETE CASCADE,
  text     TEXT NOT NULL,
  checked  INTEGER NOT NULL DEFAULT 0,
  position INTEGER NOT NULL                   -- order within the checklist
);
CREATE INDEX IF NOT EXISTS idx_sticky_items_note ON sticky_note_items(note_id, position);
