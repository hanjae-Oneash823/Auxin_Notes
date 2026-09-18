//! Owns the "filesearcher" window's lifecycle, and — on macOS — converts it
//! into a native `NSPanel` with the `NonactivatingPanel` style mask, so it
//! can become key window (receive keystrokes) without making the whole app
//! "active".
//!
//! Without the panel conversion, the popup had to activate the app just to
//! receive input, so every time it hid (Escape, or losing focus), macOS
//! auto-promoted "main" to key window and raised it above whatever app was
//! frontmost before — see FileSearcherOverlay.tsx's escape-handler history
//! for the two things that were tried and reverted before this.
//!
//! `show_file_searcher_panel`/`hide_file_searcher_panel` below replace the
//! frontend's plain `getCurrentWindow().show()/setFocus()/hide()` calls for
//! this window specifically, because Tauri's generic focus API can't be
//! trusted not to activate the app on its way to focusing the window.
//!
//! On macOS the panel is built once, at startup, and afterwards only ever
//! ordered in and out. Building a webview makes wry activate the whole app,
//! which would pull focus from whatever app is frontmost and race the panel
//! for key status on every open. An earlier version closed and rebuilt the
//! panel on each hide to clear a ghost of the previous session; that ghost
//! came from React (AnimatePresence exit layers, see FileSearcherOverlay.tsx),
//! not from a stale WebKit frame.

use tauri::AppHandle;
#[cfg(not(target_os = "macos"))]
use tauri::{Manager, WebviewUrl, WebviewWindowBuilder};

pub const FILE_SEARCHER_LABEL: &str = "filesearcher";
/// Wide enough that long note titles get room beside the centered icon
/// column (their chip can use up to half the width, minus padding).
const PANEL_WIDTH: f64 = 960.0;
const PANEL_HEIGHT: f64 = 520.0;

#[cfg(target_os = "macos")]
mod macos {
    use super::{FILE_SEARCHER_LABEL, PANEL_HEIGHT, PANEL_WIDTH};
    use tauri::{AppHandle, Manager, WebviewUrl};
    use tauri_nspanel::{tauri_panel, ManagerExt, PanelBuilder, StyleMask};

    const PANEL_NOT_FOUND: &str = "filesearcher panel not found";

    tauri_panel!(FileSearcherPanel {
        config: {
            can_become_key_window: true,
            can_become_main_window: false,
        }
    });

    /// Builds the "filesearcher" window hidden and converts it into a
    /// non-activating panel. Runs during app launch, where wry activating
    /// the app for the new webview is harmless.
    /// Not `PanelBuilder::no_activate` — its `Prohibited` policy flip made "main" vanish.
    pub fn setup(app: &AppHandle) -> tauri::Result<()> {
        PanelBuilder::<_, FileSearcherPanel>::new(app, FILE_SEARCHER_LABEL)
            .url(WebviewUrl::App("filesearcher.html".into()))
            .title("Auxin File Searcher")
            .style_mask(StyleMask::empty().nonactivating_panel())
            .with_window(|window| {
                window
                    .inner_size(PANEL_WIDTH, PANEL_HEIGHT)
                    .decorations(false)
                    .transparent(true)
                    // macOS derives a transparent window's shadow (and its
                    // dark-mode edge highlight) from the content's alpha, but
                    // doesn't recompute it when the content changes — it left
                    // faint outlines of earlier items behind the list.
                    .shadow(false)
                    .always_on_top(true)
                    .resizable(false)
                    .skip_taskbar(true)
                    .visible(false)
                    .center()
            })
            .build()?;
        Ok(())
    }

    pub fn show(app: &AppHandle) -> Result<(), String> {
        let panel = app
            .get_webview_panel(FILE_SEARCHER_LABEL)
            .map_err(|_| PANEL_NOT_FOUND.to_string())?;

        // Not `show_and_make_key`: that makes the panel's content view first
        // responder, which is wry's parent view rather than the webview, so
        // keystrokes wouldn't reach the page until it was clicked.
        panel.order_front_regardless();
        panel.make_key_window();

        let window = app
            .get_webview_window(FILE_SEARCHER_LABEL)
            .ok_or_else(|| "filesearcher window not found".to_string())?;
        let webview: &tauri::Webview = window.as_ref();
        // Only `makeFirstResponder:` on the WKWebView (wry's `focus`) —
        // unlike `WebviewWindow::set_focus`, it doesn't activate the app.
        webview.set_focus().map_err(|e| e.to_string())
    }

    /// Orders the panel out, keeping its webview alive for the next `show`.
    /// A no-op when already hidden. The frontend calls this only once its
    /// outro animation finishes (see FileSearcherOverlay.tsx).
    pub fn hide(app: &AppHandle) -> Result<(), String> {
        app.get_webview_panel(FILE_SEARCHER_LABEL)
            .map(|panel| panel.hide())
            .map_err(|_| PANEL_NOT_FOUND.to_string())
    }
}

/// Called once from `setup()`. On macOS, builds the window and converts it
/// to a panel (see the `macos` module); on other platforms it's a plain
/// window, built the same way "capture" is in `lib.rs`.
pub fn setup(app: &AppHandle) -> tauri::Result<()> {
    #[cfg(target_os = "macos")]
    {
        macos::setup(app)
    }
    #[cfg(not(target_os = "macos"))]
    {
        WebviewWindowBuilder::new(app, FILE_SEARCHER_LABEL, WebviewUrl::App("filesearcher.html".into()))
            .title("Auxin File Searcher")
            .inner_size(PANEL_WIDTH, PANEL_HEIGHT)
            .decorations(false)
            .transparent(true)
            .shadow(false)
            .always_on_top(true)
            .resizable(false)
            .skip_taskbar(true)
            .visible(false)
            .center()
            .build()?;
        Ok(())
    }
}

#[tauri::command]
pub fn show_file_searcher_panel(app: AppHandle) -> Result<(), String> {
    #[cfg(target_os = "macos")]
    {
        macos::show(&app)
    }
    #[cfg(not(target_os = "macos"))]
    {
        let window = app
            .get_webview_window(FILE_SEARCHER_LABEL)
            .ok_or_else(|| "filesearcher window not found".to_string())?;
        window.center().map_err(|e| e.to_string())?;
        window.set_focus().map_err(|e| e.to_string())
    }
}

#[tauri::command]
pub fn hide_file_searcher_panel(app: AppHandle) -> Result<(), String> {
    #[cfg(target_os = "macos")]
    {
        macos::hide(&app)
    }
    #[cfg(not(target_os = "macos"))]
    {
        app.get_webview_window(FILE_SEARCHER_LABEL)
            .ok_or_else(|| "filesearcher window not found".to_string())?
            .hide()
            .map_err(|e| e.to_string())
    }
}
