mod commands;
mod vault_files;
mod watcher;

use commands::app_config::{get_app_config, set_app_config};
use commands::popup_panel::{hide_popup_panel, show_popup_panel};
use commands::fs_ops::{
    allow_vault_asset_access, copy_image_file, delete_folder, delete_note, ensure_dir, existing_paths, import_file,
    move_folder, read_note, rename_note, save_image_data, write_note,
};
use commands::terminal::{terminal_kill, terminal_resize, terminal_spawn, terminal_status, terminal_stop, terminal_write, TerminalState};
use commands::vault_scan::{list_vault_files, list_vault_folders};
use tauri::{Manager, WebviewUrl, WebviewWindowBuilder, WindowEvent};
use watcher::{watch_vault, WatcherState};

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let builder = tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_sql::Builder::default().build())
        .plugin(tauri_plugin_single_instance::init(|_app, _args, _cwd| {}))
        .plugin(tauri_plugin_os::init())
        .plugin(tauri_plugin_global_shortcut::Builder::new().build())
        .manage(WatcherState::default())
        .manage(TerminalState::default());

    // Registers `tauri_nspanel`'s own managed state (a panel registry keyed
    // by window label) — required before `commands::popup_panel`'s
    // `to_panel()`/`get_webview_panel()` calls below can use it.
    #[cfg(target_os = "macos")]
    let builder = builder.plugin(tauri_nspanel::init());

    builder
        .setup(|app| {
            let win_builder = WebviewWindowBuilder::new(app, "main", WebviewUrl::default())
                .title("Auxin")
                .inner_size(1280.0, 832.0);

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

            let window = win_builder.build()?;

            // A shell left running after the window closes would otherwise
            // linger as an orphaned background process.
            let app_handle = app.handle().clone();
            window.on_window_event(move |event| {
                if let WindowEvent::CloseRequested { .. } = event {
                    let _ = terminal_kill(app_handle.state::<TerminalState>());
                }
            });

            // Always-on-top popups — the file searcher and the sticky-notes
            // quick-capture — each its own window (not an overlay inside
            // "main") so it floats above every other app, Raycast-style.
            // Shown/focused/hidden by the global shortcut handlers
            // (src/fileSearcher/useGlobalFileSearcherShortcut.ts,
            // src/sticky/useGlobalCaptureShortcut.ts) and each popup's own
            // blur/Escape handling. Built by `popup_panel::setup` rather than
            // inline here — see that module for why (converts them to native
            // macOS panels, built once here and only shown/hidden afterwards).
            //
            // Deferred to the event loop's next turn instead of built inline:
            // converting them to panels while `setup` was still running left
            // every webview (main's included) with no page loaded on a cold
            // start — a plain white/empty window.
            let panel_app = app.handle().clone();
            app.handle().run_on_main_thread(move || {
                if let Err(error) = commands::popup_panel::setup(&panel_app) {
                    eprintln!("failed to build the popup panels: {error}");
                }
            })?;

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            read_note,
            write_note,
            rename_note,
            delete_note,
            delete_folder,
            ensure_dir,
            existing_paths,
            move_folder,
            allow_vault_asset_access,
            save_image_data,
            copy_image_file,
            import_file,
            list_vault_files,
            list_vault_folders,
            watch_vault,
            get_app_config,
            set_app_config,
            show_popup_panel,
            hide_popup_panel,
            terminal_spawn,
            terminal_write,
            terminal_resize,
            terminal_kill,
            terminal_status,
            terminal_stop,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
