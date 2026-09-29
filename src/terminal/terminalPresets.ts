import { create } from 'zustand';

/** A one-click terminal command: `command` is typed into the shell and run. */
export interface TerminalPreset {
  id: string;
  label: string;
  command: string;
}

const STORAGE_KEY = 'auxin.terminalPresets';

export const DEFAULT_PRESETS: readonly TerminalPreset[] = [
  { id: 'claude', label: 'claude', command: 'claude' },
  { id: 'yolo-claude', label: 'yolo claude', command: 'claude --dangerously-skip-permissions' },
  { id: 'codex', label: 'codex', command: 'codex' },
  { id: 'yolo-codex', label: 'yolo codex', command: 'codex --dangerously-bypass-approvals-and-sandbox' },
];

const RISKY_PATTERN = /dangerously|--yolo|--full-auto/;

/** Commands that turn off the agent's safety prompts get a red tint so they
 *  are hard to click by accident. Derived, so user-added presets get it too. */
export function isRiskyCommand(command: string): boolean {
  return RISKY_PATTERN.test(command);
}

function isPreset(value: unknown): value is TerminalPreset {
  if (typeof value !== 'object' || value === null) return false;
  const { id, label, command } = value as Partial<TerminalPreset>;
  return typeof id === 'string' && typeof label === 'string' && typeof command === 'string' && command.trim() !== '';
}

function loadPresets(): TerminalPreset[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw === null) return [...DEFAULT_PRESETS];
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter(isPreset) : [...DEFAULT_PRESETS];
  } catch {
    return [...DEFAULT_PRESETS];
  }
}

function savePresets(presets: TerminalPreset[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(presets));
  } catch {
    // Losing this persistence isn't worth surfacing an error over.
  }
}

interface PresetsState {
  presets: TerminalPreset[];
  /** Label falls back to the command when left blank. */
  add: (label: string, command: string) => void;
  update: (id: string, label: string, command: string) => void;
  remove: (id: string) => void;
  reset: () => void;
}

/** Shared by the terminal header's chips and the floating button's menu, so
 *  an edit in one shows up in the other. */
export const useTerminalPresets = create<PresetsState>((set, get) => {
  const commit = (presets: TerminalPreset[]) => {
    savePresets(presets);
    set({ presets });
  };
  return {
    presets: loadPresets(),
    add: (label, command) =>
      commit([...get().presets, { id: `preset-${Date.now()}`, label: label.trim() || command.trim(), command: command.trim() }]),
    update: (id, label, command) =>
      commit(
        get().presets.map((preset) =>
          preset.id === id ? { ...preset, label: label.trim() || command.trim(), command: command.trim() } : preset,
        ),
      ),
    remove: (id) => commit(get().presets.filter((preset) => preset.id !== id)),
    reset: () => commit([...DEFAULT_PRESETS]),
  };
});
