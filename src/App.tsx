import { useEffect, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { Editor } from './editor/Editor';
import { VaultPicker } from './app/firstRun/VaultPicker';
import { getDb } from './db/client';
import { listNotes, type NoteSummary } from './db/queries/notes';
import { getUnresolvedLinkGroups } from './db/queries/links';
import { syncFile, toRelativePath } from './vault/syncEngine';
import { renameNote } from './vault/renameEngine';
import { useVaultStore } from './vault/vaultStore';
import { useSettingsStore } from './app/settings/settingsStore';
import { AppShell } from './layout/AppShell';
import { Sidebar } from './layout/Sidebar';
import { StatusBar } from './layout/StatusBar';
import { NoteList } from './notes/NoteList';
import { TagBrowser } from './notes/TagBrowser';
import { BacklinksPanel } from './notes/BacklinksPanel';
import { UnresolvedLinksPanel } from './notes/UnresolvedLinksPanel';
import { SearchPanel } from './search/SearchPanel';

async function fetchNotes(vaultRoot: string, tag: string | null): Promise<NoteSummary[]> {
  const db = await getDb(vaultRoot);
  return listNotes(db, tag ? { tag } : {});
}

async function fetchUnresolvedCount(vaultRoot: string): Promise<number> {
  const db = await getDb(vaultRoot);
  return (await getUnresolvedLinkGroups(db)).length;
}

function VaultReady({ vaultRoot }: { vaultRoot: string }) {
  // allNotes is unfiltered — needed so the active note can still be found
  // by id (for BacklinksPanel) even when a tag filter hides it from the
  // displayed `notes` list.
  const [allNotes, setAllNotes] = useState<NoteSummary[] | null>(null);
  const [notes, setNotes] = useState<NoteSummary[] | null>(null);
  const [unresolvedCount, setUnresolvedCount] = useState(0);
  const [selectedTag, setSelectedTag] = useState<string | null>(null);
  const [activePath, setActivePath] = useState<string | null>(null);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const [renameStatus, setRenameStatus] = useState<{ message: string; isError: boolean } | null>(null);
  // Resets to writing mode on every app launch — not persisted, deliberately.
  const [isReadingMode, setIsReadingMode] = useState(false);

  async function refreshNotes() {
    const [all, unresolved] = await Promise.all([
      fetchNotes(vaultRoot, null),
      fetchUnresolvedCount(vaultRoot),
    ]);
    setAllNotes(all);
    setNotes(selectedTag ? await fetchNotes(vaultRoot, selectedTag) : all);
    setUnresolvedCount(unresolved);
  }

  const syncVersion = useVaultStore((state) => state.syncVersion);

  useEffect(() => {
    void refreshNotes();
  }, [vaultRoot, selectedTag, syncVersion]);

  function openRelativePath(relativePath: string) {
    setActivePath(`${vaultRoot}/${relativePath}`);
  }

  async function createNote() {
    const title = `Untitled ${Date.now()}`;
    const absolutePath = `${vaultRoot}/${title}.md`;
    await invoke('write_note', { path: absolutePath, content: '' });
    await syncFile(vaultRoot, absolutePath);
    await refreshNotes();
    setActivePath(absolutePath);
  }

  function startRename(note: NoteSummary) {
    setRenamingId(note.id);
    setRenameValue(note.title);
    setRenameStatus(null);
  }

  async function commitRename(note: NoteSummary) {
    const title = renameValue.trim();
    setRenamingId(null);
    if (!title || title === note.title) return;

    try {
      const result = await renameNote(vaultRoot, note.id, title);
      const message =
        result.totalImpacted === 0
          ? `renamed "${note.title}" → "${title}"`
          : `renamed — ${result.updatedCount}/${result.totalImpacted} referencing files updated${
              result.failures.length > 0
                ? `; failed: ${result.failures.map((f) => f.path).join(', ')}`
                : ''
            }`;
      setRenameStatus({ message, isError: result.failures.length > 0 });
      if (activePath === `${vaultRoot}/${note.path}`) {
        setActivePath(`${vaultRoot}/${result.newPath}`);
      }
      await refreshNotes();
    } catch (error: unknown) {
      setRenameStatus({ message: error instanceof Error ? error.message : String(error), isError: true });
    }
  }

  const activeRelativePath = activePath ? toRelativePath(vaultRoot, activePath) : null;
  const activeNote = allNotes?.find((note) => note.path === activeRelativePath) ?? null;

  return (
    <AppShell
      sidebar={
        <Sidebar side="left">
          <span className="text-fg-faint tracking-label uppercase" style={{ fontSize: '0.68rem' }}>
            [vault]
          </span>
          <button
            type="button"
            onClick={() => void createNote()}
            className="border border-border px-2 py-1 text-left text-fg-prominent tracking-menu uppercase transition-colors duration-panel ease-panel hover:border-border-strong"
            style={{ fontSize: '0.72rem' }}
          >
            + new note
          </button>
          <SearchPanel vaultRoot={vaultRoot} onSelect={openRelativePath} />
          <TagBrowser vaultRoot={vaultRoot} selectedTag={selectedTag} onSelectTag={setSelectedTag} />
          <NoteList
            notes={notes ?? []}
            activePath={activeRelativePath}
            renamingId={renamingId}
            renameValue={renameValue}
            onSelect={openRelativePath}
            onStartRename={startRename}
            onRenameChange={setRenameValue}
            onRenameCommit={commitRename}
            onRenameCancel={() => setRenamingId(null)}
          />
          {renameStatus && (
            <span
              className={renameStatus.isError ? 'text-accent-link-broken' : 'text-fg-faint'}
              style={{ fontSize: '0.68rem' }}
            >
              [{renameStatus.message}]
            </span>
          )}
        </Sidebar>
      }
      inspector={
        <Sidebar side="right">
          <BacklinksPanel vaultRoot={vaultRoot} noteId={activeNote?.id ?? null} onSelect={openRelativePath} />
          <UnresolvedLinksPanel vaultRoot={vaultRoot} onSelect={openRelativePath} onChanged={refreshNotes} />
        </Sidebar>
      }
      statusBar={
        <StatusBar
          vaultRoot={vaultRoot}
          noteCount={allNotes?.length ?? 0}
          unresolvedCount={unresolvedCount}
          isReadingMode={isReadingMode}
          onToggleReadingMode={() => setIsReadingMode((mode) => !mode)}
        />
      }
    >
      {activePath ? (
        <Editor
          key={activePath}
          path={activePath}
          vaultRoot={vaultRoot}
          onNavigate={openRelativePath}
          readOnly={isReadingMode}
        />
      ) : (
        <div className="flex h-full items-center justify-center text-fg-faint">select or create a note</div>
      )}
    </AppShell>
  );
}

function App() {
  const { vaultRoot, status, initFromConfig } = useVaultStore();
  const initSettings = useSettingsStore((state) => state.initFromConfig);

  useEffect(() => {
    void initFromConfig();
    void initSettings();
  }, [initFromConfig, initSettings]);

  if (status === 'loading' && !vaultRoot) {
    return (
      <main className="flex h-full flex-col items-center justify-center">
        <span className="text-fg-muted tracking-menu uppercase" style={{ fontSize: '0.78rem' }}>
          loading…
        </span>
      </main>
    );
  }

  if (!vaultRoot) {
    return <VaultPicker />;
  }

  return <VaultReady vaultRoot={vaultRoot} />;
}

export default App;
