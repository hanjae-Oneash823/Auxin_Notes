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
    walk(Path::new(&root), &mut files, &mut None).map_err(|e| e.to_string())?;
    Ok(files)
}

/// Every directory in the vault, `.md`-file-less ones included — folders are
/// otherwise only known indirectly through note paths, which misses a
/// freshly created empty one. Same walk/skip rules as `list_vault_files`
/// (plus the `attachments/` folder, which is app-managed storage rather
/// than something the user organized notes into).
#[tauri::command]
pub fn list_vault_folders(root: String) -> Result<Vec<String>, String> {
    let mut files = Vec::new();
    let mut folders = Some(Vec::new());
    walk(Path::new(&root), &mut files, &mut folders).map_err(|e| e.to_string())?;
    Ok(folders.unwrap_or_default())
}

fn walk(dir: &Path, files: &mut Vec<VaultFile>, folders: &mut Option<Vec<String>>) -> std::io::Result<()> {
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
            if file_name != "attachments" {
                if let Some(folders) = folders {
                    folders.push(path.to_string_lossy().to_string());
                }
            }
            walk(&path, files, folders)?;
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
