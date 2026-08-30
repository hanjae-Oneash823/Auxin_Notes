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
      await reconcileVault(path);

      if (unlistenChange) {
        unlistenChange();
        unlistenChange = null;
      }
      unlistenChange = await listen<VaultChangeEvent>('vault://changed', (event) => {
        const { path: changedPath, kind } = event.payload;
        const sync = kind === 'removed' ? syncRemoved(path, changedPath) : syncFile(path, changedPath);
        void sync.then(() => set((state) => ({ syncVersion: state.syncVersion + 1 })));
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
