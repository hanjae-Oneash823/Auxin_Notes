use notify::RecursiveMode;
use notify_debouncer_full::{new_debouncer, DebounceEventResult, Debouncer, RecommendedCache};
use serde::Serialize;
use std::path::PathBuf;
use std::sync::Mutex;
use std::time::Duration;
use tauri::{AppHandle, Emitter, Manager};

const DEBOUNCE_MS: u64 = 250;

/// Holds the live debouncer so it isn't dropped (which stops watching) after
/// `watch_vault` returns, and so a later vault switch can replace it.
#[derive(Default)]
pub struct WatcherState(pub Mutex<Option<Debouncer<notify::RecommendedWatcher, RecommendedCache>>>);

#[derive(Clone, Serialize)]
pub struct VaultChangeEvent {
    pub path: String,
    pub kind: String, // "created" | "modified" | "removed"
}

/// Starts (or restarts, if already watching) a debounced recursive watch over
/// `path`. Rust never parses the changed file — it only tells the frontend
/// which `.md` path changed and how; parsing/indexing is TypeScript's job.
#[tauri::command]
pub fn watch_vault(app: AppHandle, path: String) -> Result<(), String> {
    let state = app.state::<WatcherState>();
    let mut guard = state.0.lock().map_err(|e| e.to_string())?;

    let app_for_events = app.clone();
    let mut debouncer = new_debouncer(
        Duration::from_millis(DEBOUNCE_MS),
        None,
        move |result: DebounceEventResult| {
            let events = match result {
                Ok(events) => events,
                // Transient watch errors aren't independently actionable here —
                // the frontend's startup/periodic reconciliation pass is the
                // correctness backstop if a change is ever missed.
                Err(_) => return,
            };

            for debounced in events {
                let kind = match debounced.event.kind {
                    notify::EventKind::Create(_) => "created",
                    notify::EventKind::Modify(_) => "modified",
                    notify::EventKind::Remove(_) => "removed",
                    _ => continue,
                };

                for changed_path in &debounced.event.paths {
                    if changed_path.extension().and_then(|e| e.to_str()) != Some("md") {
                        continue;
                    }
                    let _ = app_for_events.emit(
                        "vault://changed",
                        VaultChangeEvent {
                            path: changed_path.to_string_lossy().to_string(),
                            kind: kind.to_string(),
                        },
                    );
                }
            }
        },
    )
    .map_err(|e| e.to_string())?;

    debouncer
        .watch(PathBuf::from(&path), RecursiveMode::Recursive)
        .map_err(|e| e.to_string())?;

    *guard = Some(debouncer);
    Ok(())
}
