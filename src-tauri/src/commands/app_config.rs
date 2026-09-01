use serde::{Deserialize, Serialize};
use std::fs;
use std::io::Write;
use tauri::{AppHandle, Manager};

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
    pub font_size_id: Option<String>,
    #[serde(default)]
    pub sidebar_width_left: Option<f64>,
    #[serde(default)]
    pub sidebar_width_right: Option<f64>,
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
