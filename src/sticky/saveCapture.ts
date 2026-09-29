import { emit } from '@tauri-apps/api/event';
import { getAppConfig } from '../app/appConfig';
import { getDb } from '../db/client';
import { createStickyNote, type StickyNoteType } from '../db/queries/sticky';

const COLORS = ['yellow', 'pink', 'blue', 'green'];

export type SaveCaptureResult = 'saved' | 'no-vault';

function randomColor(): string {
  return COLORS[Math.floor(Math.random() * COLORS.length)];
}

function checklistItems(text: string): string[] {
  return text
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);
}

/**
 * Writes one captured note straight to the vault's database — the capture
 * window has its own JS runtime, so it can't go through the main window's
 * `stickyStore` — then emits `sticky://created` so that store picks it up.
 * `text` must already be non-empty after trimming.
 */
export async function saveCapture(type: StickyNoteType, text: string): Promise<SaveCaptureResult> {
  const config = await getAppConfig();
  const vaultRoot = config.last_vault_path;
  if (!vaultRoot) return 'no-vault';

  const db = await getDb(vaultRoot);
  const color = randomColor();
  const note =
    type === 'checklist'
      ? await createStickyNote(db, { type: 'checklist', color, itemTexts: checklistItems(text) })
      : await createStickyNote(db, { type: 'text', content: text, color });

  await emit('sticky://created', note);
  return 'saved';
}
