import { invoke } from '@tauri-apps/api/core';

/** Mirrors the Rust `AppConfig` struct verbatim (snake_case — serde's
 *  default, not the camelCase Tauri applies to command arguments). */
export interface AppConfig {
  last_vault_path: string | null;
  recent_vaults: string[];
  font_family_id: string | null;
  font_size_id: string | null;
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
