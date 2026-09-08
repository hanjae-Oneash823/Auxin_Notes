import { create } from 'zustand';
import { invoke } from '@tauri-apps/api/core';
import { listen, type UnlistenFn } from '@tauri-apps/api/event';
import { reconcileVault } from './reconcile';
import { syncFile, syncRemoved } from './syncEngine';
import { getAppConfig, patchAppConfig } from '../app/appConfig';

interface VaultChangeEvent {
  path: string;
  kind: 'created' | 'modified' | 'removed';
}

type VaultStatus = 'idle' | 'loading' | 'ready' | 'error';

interface VaultState {
  vaultRoot: string | null;
  status: VaultStatus;
  error: string | null;
  /** Bumped after every watcher-driven DB sync (file created/modified/removed
   *  on disk outside the app). Query-driven panels (note list, tags,
   *  backlinks, unresolved links) subscribe to this to know when to refetch —
   *  otherwise an external file change updates the DB but the UI never
   *  learns about it until something else happens to re-render. */
  syncVersion: number;
  openVault: (path: string) => Promise<void>;
  initFromConfig: () => Promise<void>;
}

let unlistenChange: UnlistenFn | null = null;

/**
 * Processes one debounced batch of external file-change events. Every
 * `removed` event is awaited to completion (tombstoning its row) before any
 * `created`/`modified` event runs — a same-batch external rename (old path
 * removed, new path created) needs the old row already tombstoned by the
 * time resolveNoteId's content-hash matching (syncEngine.ts) runs on the new
 * path, or it looks like an unrelated delete-and-create instead of a rename.
 */
async function processChangeBatch(vaultRoot: string, events: VaultChangeEvent[]): Promise<void> {
  const removed = events.filter((event) => event.kind === 'removed');
  const rest = events.filter((event) => event.kind !== 'removed');

  await Promise.all(removed.map((event) => syncRemoved(vaultRoot, event.path)));
  await Promise.all(rest.map((event) => syncFile(vaultRoot, event.path)));
}

export const useVaultStore = create<VaultState>((set, get) => ({
  vaultRoot: null,
  status: 'idle',
  error: null,
  syncVersion: 0,

  initFromConfig: async () => {
    const config = await getAppConfig();
    if (config.last_vault_path) {
      await get().openVault(config.last_vault_path);
    }
  },

  openVault: async (path: string) => {
    set({ status: 'loading', error: null });
    try {
      await invoke('watch_vault', { path });
      // Grants the asset protocol runtime read access to this vault's
      // directory tree — imageWidget.ts uses `convertFileSrc` to stream
      // image files straight to the webview, which needs this scope
      // widened per-vault since the path is chosen at runtime, not known
      // at build time (see allow_vault_asset_access's own doc comment).
      await invoke('allow_vault_asset_access', { path });
      await reconcileVault(path);

      if (unlistenChange) {
        unlistenChange();
        unlistenChange = null;
      }
      unlistenChange = await listen<VaultChangeEvent[]>('vault://changed', (event) => {
        void processChangeBatch(path, event.payload).then(() =>
          set((state) => ({ syncVersion: state.syncVersion + 1 })),
        );
      });

      const config = await getAppConfig();
      const recentVaults = Array.from(new Set([path, ...config.recent_vaults])).slice(0, 10);
      await patchAppConfig({ last_vault_path: path, recent_vaults: recentVaults });

      set({ vaultRoot: path, status: 'ready' });
    } catch (error: unknown) {
      set({ status: 'error', error: error instanceof Error ? error.message : String(error) });
    }
  },
}));
