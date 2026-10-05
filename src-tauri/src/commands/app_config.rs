use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::fs;
use std::io::Write;
use tauri::{AppHandle, Manager};

/// The tabs open in one vault (the pre-workspaces session). No longer
/// written — workspaces live in the vault's database — but still read to
/// migrate a vault's old tabs into its default workspace.
/// Paths are absolute, in tab order (the pinned Home tab is not stored).
#[derive(Serialize, Deserialize, Clone, Default)]
pub struct TabSession {
    pub tabs: Vec<String>,
    pub active: Option<String>,
}

/// Lives outside the vault (in the OS app-config dir), not inside it — a vault
/// can be moved, re-opened from a different config, or not exist yet at all.
#[derive(Serialize, Deserialize, Clone, Default)]
pub struct AppConfig {
    pub last_vault_path: Option<String>,
    pub recent_vaults: Vec<String>,
    /// `#[serde(default)]` so a config.json written before this field
    /// existed still deserializes instead of failing outright — same
    /// lesson as the `needs_attention` schema column: additive fields must
    /// tolerate old persisted data.
    #[serde(default)]
    pub font_family_id: Option<String>,
    #[serde(default)]
    pub font_size_px: Option<f64>,
    #[serde(default)]
    pub sidebar_width_left: Option<f64>,
    #[serde(default)]
    pub sidebar_width_right: Option<f64>,
    /// `"dark"` (the app's default) or `"light"`. `None`/absent means dark,
    /// same as every config.json written before this field existed.
    #[serde(default)]
    pub theme_id: Option<String>,
    /// Panel layout, restored on launch. `None`/absent means shown (both
    /// sidebars) and the Files layer (right panel).
    #[serde(default)]
    pub left_sidebar_hidden: Option<bool>,
    #[serde(default)]
    pub right_sidebar_hidden: Option<bool>,
    #[serde(default)]
    pub right_panel_layer: Option<String>,
    /// Open tabs per vault, keyed by vault path.
    #[serde(default)]
    pub tab_sessions: HashMap<String, TabSession>,
    /// Shown in the Home dashboard's "welcome" greeting (HomeDashboard.tsx).
    /// `None`/absent means no name set yet — the greeting hides itself.
    #[serde(default)]
    pub user_name: Option<String>,
    /// How much time the top clock strip shows: `"24h"` (the default), `"12h"`,
    /// `"4h"` or `"2h"`. `None`/absent means 24h (ClockStrip.tsx).
    #[serde(default)]
    pub clock_range: Option<String>,
}

fn config_path(app: &AppHandle) -> Result<std::path::PathBuf, String> {
    let dir = app.path().app_config_dir().map_err(|e| e.to_string())?;
    fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    Ok(dir.join("config.json"))
}

#[tauri::command]
pub fn get_app_config(app: AppHandle) -> Result<AppConfig, String> {
    let path = config_path(&app)?;
    if !path.exists() {
        return Ok(AppConfig::default());
    }
    let raw = fs::read_to_string(&path).map_err(|e| e.to_string())?;
    serde_json::from_str(&raw).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn set_app_config(app: AppHandle, config: AppConfig) -> Result<(), String> {
    let path = config_path(&app)?;
    let tmp_path = path.with_extension("json.tmp");
    let serialized = serde_json::to_string_pretty(&config).map_err(|e| e.to_string())?;

    let mut file = fs::File::create(&tmp_path).map_err(|e| e.to_string())?;
    file.write_all(serialized.as_bytes()).map_err(|e| e.to_string())?;
    file.sync_all().map_err(|e| e.to_string())?;
    drop(file);

    fs::rename(&tmp_path, &path).map_err(|e| e.to_string())
}
