use serde::Serialize;
use std::fs;
use std::path::Path;
use std::time::UNIX_EPOCH;

#[derive(Serialize)]
pub struct VaultFile {
    pub path: String,
    pub modified_ms: u64,
    pub size: u64,
}

/// Full recursive walk of the vault, returning every `.md` file's path, mtime,
/// and size — no file contents are read. This is the cheap "what's out there"
/// pass reconciliation uses to decide which files actually need reparsing.
#[tauri::command]
pub fn list_vault_files(root: String) -> Result<Vec<VaultFile>, String> {
    let mut files = Vec::new();
    walk(Path::new(&root), &mut files).map_err(|e| e.to_string())?;
    Ok(files)
}

fn walk(dir: &Path, files: &mut Vec<VaultFile>) -> std::io::Result<()> {
    let entries = match fs::read_dir(dir) {
        Ok(entries) => entries,
        Err(_) => return Ok(()), // vault root or subdir vanished mid-walk; skip, not fatal
    };

    for entry in entries {
        let entry = entry?;
        let path = entry.path();
        let file_name = entry.file_name();
        let file_name = file_name.to_string_lossy();

        // Skips .auxin/ (the index), .git/, and other dotfiles/dotdirs.
        if file_name.starts_with('.') {
            continue;
        }

        if path.is_dir() {
            walk(&path, files)?;
        } else if path.extension().and_then(|e| e.to_str()) == Some("md") {
            let metadata = entry.metadata()?;
            let modified_ms = metadata
                .modified()?
                .duration_since(UNIX_EPOCH)
                .unwrap_or_default()
                .as_millis() as u64;
            files.push(VaultFile {
                path: path.to_string_lossy().to_string(),
                modified_ms,
                size: metadata.len(),
            });
        }
    }
    Ok(())
}
