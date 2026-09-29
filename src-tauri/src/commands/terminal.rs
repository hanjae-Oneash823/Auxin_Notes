use base64::{engine::general_purpose, Engine as _};
use portable_pty::{native_pty_system, Child, CommandBuilder, MasterPty, PtySize};
use serde::Serialize;
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

/// A GUI-launched process (this app included, in a packaged build opened
/// from Finder rather than a terminal) often inherits a minimal environment
/// with no locale set at all — confirmed true even for this dev session's
/// own shell. A missing/non-UTF-8 `LANG` doesn't corrupt what this app sends
/// to the pty (`terminal_write` writes exactly the UTF-8 bytes it's given),
/// but it does break the *spawned shell's own* line editor for any
/// multi-byte input: Korean (and other CJK) characters redraw wrong,
/// backspace removes partial bytes instead of a whole character, and cursor
/// math goes off — which reads as "typing doesn't work" even though the
/// input itself was composed and transmitted correctly. Only patched when
/// missing/non-UTF-8, so a shell that already sets its own locale (via
/// .zshrc, a real Terminal.app profile, etc.) is left alone.
fn ensure_utf8_locale(cmd: &mut CommandBuilder) {
    let has_utf8_locale = std::env::var("LANG")
        .or_else(|_| std::env::var("LC_ALL"))
        .map(|value| {
            let upper = value.to_uppercase();
            upper.contains("UTF-8") || upper.contains("UTF8")
        })
        .unwrap_or(false);
    if !has_utf8_locale {
        cmd.env("LANG", "en_US.UTF-8");
    }
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
    ensure_utf8_locale(&mut cmd);
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

/// What the terminal is doing right now, for the preset launchers.
#[derive(Serialize)]
#[serde(rename_all = "lowercase")]
pub enum TerminalStatus {
    /// No shell has been started yet.
    None,
    /// The shell itself owns the terminal — sitting at its prompt.
    Idle,
    /// A program (claude, vim, a build...) is in the foreground.
    Busy,
}

/// Busy means the terminal's foreground process group is not the shell's own
/// — the shell is a session leader, so its process group id is its pid.
/// Where the foreground group can't be read (Windows), reports idle.
#[tauri::command]
pub fn terminal_status(state: State<TerminalState>) -> Result<TerminalStatus, String> {
    let guard = state.session.lock().map_err(|e| e.to_string())?;
    let Some(session) = guard.as_ref() else {
        return Ok(TerminalStatus::None);
    };
    let is_busy = match (session.child.process_id(), session.master.process_group_leader()) {
        (Some(shell), Some(foreground)) => foreground as u32 != shell,
        _ => false,
    };
    Ok(if is_busy { TerminalStatus::Busy } else { TerminalStatus::Idle })
}

/// Signals the terminal's foreground program (its whole process group, so a
/// `claude` and its children go together) — SIGTERM, or SIGKILL when `force`.
/// The shell itself is never signalled: nothing happens if it's at its prompt.
#[tauri::command]
pub fn terminal_stop(state: State<TerminalState>, force: bool) -> Result<(), String> {
    #[cfg(unix)]
    {
        let guard = state.session.lock().map_err(|e| e.to_string())?;
        let session = guard.as_ref().ok_or("terminal not running")?;
        let (Some(shell), Some(foreground)) = (session.child.process_id(), session.master.process_group_leader())
        else {
            return Ok(());
        };
        if foreground as u32 == shell {
            return Ok(());
        }
        let signal = if force { libc::SIGKILL } else { libc::SIGTERM };
        if unsafe { libc::killpg(foreground as libc::pid_t, signal) } != 0 {
            return Err(std::io::Error::last_os_error().to_string());
        }
        Ok(())
    }
    #[cfg(not(unix))]
    {
        let _ = (state, force);
        Err("stopping the terminal process is not supported on this platform".to_string())
    }
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
