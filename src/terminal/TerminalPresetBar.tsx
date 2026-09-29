import { useState } from 'react';
import { Plus } from '@phosphor-icons/react';
import { siClaude } from 'simple-icons';
import { ContextMenu } from '../layout/ContextMenu';
import { launchTerminalCommand, type TerminalStatus } from './terminalLaunch';
import { isRiskyCommand, useTerminalPresets, type TerminalPreset } from './terminalPresets';

const ICON_SIZE_PX = 12;

/** The Codex mark (24px grid, drawn with `evenodd` so the `>_` prompt is a
 *  cut-out). Path from the "codex-openai" icon in the theSVG set
 *  (https://github.com/glincker/thesvg, MIT); the mark itself belongs to its
 *  owner and is used here only to label the launcher for that tool. */
// Devicon's colored Codex variant (#5061f7), lightened a bit for the dark UI — a design choice, not an official brand color
// (the official mark is monochrome).
const CODEX_ICON_COLOR = '#6b7bfa';
const CODEX_ICON_PATH =
  'M8.086.457a6.1 6.1 0 0 1 3.046-.415q2 .23 3.564 1.7a.12.12 0 0 0 .107.029q2.112-.519 4.061.366l.063.03l.154.076q2.036 1.055 2.918 3.198a5.6 5.6 0 0 1 .421 2.126a5.7 5.7 0 0 1-.18 1.631a.17.17 0 0 0 .04.155a6 6 0 0 1 1.578 2.891q.577 2.852-1.183 5.14l-.182.22a6.06 6.06 0 0 1-2.934 1.851a.16.16 0 0 0-.108.102c-.255.736-.511 1.364-.987 1.992c-1.199 1.582-2.962 2.462-4.948 2.451q-2.374-.012-4.21-1.736a.14.14 0 0 0-.14-.032c-.518.167-1.04.191-1.604.185a5.9 5.9 0 0 1-2.595-.622a6.06 6.06 0 0 1-2.146-1.781c-.203-.269-.404-.522-.551-.821a8 8 0 0 1-.495-1.283a6.1 6.1 0 0 1-.017-3.064a.2.2 0 0 0 .008-.074a.1.1 0 0 0-.037-.064a6 6 0 0 1-1.38-2.202a5.2 5.2 0 0 1-.333-1.589a6.9 6.9 0 0 1 .188-2.132q.675-2.226 2.577-3.493q.424-.282.802-.438q.429-.179.861-.304a.13.13 0 0 0 .087-.087A6 6 0 0 1 5.635 2.31Q6.655 1.04 8.086.457m-.804 7.85a.848.848 0 0 0-1.473.842l1.694 2.965l-1.688 2.848a.849.849 0 0 0 1.46.864l1.94-3.272a.85.85 0 0 0 .007-.854zm5.446 6.24a.849.849 0 0 0 0 1.695h4.848a.849.849 0 0 0 0-1.696z';

/** Brand icon for presets that launch a known agent (matched on the command's
 *  first word, so `claude --continue` and user-added variants get it too).
 *  Claude's mark comes from simple-icons in its brand orange; Codex's is drawn
 *  in blue. Both keep their color on the risky (red) chips. */
export function PresetIcon({ command }: { command: string }) {
  if (/^claude(\s|$)/.test(command)) {
    return (
      <svg viewBox="0 0 24 24" width={ICON_SIZE_PX} height={ICON_SIZE_PX} aria-hidden className="shrink-0">
        <path d={siClaude.path} fill={`#${siClaude.hex}`} />
      </svg>
    );
  }
  if (/^codex(\s|$)/.test(command)) {
    return (
      <svg viewBox="0 0 24 24" width={ICON_SIZE_PX} height={ICON_SIZE_PX} aria-hidden className="shrink-0">
        <path d={CODEX_ICON_PATH} fill={CODEX_ICON_COLOR} fillRule="evenodd" clipRule="evenodd" />
      </svg>
    );
  }
  return null;
}

interface PresetBarProps {
  status: TerminalStatus;
}

interface PresetFormProps {
  initial: { label: string; command: string };
  onSave: (label: string, command: string) => void;
  onCancel: () => void;
}

/** Inline add/edit form: command + label, Enter saves, Esc cancels. */
function PresetForm({ initial, onSave, onCancel }: PresetFormProps) {
  const [label, setLabel] = useState(initial.label);
  const [command, setCommand] = useState(initial.command);

  function handleKeyDown(event: React.KeyboardEvent) {
    if (event.key === 'Escape') onCancel();
    if (event.key === 'Enter' && command.trim()) onSave(label, command);
  }

  const inputClass = 'w-full rounded-row bg-bg px-2 py-1 text-fg-prominent outline-none placeholder:text-fg-faint';
  return (
    <div className="flex flex-col gap-1 px-1 pb-1">
      <input
        autoFocus
        value={command}
        onChange={(event) => setCommand(event.target.value)}
        onKeyDown={handleKeyDown}
        placeholder="command, e.g. claude --continue"
        className={inputClass}
        style={{ fontSize: '0.75rem' }}
      />
      <input
        value={label}
        onChange={(event) => setLabel(event.target.value)}
        onKeyDown={handleKeyDown}
        placeholder="label (optional)"
        className={inputClass}
        style={{ fontSize: '0.75rem' }}
      />
      <div className="flex justify-end gap-2" style={{ fontSize: '0.7rem' }}>
        <button type="button" onClick={onCancel} className="text-fg-faint hover:text-fg-prominent">
          [cancel]
        </button>
        <button
          type="button"
          disabled={!command.trim()}
          onClick={() => onSave(label, command)}
          className="text-fg-muted enabled:hover:text-accent-neon-green disabled:opacity-40"
        >
          [save]
        </button>
      </div>
    </div>
  );
}

/** One-click launchers for the terminal: each chip types its command into the
 *  shell. Disabled while a program is running (typing then would go into that
 *  program). Right-click a chip to edit or delete it; `+` adds one. */
export function TerminalPresetBar({ status }: PresetBarProps) {
  const presets = useTerminalPresets((state) => state.presets);
  const { add, update, remove, reset } = useTerminalPresets.getState();
  // `null`: closed · 'new': adding · a preset: editing it.
  const [form, setForm] = useState<TerminalPreset | 'new' | null>(null);
  const [menu, setMenu] = useState<{ x: number; y: number; preset: TerminalPreset | null } | null>(null);
  const isBusy = status === 'busy';

  return (
    <div
      className="px-1 pb-1"
      onContextMenu={(event) => {
        // Empty space in the bar: offer the reset.
        event.preventDefault();
        setMenu({ x: event.clientX, y: event.clientY, preset: null });
      }}
    >
      <div className="flex flex-wrap items-center gap-1">
        {presets.map((preset) => {
          const isRisky = isRiskyCommand(preset.command);
          return (
            <button
              key={preset.id}
              type="button"
              disabled={isBusy}
              title={isBusy ? 'a program is already running in the terminal' : preset.command}
              onClick={() => void launchTerminalCommand(preset.command)}
              onContextMenu={(event) => {
                event.preventDefault();
                event.stopPropagation();
                setMenu({ x: event.clientX, y: event.clientY, preset });
              }}
              className={`flex items-center gap-1 rounded-row border px-1.5 py-0.5 transition-colors duration-panel ease-panel disabled:cursor-default disabled:opacity-40 ${
                isRisky
                  ? 'border-red-400/50 text-red-400 enabled:hover:bg-red-400 enabled:hover:text-black'
                  : 'border-border text-fg-muted enabled:hover:border-border-strong enabled:hover:text-fg-prominent'
              }`}
              style={{ fontSize: '0.72rem' }}
            >
              <PresetIcon command={preset.command} />
              {preset.label}
            </button>
          );
        })}
        <button
          type="button"
          title="add a preset"
          aria-label="add a preset"
          onClick={() => setForm('new')}
          className="flex h-5 w-5 items-center justify-center rounded-row text-fg-faint transition-colors duration-panel ease-panel hover:bg-border-subtle hover:text-fg-prominent"
        >
          <Plus size={12} />
        </button>
      </div>
      {form && (
        <div className="mt-1">
          <PresetForm
            initial={form === 'new' ? { label: '', command: '' } : form}
            onCancel={() => setForm(null)}
            onSave={(label, command) => {
              if (form === 'new') add(label, command);
              else update(form.id, label, command);
              setForm(null);
            }}
          />
        </div>
      )}
      {menu && (
        <ContextMenu
          x={menu.x}
          y={menu.y}
          onClose={() => setMenu(null)}
          items={
            menu.preset
              ? [
                  { label: 'edit', onSelect: () => setForm(menu.preset) },
                  { label: 'delete', onSelect: () => remove(menu.preset!.id), danger: true },
                ]
              : [{ label: 'reset to defaults', onSelect: reset }]
          }
        />
      )}
    </div>
  );
}
