use base64::{engine::general_purpose, Engine as _};
use std::fs;
use std::io::Write;
use std::path::{Path, PathBuf};

/// Atomic write: content lands in a temp file, fsynced, then renamed over the
/// target. A crash or power loss mid-write can never leave a note half-written
/// on disk — the reader always sees either the old file or the new one.
#[tauri::command]
pub fn write_note(path: String, content: String) -> Result<(), String> {
    let target = PathBuf::from(&path);
    if let Some(parent) = target.parent() {
        fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    let tmp_path = PathBuf::from(format!("{path}.tmp"));

    let mut file = fs::File::create(&tmp_path).map_err(|e| e.to_string())?;
    file.write_all(content.as_bytes()).map_err(|e| e.to_string())?;
    file.sync_all().map_err(|e| e.to_string())?;
    drop(file);

    fs::rename(&tmp_path, &target).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn read_note(path: String) -> Result<String, String> {
    fs::read_to_string(&path).map_err(|e| e.to_string())
}

/// `fs::rename` alone would silently overwrite an existing file at `new_path`
/// on POSIX (unlike `write_note`'s tmp+rename, which only ever replaces the
/// file it's meant to). The caller (renameEngine.ts) already checks the
/// index for a path collision, but that can't see an untracked/stray file
/// — this is the last line of defense against a rename clobbering it.
#[tauri::command]
pub fn rename_note(old_path: String, new_path: String) -> Result<(), String> {
    let target = PathBuf::from(&new_path);
    if target.exists() {
        return Err(format!("A file already exists at \"{new_path}\""));
    }
    if let Some(parent) = target.parent() {
        fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    fs::rename(&old_path, &target).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn delete_note(path: String) -> Result<(), String> {
    fs::remove_file(&path).map_err(|e| e.to_string())
}

/// Keeps only the paths that still exist as files, in their original order —
/// used to drop restored tabs whose note was deleted or moved while closed.
#[tauri::command]
pub fn existing_paths(paths: Vec<String>) -> Vec<String> {
    paths.into_iter().filter(|p| Path::new(p).is_file()).collect()
}

#[tauri::command]
pub fn ensure_dir(path: String) -> Result<(), String> {
    fs::create_dir_all(&path).map_err(|e| e.to_string())
}

/// Moves (or renames) a folder — a single `fs::rename` of the directory
/// itself, so everything inside it moves along for free with no per-file
/// work. Same collision guard as `rename_note`: refuses to clobber an
/// existing entry at `new_path` rather than silently merging into it.
#[tauri::command]
pub fn move_folder(old_path: String, new_path: String) -> Result<(), String> {
    let target = PathBuf::from(&new_path);
    if target.exists() {
        return Err(format!("\"{new_path}\" already exists"));
    }
    if let Some(parent) = target.parent() {
        fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    fs::rename(&old_path, &target).map_err(|e| e.to_string())
}

/// Recursively deletes a folder and everything inside it. Irreversible —
/// the frontend confirms with the user before ever calling this; nothing
/// here holds it back once invoked.
#[tauri::command]
pub fn delete_folder(path: String) -> Result<(), String> {
    fs::remove_dir_all(&path).map_err(|e| e.to_string())
}

const ATTACHMENTS_DIR_NAME: &str = "attachments";

fn attachments_dir(vault_root: &str) -> PathBuf {
    PathBuf::from(vault_root).join(ATTACHMENTS_DIR_NAME)
}

/// Appends `-1`, `-2`, ... before the extension until the name is free —
/// keeps a human-readable original name instead of a random suffix, since
/// collisions are the exception (mostly a re-pasted screenshot with the
/// same default name).
fn unique_path_in(dir: &Path, file_name: &str) -> PathBuf {
    let candidate = dir.join(file_name);
    if !candidate.exists() {
        return candidate;
    }
    let stem = Path::new(file_name)
        .file_stem()
        .and_then(|s| s.to_str())
        .unwrap_or("file");
    let ext = Path::new(file_name).extension().and_then(|s| s.to_str());
    let mut n = 1;
    loop {
        let name = match ext {
            Some(ext) => format!("{stem}-{n}.{ext}"),
            None => format!("{stem}-{n}"),
        };
        let next = dir.join(&name);
        if !next.exists() {
            return next;
        }
        n += 1;
    }
}

/// Saves base64-encoded image bytes (a paste or drag-drop `Blob`, which has
/// no filesystem path to copy from) into the vault's attachments folder.
/// Returns the vault-relative path for the markdown link.
#[tauri::command]
pub fn save_image_data(vault_root: String, base64_data: String, file_name: String) -> Result<String, String> {
    let dir = attachments_dir(&vault_root);
    fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    let target = unique_path_in(&dir, &file_name);
    let bytes = general_purpose::STANDARD
        .decode(&base64_data)
        .map_err(|e| e.to_string())?;
    fs::write(&target, &bytes).map_err(|e| e.to_string())?;
    let saved_name = target.file_name().and_then(|n| n.to_str()).unwrap_or(&file_name);
    Ok(format!("{ATTACHMENTS_DIR_NAME}/{saved_name}"))
}

/// Writes base64-encoded bytes to exactly `path` — used to save a file the
/// user picked with a save dialog (e.g. an exported canvas image), which can
/// be anywhere, unlike `save_image_data`'s vault attachments folder.
#[tauri::command]
pub fn write_binary_file(path: String, base64_data: String) -> Result<(), String> {
    let bytes = general_purpose::STANDARD
        .decode(&base64_data)
        .map_err(|e| e.to_string())?;
    fs::write(&path, &bytes).map_err(|e| format!("could not write \"{path}\": {e}"))
}

/// Reads a file and returns its bytes base64-encoded — for putting an image
/// straight into a `data:` URL, which sidesteps the webview's rules about
/// fetching `asset://` URLs from script (used when rendering a canvas to a PNG).
#[tauri::command]
pub fn read_file_base64(path: String) -> Result<String, String> {
    let bytes = fs::read(&path).map_err(|e| format!("could not read \"{path}\": {e}"))?;
    Ok(general_purpose::STANDARD.encode(bytes))
}

/// Copies a file already on disk (chosen via the file picker) into the
/// vault's attachments folder. Returns the vault-relative path for the
/// markdown link.
#[tauri::command]
pub fn copy_image_file(vault_root: String, source_path: String) -> Result<String, String> {
    let dir = attachments_dir(&vault_root);
    fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    let source = PathBuf::from(&source_path);
    let file_name = source
        .file_name()
        .and_then(|n| n.to_str())
        .ok_or_else(|| format!("\"{source_path}\" has no file name"))?;
    let target = unique_path_in(&dir, file_name);
    fs::copy(&source, &target).map_err(|e| e.to_string())?;
    let saved_name = target.file_name().and_then(|n| n.to_str()).unwrap_or(file_name);
    Ok(format!("{ATTACHMENTS_DIR_NAME}/{saved_name}"))
}

/// Copies a file already on disk (chosen via the file picker) into a vault
/// folder, keeping its name unless taken. Returns the new absolute path.
#[tauri::command]
pub fn import_file(dest_dir: String, source_path: String) -> Result<String, String> {
    let dir = PathBuf::from(&dest_dir);
    fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    let file_name = Path::new(&source_path)
        .file_name()
        .and_then(|n| n.to_str())
        .ok_or_else(|| format!("\"{source_path}\" has no file name"))?;
    let target = unique_path_in(&dir, file_name);
    fs::copy(&source_path, &target).map_err(|e| e.to_string())?;
    Ok(target.to_string_lossy().to_string())
}

/// Grants the asset protocol runtime access to a vault's directory tree, so
/// `convertFileSrc` can stream an image file straight to the webview instead
/// of round-tripping it through a command as a base64 `data:` URL (the
/// latter was the original approach here — correct, but base64 adds ~33%
/// to an already-sizeable IPC payload for anything bigger than a small
/// image). The static scope in tauri.conf.json is deliberately empty since
/// the vault root is a user-chosen path picked at runtime, not known at
/// build time — this is called once, right after a vault is opened
/// (vaultStore.ts), to widen the scope to that specific directory instead.
#[tauri::command]
pub fn allow_vault_asset_access(app: tauri::AppHandle, path: String) -> Result<(), String> {
    use tauri::Manager;
    app.asset_protocol_scope()
        .allow_directory(&path, true)
        .map_err(|e| e.to_string())
}
