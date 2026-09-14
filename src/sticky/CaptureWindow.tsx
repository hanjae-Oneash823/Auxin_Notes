import { useEffect, useRef, useState } from 'react';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { emit } from '@tauri-apps/api/event';
import { getAppConfig } from '../app/appConfig';
import { getDb } from '../db/client';
import { createStickyNote, type StickyNoteType } from '../db/queries/sticky';

const COLORS = ['yellow', 'pink', 'blue', 'green'];

/**
 * The entire content of the "capture" window (see src-tauri/src/lib.rs) —
 * a small, borderless, always-on-top popup, Raycast-style, separate from
 * the main Auxin window so it can float above every other app. This window
 * is shown/hidden (never closed) by the global shortcut handler in the main
 * window; it has its own JS runtime, so it talks to the database directly
 * rather than through the main window's `stickyStore`, then emits
 * `sticky://created` so the main window's store can pick up the new note.
 */
export function CaptureWindow() {
  const [type, setType] = useState<StickyNoteType>('text');
  const [text, setText] = useState('');
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    const win = getCurrentWindow();
    let unlisten: (() => void) | undefined;

    void win
      .onFocusChanged(({ payload: focused }) => {
        if (focused) {
          setType('text');
          setText('');
          textareaRef.current?.focus();
        } else {
          void win.hide();
        }
      })
      .then((fn) => {
        unlisten = fn;
      });

    return () => unlisten?.();
  }, []);

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') void getCurrentWindow().hide();
    }
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  async function handleSubmit() {
    const trimmed = text.trim();
    if (!trimmed) {
      void getCurrentWindow().hide();
      return;
    }

    const config = await getAppConfig();
    const vaultRoot = config.last_vault_path;
    if (!vaultRoot) {
      void getCurrentWindow().hide();
      return;
    }

    const color = COLORS[Math.floor(Math.random() * COLORS.length)];
    const db = await getDb(vaultRoot);
    const note =
      type === 'checklist'
        ? await createStickyNote(db, {
            type: 'checklist',
            color,
            itemTexts: trimmed
              .split('\n')
              .map((line) => line.trim())
              .filter(Boolean),
          })
        : await createStickyNote(db, { type: 'text', content: trimmed, color });

    await emit('sticky://created', note);
    void getCurrentWindow().hide();
  }

  return (
    <div
      className="flex h-screen w-screen flex-col border border-border-strong bg-bg p-3"
      style={{ fontFamily: 'var(--font-family)', fontSize: '0.85rem' }}
    >
      <div className="mb-2 flex gap-1.5">
        <button
          type="button"
          onClick={() => setType('text')}
          className={`flex-1 border px-2 py-1 text-left tracking-menu uppercase transition-colors duration-panel ease-panel ${
            type === 'text' ? 'border-border-strong text-fg-prominent' : 'border-border text-fg-faint'
          }`}
          style={{ fontSize: '0.68rem' }}
        >
          note
        </button>
        <button
          type="button"
          onClick={() => setType('checklist')}
          className={`flex-1 border px-2 py-1 text-left tracking-menu uppercase transition-colors duration-panel ease-panel ${
            type === 'checklist' ? 'border-border-strong text-fg-prominent' : 'border-border text-fg-faint'
          }`}
          style={{ fontSize: '0.68rem' }}
        >
          checklist
        </button>
      </div>
      <textarea
        ref={textareaRef}
        autoFocus
        value={text}
        onChange={(event) => setText(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === 'Enter' && !event.shiftKey) {
            event.preventDefault();
            void handleSubmit();
          }
        }}
        placeholder={type === 'checklist' ? 'one item per line…' : "what's on your mind…"}
        className="w-full flex-1 resize-none border border-border-strong bg-transparent px-2 py-1.5 text-fg-prominent outline-none"
      />
      <div className="mt-2 flex items-center justify-between">
        <span className="text-fg-faint" style={{ fontSize: '0.68rem' }}>
          [enter] save · [esc] dismiss
        </span>
        <button
          type="button"
          onClick={() => void handleSubmit()}
          className="border border-border px-2 py-1 text-fg-muted transition-colors duration-panel ease-panel hover:border-border-strong hover:text-fg-prominent"
          style={{ fontSize: '0.72rem' }}
        >
          save
        </button>
      </div>
    </div>
  );
}
