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
    use std::sync::atomic::{AtomicU64, Ordering};
    use std::time::Duration;
    use tauri::window::{Effect, EffectState, EffectsBuilder};
    use tauri::{AppHandle, Manager, WebviewUrl};
    use tauri_nspanel::{tauri_panel, ManagerExt, PanelBuilder, StyleMask};

    tauri_panel!(PopupPanel {
        config: {
            can_become_key_window: true,
            can_become_main_window: false,
        }
    });

    // Never key: the backdrop must not take focus from the popup above it.
    // Its own module because `tauri_panel!` emits module-level imports, which
    // collide when invoked twice side by side.
    mod backdrop_panel {
        #[allow(unused_imports)]
        use tauri::Manager;
        use tauri_nspanel::tauri_panel;

        tauri_panel!(BackdropPanel {
            config: {
                can_become_key_window: false,
                can_become_main_window: false,
            }
        });
    }
    use backdrop_panel::BackdropPanel;

    /// Full-screen frosted layer shown behind the file searcher. A window
    /// can only blur what is *behind it on screen* (other apps included) by
    /// being a translucent NSVisualEffectView, so it is its own panel.
    const BACKDROP_LABEL: &str = "filesearcher-backdrop";

    fn not_found(spec: &PopupSpec) -> String {
        format!("{} panel not found", spec.label)
    }

    /// Built hidden at launch, like the popups. Click-through, so a click
    /// outside the searcher reaches the app underneath and the searcher's
    /// own lost-focus handling dismisses it as before.
    #[allow(deprecated)] // `UltraDark`: no semantic material is as dark
    pub fn setup_backdrop(app: &AppHandle) -> tauri::Result<()> {
        PanelBuilder::<_, BackdropPanel>::new(app, BACKDROP_LABEL)
            .url(WebviewUrl::External(
                tauri::Url::parse("about:blank").expect("about:blank is a valid URL"),
            ))
            .style_mask(StyleMask::empty().nonactivating_panel())
            .with_window(|window| {
                window
                    .decorations(false)
                    .transparent(true)
                    .shadow(false)
                    .always_on_top(true)
                    .resizable(false)
                    .skip_taskbar(true)
                    .visible(false)
            })
            .build()?;
        if let Some(window) = app.get_webview_window(BACKDROP_LABEL) {
            window.set_ignore_cursor_events(true)?;
            // `Active`: the panel is never key, and vibrancy that follows the
            // window's active state renders as flat grey instead of a blur.
            window.set_effects(
                EffectsBuilder::new()
                    // The darkest material — darkness comes from the material,
                    // since a page background over the effect view killed the blur.
                    .effect(Effect::UltraDark)
                    .state(EffectState::Active)
                    .build(),
            )?;
        }
        Ok(())
    }

    /// Covers the monitor the searcher is on. Ordered in *before* the
    /// searcher: same window level, so the later one sits on top.
    fn show_backdrop(app: &AppHandle, spec: &PopupSpec) -> Result<(), String> {
        let backdrop = app
            .get_webview_window(BACKDROP_LABEL)
            .ok_or("backdrop window not found")?;
        let monitor = app
            .get_webview_window(spec.label)
            .and_then(|window| window.current_monitor().ok().flatten());
        if let Some(monitor) = monitor {
            backdrop.set_position(*monitor.position()).map_err(|e| e.to_string())?;
            backdrop.set_size(*monitor.size()).map_err(|e| e.to_string())?;
        }
        let panel = app
            .get_webview_panel(BACKDROP_LABEL)
            .map_err(|_| "backdrop panel not found".to_string())?;
        panel.set_alpha_value(0.0);
        panel.order_front_regardless();
        fade_backdrop(app, 0.0, BACKDROP_ALPHA, BACKDROP_FADE_IN_MS, false);
        Ok(())
    }

    /// The material's blur radius is fixed by macOS, so the strength is the
    /// whole window's opacity — lower is subtler.
    const BACKDROP_ALPHA: f64 = 0.95;
    const BACKDROP_FADE_IN_MS: u64 = 200;
    const BACKDROP_FADE_OUT_MS: u64 = 140;
    const BACKDROP_FADE_STEPS: u64 = 14;
    /// Bumped by every fade, so a newer one (say, reopening mid-fade-out)
    /// makes an older one stop stepping instead of fighting it.
    static BACKDROP_FADE_ID: AtomicU64 = AtomicU64::new(0);

    /// Ramps the backdrop's opacity with an ease-out curve, then optionally
    /// orders it out. AppKit calls are hopped onto the main thread per step.
    fn fade_backdrop(app: &AppHandle, from: f64, to: f64, duration_ms: u64, hide_when_done: bool) {
        let fade_id = BACKDROP_FADE_ID.fetch_add(1, Ordering::SeqCst) + 1;
        let app = app.clone();
        std::thread::spawn(move || {
            let is_current = || BACKDROP_FADE_ID.load(Ordering::SeqCst) == fade_id;
            for step in 1..=BACKDROP_FADE_STEPS {
                std::thread::sleep(Duration::from_millis(duration_ms / BACKDROP_FADE_STEPS));
                if !is_current() {
                    return;
                }
                let progress = step as f64 / BACKDROP_FADE_STEPS as f64;
                let alpha = from + (to - from) * (1.0 - (1.0 - progress).powi(2));
                let handle = app.clone();
                let _ = app.run_on_main_thread(move || {
                    if let Ok(panel) = handle.get_webview_panel(BACKDROP_LABEL) {
                        panel.set_alpha_value(alpha);
                    }
                });
            }
            if hide_when_done && is_current() {
                let handle = app.clone();
                let _ = app.run_on_main_thread(move || {
                    if let Ok(panel) = handle.get_webview_panel(BACKDROP_LABEL) {
                        panel.hide();
                    }
                });
            }
        });
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

        // A missing blur must never stop the searcher itself from opening.
        if spec.label == "filesearcher" {
            if let Err(error) = show_backdrop(app, spec) {
                eprintln!("failed to show the searcher backdrop: {error}");
            }
        }

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
        if spec.label == "filesearcher" {
            fade_backdrop(app, BACKDROP_ALPHA, 0.0, BACKDROP_FADE_OUT_MS, true);
        }
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
    #[cfg(target_os = "macos")]
    if let Err(error) = macos::setup_backdrop(app) {
        eprintln!("failed to build the searcher backdrop: {error}");
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
