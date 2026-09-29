//! Owns the lifecycle of the always-on-top popup windows ("filesearcher" and
//! "capture") — and, on macOS, converts each into a native `NSPanel` with the
//! `NonactivatingPanel` style mask, so it can become key window (receive
//! keystrokes) without making the whole app "active".
//!
//! Without the panel conversion, a popup had to activate the app just to
//! receive input, so every time it hid (Escape, or losing focus), macOS
//! auto-promoted "main" to key window and raised it above whatever app was
//! frontmost before — see FileSearcherOverlay.tsx's escape-handler history
//! for the two things that were tried and reverted before this.
//!
//! `show_popup_panel`/`hide_popup_panel` below replace the frontend's plain
//! `getCurrentWindow().show()/setFocus()/hide()` calls for these windows,
//! because Tauri's generic focus API can't be trusted not to activate the
//! app on its way to focusing the window.
//!
//! On macOS each panel is built once, at startup, and afterwards only ever
//! ordered in and out. Building a webview makes wry activate the whole app,
//! which would pull focus from whatever app is frontmost and race the panel
//! for key status on every open. An earlier version closed and rebuilt the
//! panel on each hide to clear a ghost of the previous session; that ghost
//! came from React (AnimatePresence exit layers, see FileSearcherOverlay.tsx),
//! not from a stale WebKit frame.

use tauri::AppHandle;
#[cfg(not(target_os = "macos"))]
use tauri::{Manager, WebviewUrl, WebviewWindowBuilder};

/// Everything that differs between one popup and another. The frontend names
/// a popup by `label` when it calls the show/hide commands.
pub struct PopupSpec {
    pub label: &'static str,
    pub url: &'static str,
    pub title: &'static str,
    pub width: f64,
    pub height: f64,
}

/// Wide enough that long note titles get room beside the centered icon
/// column (their chip can use up to half the width, minus padding).
const FILE_SEARCHER: PopupSpec = PopupSpec {
    label: "filesearcher",
    url: "filesearcher.html",
    title: "Auxin File Searcher",
    width: 960.0,
    height: 520.0,
};

const CAPTURE: PopupSpec = PopupSpec {
    label: "capture",
    url: "capture.html",
    title: "Auxin Capture",
    width: 640.0,
    height: 340.0,
};

const POPUPS: [&PopupSpec; 2] = [&FILE_SEARCHER, &CAPTURE];

fn spec_for(label: &str) -> Result<&'static PopupSpec, String> {
    POPUPS
        .into_iter()
        .find(|spec| spec.label == label)
        .ok_or_else(|| format!("unknown popup: {label}"))
}

#[cfg(target_os = "macos")]
mod macos {
    use super::PopupSpec;
    use tauri::{AppHandle, Manager, WebviewUrl};
    use tauri_nspanel::{tauri_panel, ManagerExt, PanelBuilder, StyleMask};

    tauri_panel!(PopupPanel {
        config: {
            can_become_key_window: true,
            can_become_main_window: false,
        }
    });

    fn not_found(spec: &PopupSpec) -> String {
        format!("{} panel not found", spec.label)
    }

    /// Builds the popup's window hidden and converts it into a non-activating
    /// panel. Runs during app launch, where wry activating the app for the
    /// new webview is harmless.
    /// Not `PanelBuilder::no_activate` — its `Prohibited` policy flip made "main" vanish.
    pub fn setup(app: &AppHandle, spec: &'static PopupSpec) -> tauri::Result<()> {
        PanelBuilder::<_, PopupPanel>::new(app, spec.label)
            .url(WebviewUrl::App(spec.url.into()))
            .title(spec.title)
            .style_mask(StyleMask::empty().nonactivating_panel())
            .with_window(|window| {
                window
                    .inner_size(spec.width, spec.height)
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

    pub fn show(app: &AppHandle, spec: &PopupSpec) -> Result<(), String> {
        let panel = app
            .get_webview_panel(spec.label)
            .map_err(|_| not_found(spec))?;

        // Not `show_and_make_key`: that makes the panel's content view first
        // responder, which is wry's parent view rather than the webview, so
        // keystrokes wouldn't reach the page until it was clicked.
        panel.order_front_regardless();
        panel.make_key_window();

        let window = app
            .get_webview_window(spec.label)
            .ok_or_else(|| format!("{} window not found", spec.label))?;
        let webview: &tauri::Webview = window.as_ref();
        // Only `makeFirstResponder:` on the WKWebView (wry's `focus`) —
        // unlike `WebviewWindow::set_focus`, it doesn't activate the app.
        webview.set_focus().map_err(|e| e.to_string())
    }

    /// Orders the panel out, keeping its webview alive for the next `show`.
    /// A no-op when already hidden. The frontend calls this only once its
    /// outro animation finishes (see FileSearcherOverlay.tsx).
    pub fn hide(app: &AppHandle, spec: &PopupSpec) -> Result<(), String> {
        app.get_webview_panel(spec.label)
            .map(|panel| panel.hide())
            .map_err(|_| not_found(spec))
    }
}

fn setup_popup(app: &AppHandle, spec: &'static PopupSpec) -> tauri::Result<()> {
    #[cfg(target_os = "macos")]
    {
        macos::setup(app, spec)
    }
    #[cfg(not(target_os = "macos"))]
    {
        WebviewWindowBuilder::new(app, spec.label, WebviewUrl::App(spec.url.into()))
            .title(spec.title)
            .inner_size(spec.width, spec.height)
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

/// Called once from `setup()`, builds every popup hidden. On macOS each is
/// converted to a panel (see the `macos` module); on other platforms they're
/// plain windows.
pub fn setup(app: &AppHandle) -> tauri::Result<()> {
    for spec in POPUPS {
        setup_popup(app, spec)?;
    }
    Ok(())
}

#[tauri::command]
pub fn show_popup_panel(app: AppHandle, label: String) -> Result<(), String> {
    let spec = spec_for(&label)?;
    #[cfg(target_os = "macos")]
    {
        macos::show(&app, spec)
    }
    #[cfg(not(target_os = "macos"))]
    {
        let window = app
            .get_webview_window(spec.label)
            .ok_or_else(|| format!("{} window not found", spec.label))?;
        window.center().map_err(|e| e.to_string())?;
        window.show().map_err(|e| e.to_string())?;
        window.set_focus().map_err(|e| e.to_string())
    }
}

#[tauri::command]
pub fn hide_popup_panel(app: AppHandle, label: String) -> Result<(), String> {
    let spec = spec_for(&label)?;
    #[cfg(target_os = "macos")]
    {
        macos::hide(&app, spec)
    }
    #[cfg(not(target_os = "macos"))]
    {
        app.get_webview_window(spec.label)
            .ok_or_else(|| format!("{} window not found", spec.label))?
            .hide()
            .map_err(|e| e.to_string())
    }
}
