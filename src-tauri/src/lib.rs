mod commands;
mod watcher;

use commands::app_config::{get_app_config, set_app_config};
use commands::fs_ops::{
    delete_note, ensure_dir, read_image_data_url, read_note, rename_note, write_note,
};
use commands::vault_scan::list_vault_files;
use watcher::{watch_vault, WatcherState};

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_sql::Builder::default().build())
        .plugin(tauri_plugin_single_instance::init(|_app, _args, _cwd| {}))
        .manage(WatcherState::default())
        .invoke_handler(tauri::generate_handler![
            read_note,
            write_note,
            rename_note,
            delete_note,
            ensure_dir,
            read_image_data_url,
            list_vault_files,
            watch_vault,
            get_app_config,
            set_app_config,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
