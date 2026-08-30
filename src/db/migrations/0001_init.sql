-- Auxin index schema. This database is a pure derived cache of the vault's
-- markdown files — no code path should ever write here except "I just parsed
-- this file's current on-disk content." A full rebuild (drop + re-walk the
-- vault) must always converge to correct state.

CREATE TABLE IF NOT EXISTS notes (
  id            TEXT PRIMARY KEY,       -- ULID from frontmatter
  path          TEXT NOT NULL UNIQUE,   -- vault-relative path, current on-disk location
  title         TEXT NOT NULL,          -- derived from filename (sans .md)
  created       TEXT NOT NULL,          -- ISO8601, from frontmatter
  modified      TEXT NOT NULL,          -- ISO8601, from frontmatter
  content_hash  TEXT NOT NULL,          -- hash of raw file bytes, for change detection
  synced_at_ms  INTEGER NOT NULL DEFAULT 0, -- wall-clock time we last synced this note's
                                             -- content; startup reconciliation compares a
                                             -- file's on-disk mtime against this to decide,
                                             -- from a cheap stat alone, whether a reparse is
                                             -- needed — avoids reading every file on launch
  word_count    INTEGER NOT NULL DEFAULT 0,
  is_deleted    INTEGER NOT NULL DEFAULT 0, -- tombstone; file missing on disk but not yet purged
  needs_attention INTEGER NOT NULL DEFAULT 0 -- frontmatter parse failed; indexed as title/path
                                              -- only (see parseFrontmatter.ts) — surfaced in the
                                              -- note list rather than silently degrading
);
CREATE INDEX IF NOT EXISTS idx_notes_path ON notes(path);
CREATE INDEX IF NOT EXISTS idx_notes_modified ON notes(modified);

CREATE TABLE IF NOT EXISTS tags (
  id    INTEGER PRIMARY KEY AUTOINCREMENT,
  name  TEXT NOT NULL UNIQUE            -- e.g. "research", "thesis/chapter1"
);

CREATE TABLE IF NOT EXISTS note_tags (
  note_id TEXT NOT NULL REFERENCES notes(id) ON DELETE CASCADE,
  tag_id  INTEGER NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
  PRIMARY KEY (note_id, tag_id)
);

-- Directed edges. target_id is NULL when unresolved/broken/ambiguous;
-- target_raw preserves the literal [[text]] captured at extraction time.
CREATE TABLE IF NOT EXISTS links (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  source_id    TEXT NOT NULL REFERENCES notes(id) ON DELETE CASCADE,
  target_id    TEXT REFERENCES notes(id) ON DELETE SET NULL,
  target_raw   TEXT NOT NULL,
  position     INTEGER NOT NULL         -- char offset in source, for "jump to link" UX
);
CREATE INDEX IF NOT EXISTS idx_links_source ON links(source_id);
CREATE INDEX IF NOT EXISTS idx_links_target ON links(target_id);

-- Search-only copy of title/body/tags. Note content itself is never read
-- from here — reads always go to the .md file; this index is rebuildable.
CREATE VIRTUAL TABLE IF NOT EXISTS notes_fts USING fts5(
  id UNINDEXED,
  title,
  body,
  tags,
  tokenize = 'porter unicode61'
);

-- Fallback resolution for [[Old Title]] references after any title change
-- (internal rename or detected external rename), for one indexing cycle.
CREATE TABLE IF NOT EXISTS note_aliases (
  note_id    TEXT NOT NULL REFERENCES notes(id) ON DELETE CASCADE,
  old_title  TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_note_aliases_title ON note_aliases(old_title);

-- Future-proofing only — zero UI cost today, avoids a v2 schema rewrite.
-- properties: generic per-note key/value (e.g. future graph x/y-axis attrs).
CREATE TABLE IF NOT EXISTS properties (
  note_id TEXT NOT NULL REFERENCES notes(id) ON DELETE CASCADE,
  key     TEXT NOT NULL,
  value   TEXT,
  PRIMARY KEY (note_id, key)
);

-- access_log: raw material for a future recency/associative-recall feature.
-- Written on every note-open; read by nothing yet.
CREATE TABLE IF NOT EXISTS access_log (
  id        INTEGER PRIMARY KEY AUTOINCREMENT,
  note_id   TEXT NOT NULL REFERENCES notes(id) ON DELETE CASCADE,
  opened_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_access_log_note ON access_log(note_id, opened_at);

CREATE TABLE IF NOT EXISTS meta (
  key   TEXT PRIMARY KEY,
  value TEXT
);
