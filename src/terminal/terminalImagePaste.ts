import { invoke } from '@tauri-apps/api/core';
import { blobToBase64, extensionForMimeType } from '../vault/imageBlob';

/** The first image file in a paste's clipboard data, or `null` if it's a
 *  plain text/other paste — checked before falling through to xterm's own
 *  text-paste handling, the same priority real terminals (iTerm2, Kitty)
 *  give an image paste over any text/file-path fallback the same clipboard
 *  entry might also carry. */
export function getPastedImageFile(clipboardData: DataTransfer | null): File | null {
  if (!clipboardData) return null;
  for (const item of clipboardData.items) {
    if (item.kind === 'file' && item.type.startsWith('image/')) {
      return item.getAsFile();
    }
  }
  return null;
}

/** POSIX single-quote escaping — the terminal's shell is assumed to be a
 *  POSIX one (bash/zsh; this app is macOS-only), matching how a real
 *  terminal quotes a path it pastes on your behalf so a shell never
 *  word-splits it. */
function shellQuote(path: string): string {
  return `'${path.replace(/'/g, `'\\''`)}'`;
}

/**
 * Saves a pasted image into the vault's `attachments/` folder (via the same
 * `save_image_data` command the note editor's own paste/drag-drop uses) and
 * returns a shell-quoted absolute path, ready to feed into the terminal as
 * if the user had pasted that path directly — the same trick iTerm2/Kitty
 * play when you paste an image: there's no clipboard "image" the shell
 * itself can understand, so what actually lands in the input is a path to
 * a file the shell (or whatever CLI is reading stdin, e.g. the Claude Code
 * CLI's own image-attachment detection) can pick up.
 */
export async function savePastedImageForTerminal(vaultRoot: string, file: File): Promise<string> {
  const ext = extensionForMimeType(file.type);
  const base64Data = await blobToBase64(file);
  const relPath = await invoke<string>('save_image_data', { vaultRoot, base64Data, fileName: `pasted-image.${ext}` });
  return shellQuote(`${vaultRoot}/${relPath}`);
}
