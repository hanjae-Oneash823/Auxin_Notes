use std::path::Path;

/// Extensions the vault walker (`commands::vault_scan`) and live watcher
/// (`watcher`) both track — every other file (images in `attachments/`,
/// `.auxin/` index, dotfiles, etc.) is invisible to the app's file list,
/// folder tree, and reconciliation pass. Kept as one shared list so the two
/// independent filters can't drift out of sync with each other.
const VAULT_FILE_EXTENSIONS: &[&str] = &["md", "axcanvas"];

pub fn is_vault_file(path: &Path) -> bool {
    path.extension()
        .and_then(|e| e.to_str())
        .is_some_and(|ext| VAULT_FILE_EXTENSIONS.contains(&ext))
}
