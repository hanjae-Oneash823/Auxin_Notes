mod commands;
mod watcher;

use commands::app_config::{get_app_config, set_app_config};
use commands::fs_ops::{
    copy_image_file, delete_note, ensure_dir, read_image_data_url, read_note, rename_note,
    save_image_data, write_note,
};
use commands::vault_scan::list_vault_files;
use tauri::{WebviewUrl, WebviewWindowBuilder};
use watcher::{watch_vault, WatcherState};

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_sql::Builder::default().build())
        .plugin(tauri_plugin_single_instance::init(|_app, _args, _cwd| {}))
        .plugin(tauri_plugin_os::init())
        .manage(WatcherState::default())
        .setup(|app| {
            let win_builder = WebviewWindowBuilder::new(app, "main", WebviewUrl::default())
                .title("auxin")
                .inner_size(800.0, 600.0);

            // macOS: overlay title bar — native traffic lights float over our
            // own drawn header instead of a system title bar row, matching
            // Obsidian's `hiddenInset` look. Other platforms keep the native
            // title bar for now (frameless + custom controls is unverified
            // without a Windows/Linux machine to test on).
            // y centers the traffic lights in TitleBar.tsx's 36px (h-9) bar.
            #[cfg(target_os = "macos")]
            let win_builder = win_builder
                .title_bar_style(tauri::TitleBarStyle::Overlay)
                .hidden_title(true)
                .traffic_light_position(tauri::LogicalPosition::new(12.0, 16.0));

            win_builder.build()?;
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            read_note,
            write_note,
            rename_note,
            delete_note,
            ensure_dir,
            read_image_data_url,
            save_image_data,
            copy_image_file,
            list_vault_files,
            watch_vault,
            get_app_config,
            set_app_config,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
