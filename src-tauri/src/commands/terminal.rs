use base64::{engine::general_purpose, Engine as _};
use portable_pty::{native_pty_system, Child, CommandBuilder, MasterPty, PtySize};
use std::io::{Read, Write};
use std::sync::{Arc, Mutex};
use tauri::ipc::Channel;
use tauri::State;

/// One global shell — reopening the panel reuses this rather than spawning a
/// second shell, so `cd`'d directories and running REPLs survive the panel
/// being hidden and shown again.
struct PtySession {
    master: Box<dyn MasterPty + Send>,
    writer: Box<dyn Write + Send>,
    child: Box<dyn Child + Send + Sync>,
}

/// The reader thread outlives any single `terminal_spawn` call, but which
/// channel it should stream to can change — a fresh frontend mount (a real
/// panel reopen, or React StrictMode's dev-mode double-mount) hands in a
/// new `Channel` each time. Routing through this shared slot, re-pointed on
/// every call, means output always reaches whichever channel is currently
/// listening instead of the one that happened to be live when the reader
/// thread was spawned.
type SharedChannel = Arc<Mutex<Option<Channel<String>>>>;

#[derive(Default)]
pub struct TerminalState {
    session: Mutex<Option<PtySession>>,
    channel: SharedChannel,
}

fn default_shell() -> String {
    #[cfg(windows)]
    {
        std::env::var("COMSPEC").unwrap_or_else(|_| "powershell.exe".to_string())
    }
    #[cfg(not(windows))]
    {
        std::env::var("SHELL").unwrap_or_else(|_| "/bin/zsh".to_string())
    }
}

/// Starts the shell on first call; a later call just re-points the output
/// channel (and resizes) rather than spawning a second shell — the panel
/// being reopened, or remounted, shouldn't spawn a shell underneath it.
#[tauri::command]
pub fn terminal_spawn(
    state: State<TerminalState>,
    channel: Channel<String>,
    cwd: Option<String>,
    cols: u16,
    rows: u16,
) -> Result<(), String> {
    *state.channel.lock().map_err(|e| e.to_string())? = Some(channel);

    let mut guard = state.session.lock().map_err(|e| e.to_string())?;
    if let Some(session) = guard.as_ref() {
        return session
            .master
            .resize(PtySize { rows, cols, pixel_width: 0, pixel_height: 0 })
            .map_err(|e| e.to_string());
    }

    let pty_system = native_pty_system();
    let pair = pty_system
        .openpty(PtySize { rows, cols, pixel_width: 0, pixel_height: 0 })
        .map_err(|e| e.to_string())?;

    let mut cmd = CommandBuilder::new(default_shell());
    if let Some(dir) = cwd {
        cmd.cwd(dir);
    }

    let child = pair.slave.spawn_command(cmd).map_err(|e| e.to_string())?;
    // The slave end is only needed to spawn the child; dropping it here (by
    // not storing it) closes our copy, same as a real terminal emulator.
    drop(pair.slave);

    let writer = pair.master.take_writer().map_err(|e| e.to_string())?;
    let mut reader = pair.master.try_clone_reader().map_err(|e| e.to_string())?;

    let shared_channel = state.channel.clone();
    std::thread::spawn(move || {
        let mut buf = [0u8; 4096];
        loop {
            match reader.read(&mut buf) {
                Ok(0) | Err(_) => break,
                Ok(n) => {
                    let encoded = general_purpose::STANDARD.encode(&buf[..n]);
                    let current = shared_channel.lock().ok().and_then(|guard| guard.clone());
                    if let Some(ch) = current {
                        let _ = ch.send(encoded);
                    }
                }
            }
        }
    });

    *guard = Some(PtySession { master: pair.master, writer, child });
    Ok(())
}

#[tauri::command]
pub fn terminal_write(state: State<TerminalState>, data: String) -> Result<(), String> {
    let mut guard = state.session.lock().map_err(|e| e.to_string())?;
    let session = guard.as_mut().ok_or("terminal not running")?;
    session.writer.write_all(data.as_bytes()).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn terminal_resize(state: State<TerminalState>, cols: u16, rows: u16) -> Result<(), String> {
    let guard = state.session.lock().map_err(|e| e.to_string())?;
    let session = guard.as_ref().ok_or("terminal not running")?;
    session
        .master
        .resize(PtySize { rows, cols, pixel_width: 0, pixel_height: 0 })
        .map_err(|e| e.to_string())
}

/// Best-effort shutdown, called on app exit — a shell left running after the
/// window closes would otherwise linger as an orphaned background process.
#[tauri::command]
pub fn terminal_kill(state: State<TerminalState>) -> Result<(), String> {
    let mut guard = state.session.lock().map_err(|e| e.to_string())?;
    if let Some(mut session) = guard.take() {
        let _ = session.child.kill();
    }
    Ok(())
}
