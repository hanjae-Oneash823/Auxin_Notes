import { useEffect, useRef } from 'react';
import { Channel, invoke } from '@tauri-apps/api/core';
import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import '@xterm/xterm/css/xterm.css';
import { getTerminalTheme } from './terminalThemes';
import { getPastedImageFile, savePastedImageForTerminal } from './terminalImagePaste';

const SCROLLBAR_WIDTH_PX = 8;

interface TerminalPanelProps {
  vaultRoot?: string;
  fontSize: number;
  themeId: string;
}

function base64ToBytes(base64: string): Uint8Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

/** The xterm.js host. Mounted the first time the right panel's terminal layer
 *  is shown and never unmounted after (see `App.tsx`) — switching to another
 *  layer only hides it with `display: none`, so the xterm.js instance and its
 *  scrollback survive, matching the shell process staying alive on the Rust
 *  side (`terminal_spawn` reuses an existing session). While hidden the
 *  container has no size, which `FitAddon` treats as "nothing to fit"; the
 *  ResizeObserver below refits as soon as it is shown again. */
export function TerminalPanel({ vaultRoot, fontSize, themeId }: TerminalPanelProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const termRef = useRef<Terminal | null>(null);
  const fitAddonRef = useRef<FitAddon | null>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const term = new Terminal({
      convertEol: true,
      // A literal name, not `var(--font-family-mono)` — xterm measures
      // glyphs via a canvas context, which can't resolve CSS custom
      // properties the way DOM styles can.
      fontFamily: '"Cascadia Code", "JetBrains Mono", ui-monospace, monospace',
      // Only the size at first mount — later changes go through the
      // `[fontSize]` effect below, which updates the live instance instead
      // of remounting it (remounting would drop scrollback and reconnect
      // the pty session's channel for no reason).
      fontSize,
      // Explicit, not just relying on xterm's own defaults matching these —
      // block/quadrant characters (used by e.g. the Claude Code CLI's
      // splash logo) only tile into a clean image when every cell is
      // exactly the glyph's advance width/height with zero gap; any
      // line-height or letter-spacing padding shows up as visible seams
      // between what's meant to read as one continuous pixel-art image.
      lineHeight: 1,
      letterSpacing: 0,
      cursorBlink: true,
      // xterm 6 draws its own scrollbar and takes its width from here (default
      // 14px). Also sets the gutter it reserves, so the text area gains the space.
      overviewRuler: { width: SCROLLBAR_WIDTH_PX },
      // Colors come from terminalThemes.ts (literal hex there — xterm can't
      // resolve CSS variables). Later changes go through the `[themeId]`
      // effect below, live, without remounting.
      theme: getTerminalTheme(themeId),
    });
    termRef.current = term;
    const fitAddon = new FitAddon();
    fitAddonRef.current = fitAddon;
    term.loadAddon(fitAddon);
    term.open(container);
    fitAddon.fit();

    const channel = new Channel<string>((chunk) => {
      term.write(base64ToBytes(chunk));
    });

    void invoke('terminal_spawn', {
      channel,
      cwd: vaultRoot ?? null,
      cols: term.cols,
      rows: term.rows,
    }).catch((error: unknown) => {
      term.write(`\r\n[failed to start terminal: ${String(error)}]\r\n`);
    });

    // xterm's own composition buffering (meant to withhold onData until an
    // IME composition finishes) doesn't help here: WKWebView (Tauri's macOS
    // webview) never fires compositionstart/compositionupdate/
    // compositionend at all for the Korean 2-set keyboard — confirmed by a
    // document-level capture listener that never once saw one. Instead the
    // OS revises already-inserted text directly (e.g. replacing a lone "ㄱ"
    // with "그" once its vowel arrives) via the textarea's raw value, with
    // no event marking that a revision — as opposed to a plain append — is
    // happening. xterm's own input handling doesn't send the backspaces
    // needed to undo what it already forwarded for the stale text, so a
    // revised syllable reads as leftover fragments once the shell echoes it
    // back. Since there's no event to key off, watch the textarea's value
    // directly and diff it against what was last seen: a plain append (the
    // overwhelming majority of normal typing, one new character with
    // nothing removed) is left to xterm's already-correct default handling,
    // and only an edit that removes or replaces something — the shape a
    // revised Korean syllable actually takes — is corrected here by sending
    // the right number of backspaces before the new text. Registered with
    // `capture: true` on `document` (an ancestor of the textarea) so it
    // runs before xterm's own listener on the textarea itself; DOM dispatch
    // only orders same-target listeners by registration order regardless of
    // their capture flag, so intercepting on the target wouldn't guarantee
    // going first the way an ancestor's capture phase does.
    const textarea = term.textarea;
    let lastTextareaValue = textarea?.value ?? '';
    function commonPrefixLength(a: string, b: string): number {
      const max = Math.min(a.length, b.length);
      let i = 0;
      while (i < max && a[i] === b[i]) i++;
      return i;
    }
    function handleTextareaInput(event: Event) {
      if (!textarea || event.target !== textarea || (event as InputEvent).isComposing) return;
      const newValue = textarea.value;
      const prefixLength = commonPrefixLength(lastTextareaValue, newValue);
      const deleteCount = lastTextareaValue.length - prefixLength;
      const inserted = newValue.slice(prefixLength);
      if (deleteCount === 0 && inserted.length <= 1) {
        lastTextareaValue = newValue;
        return;
      }
      event.stopImmediatePropagation();
      const backspaces = '\x7f'.repeat(deleteCount);
      void invoke('terminal_write', { data: (backspaces + inserted).normalize('NFC') });
      textarea.value = '';
      lastTextareaValue = '';
    }
    document.addEventListener('input', handleTextareaInput, true);

    // The space bar gets its own dedicated path instead of going through
    // the textarea-diffing one above: WKWebView sometimes lands two space
    // characters in the textarea from a single physical keypress (word
    // boundaries trigger WebKit's own spell-check/text-replacement
    // re-evaluation, which appears to be involved) — indistinguishable,
    // from the diff's point of view, from the user actually pressing space
    // twice. Intercepting at `keydown` sidesteps that unreliable pipeline
    // for this one key entirely, rather than trying to filter its effect
    // back out downstream: `preventDefault` stops the browser from
    // inserting anything into the textarea at all, so no `keypress`/`input`
    // event follows for xterm's own listeners to (possibly doubly) act on,
    // and exactly one space is sent per physical keydown.
    function handleSpaceKeydown(event: KeyboardEvent) {
      if (event.target !== textarea) return;
      if (event.key !== ' ' || event.ctrlKey || event.altKey || event.metaKey) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      void invoke('terminal_write', { data: ' ' });
    }
    document.addEventListener('keydown', handleSpaceKeydown, true);

    // xterm's own `paste` listener on the textarea reads the clipboard and
    // forwards it straight to the pty (via `onData` below), but it never
    // calls `preventDefault()` — so the browser's default paste action also
    // runs, inserting the same text into the textarea. That insertion fires
    // an `input` event, which `handleTextareaInput` above would forward a
    // second time, pasting everything twice. Preventing the default here
    // stops that second insertion while leaving xterm's own paste handling
    // (which only needs `clipboardData`, not the textarea's value) intact.
    //
    // A pasted *image* has no text for xterm's listener to forward at all
    // (there's nothing in `clipboardData` under `text/plain`), so it's
    // handled entirely here instead: save it into the vault's attachments
    // folder (same `save_image_data` command the note editor's own image
    // paste uses) and feed the resulting path into the terminal as if it
    // had been typed/pasted directly — the same trick real terminals
    // (iTerm2, Kitty) play, which is what lets a CLI like Claude Code
    // running inside this terminal pick it up as an image attachment.
    function handlePaste(event: ClipboardEvent) {
      if (event.target !== textarea) return;
      event.preventDefault();

      const imageFile = getPastedImageFile(event.clipboardData);
      if (!imageFile) return;
      // Also handled by xterm's own listener otherwise (see above) — an
      // image paste has nothing for that listener to do, but some clipboard
      // sources carry a text/file-path fallback alongside the image data,
      // and pasting both would be confusing.
      event.stopImmediatePropagation();

      if (!vaultRoot) {
        term.write('\r\n[open a vault to paste images]\r\n');
        return;
      }
      void savePastedImageForTerminal(vaultRoot, imageFile)
        .then((quotedPath) => term.paste(quotedPath))
        .catch((error: unknown) => {
          term.write(`\r\n[failed to paste image: ${String(error)}]\r\n`);
        });
    }
    document.addEventListener('paste', handlePaste, true);

    const dataDisposable = term.onData((data) => {
      void invoke('terminal_write', { data });
    });

    // Also fires when the panel itself is resized (the container is a flex
    // child that fills it), so dragging the corner handle below re-fits
    // xterm and re-syncs the pty's size for free.
    const resizeObserver = new ResizeObserver(() => {
      fitAddon.fit();
      void invoke('terminal_resize', { cols: term.cols, rows: term.rows });
    });
    resizeObserver.observe(container);

    return () => {
      resizeObserver.disconnect();
      dataDisposable.dispose();
      document.removeEventListener('input', handleTextareaInput, true);
      document.removeEventListener('keydown', handleSpaceKeydown, true);
      document.removeEventListener('paste', handlePaste, true);
      term.dispose();
    };
    // Spawns once for this panel's lifetime (mounted once, see above) —
    // a later vaultRoot change shouldn't respawn the shell out from under
    // the user.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (termRef.current) termRef.current.options.theme = getTerminalTheme(themeId);
  }, [themeId]);

  useEffect(() => {
    const term = termRef.current;
    const fitAddon = fitAddonRef.current;
    if (!term || !fitAddon) return;
    term.options.fontSize = fontSize;
    // A font-size change alters the pixel size of each cell, so the
    // col/row count that fits the (unchanged) pixel-sized panel changes too
    // — re-fit and tell the pty, same as an actual panel resize does.
    fitAddon.fit();
    void invoke('terminal_resize', { cols: term.cols, rows: term.rows });
  }, [fontSize]);

  // Bleeds to the packet's left/bottom edges (-ml-1.5/-mb-1.5 cancel its
  // px-1.5/pb-1.5) and on the right through the packet's 6px and the panel's
  // 8px (-mr-3.5) to the window edge, with no inset on that side so xterm's
  // scrollbar sits flush against it. p-1 keeps text off the other edges.
  return <div ref={containerRef} className="-mb-1.5 -ml-1.5 -mr-3.5 min-h-0 flex-1 overflow-hidden py-1 pl-1 pr-0" />;
}
