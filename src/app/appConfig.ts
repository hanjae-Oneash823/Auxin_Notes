import { invoke } from '@tauri-apps/api/core';

/** Mirrors the Rust `TabSession`: one vault's open tabs (absolute paths, in
 *  order, Home excluded) and which one was focused. Read only as the legacy
 *  source for a vault's first workspace — workspaces now live in the vault's
 *  database (db/queries/workspaces.ts). */
export interface TabSession {
  tabs: string[];
  active: string | null;
}

/** Mirrors the Rust `AppConfig` struct verbatim (snake_case — serde's
 *  default, not the camelCase Tauri applies to command arguments). */
export interface AppConfig {
  last_vault_path: string | null;
  recent_vaults: string[];
  font_family_id: string | null;
  font_size_px: number | null;
  sidebar_width_left: number | null;
  sidebar_width_right: number | null;
  theme_id: string | null;
  left_sidebar_hidden: boolean | null;
  right_sidebar_hidden: boolean | null;
  right_panel_layer: string | null;
  /** Keyed by vault path. */
  tab_sessions: Record<string, TabSession>;
  /** Shown in the Home dashboard's "welcome" greeting. `null` means unset. */
  user_name: string | null;
}

export async function getAppConfig(): Promise<AppConfig> {
  return invoke<AppConfig>('get_app_config');
}

/**
 * Reads the current config and merges `patch` in before writing, so a
 * caller that only knows about one or two fields can never silently drop
 * the rest. Every writer of app config should go through this rather than
 * constructing a config object from scratch.
 */
export async function patchAppConfig(patch: Partial<AppConfig>): Promise<AppConfig> {
  const current = await getAppConfig();
  const next = { ...current, ...patch };
  await invoke('set_app_config', { config: next });
  return next;
}
