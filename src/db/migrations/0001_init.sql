-- Auxin index schema. This database is a pure derived cache of the vault's
-- markdown files — no code path should ever write here except "I just parsed
-- this file's current on-disk content." A full rebuild (drop + re-walk the
-- vault) must always converge to correct state.

CREATE TABLE IF NOT EXISTS notes (
  id            TEXT PRIMARY KEY,       -- ULID, minted and owned by the app — never stored in
                                         -- the file; identity survives a rename via
                                         -- resolveNoteId's content-hash match (syncEngine.ts)
  path          TEXT NOT NULL UNIQUE,   -- vault-relative path, current on-disk location
  title         TEXT NOT NULL,          -- derived from filename (sans .md)
  created       TEXT NOT NULL,          -- ISO8601, database-owned; set once, preserved across
                                         -- edits and renames
  modified      TEXT NOT NULL,          -- ISO8601, database-owned; bumped on every sync
  content_hash  TEXT NOT NULL,          -- hash of the note body, for change detection and
                                         -- resolveNoteId's rename-matching
  synced_at_ms  INTEGER NOT NULL DEFAULT 0, -- wall-clock time we last synced this note's
                                             -- content; startup reconciliation compares a
                                             -- file's on-disk mtime against this to decide,
                                             -- from a cheap stat alone, whether a reparse is
                                             -- needed — avoids reading every file on launch
  word_count    INTEGER NOT NULL DEFAULT 0,
  is_deleted    INTEGER NOT NULL DEFAULT 0, -- tombstone; file missing on disk but not yet purged
  needs_attention INTEGER NOT NULL DEFAULT 0, -- unused: a note body can't fail to parse now that
                                              -- there's no frontmatter block. Column kept rather
                                              -- than dropped (this schema's migrations are
                                              -- additive-only — see ensureColumn in db/client.ts)
  is_hub        INTEGER NOT NULL DEFAULT 0, -- body contains a parseable ```hub fenced config
                                             -- block (see vault/parseHubBlock.ts); computed in
                                             -- syncEngine.ts's parseNote, never written directly
  hub_folder    TEXT,                       -- resolved scope folder for a hub note (NULL for a
                                             -- non-hub note); lets getHubGraphEdges (hub.ts)
                                             -- draw the hub's member edges without re-parsing
                                             -- every hub note's body on every graph load
  hub_recursive INTEGER NOT NULL DEFAULT 1  -- resolved 'recursive' config for a hub note;
                                             -- meaningless (default) for a non-hub note
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
