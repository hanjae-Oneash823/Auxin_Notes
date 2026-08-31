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

#[tauri::command]
pub fn ensure_dir(path: String) -> Result<(), String> {
    fs::create_dir_all(&path).map_err(|e| e.to_string())
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

/// Returns an image file as a `data:` URL. Sidesteps Tauri's asset-protocol
/// scope configuration (which would need to be widened at runtime to an
/// arbitrary user-chosen vault path) at the cost of base64 overhead — fine
/// for note-sized images; worth revisiting if large-image performance
/// becomes a real complaint.
#[tauri::command]
pub fn read_image_data_url(path: String) -> Result<String, String> {
    let bytes = fs::read(&path).map_err(|e| e.to_string())?;
    let mime = mime_from_extension(&path);
    let encoded = general_purpose::STANDARD.encode(&bytes);
    Ok(format!("data:{mime};base64,{encoded}"))
}

fn mime_from_extension(path: &str) -> &'static str {
    let ext = Path::new(path)
        .extension()
        .and_then(|e| e.to_str())
        .unwrap_or("")
        .to_lowercase();
    match ext.as_str() {
        "png" => "image/png",
        "jpg" | "jpeg" => "image/jpeg",
        "gif" => "image/gif",
        "webp" => "image/webp",
        "svg" => "image/svg+xml",
        _ => "application/octet-stream",
    }
}
