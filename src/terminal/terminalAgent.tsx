import { Robot } from '@phosphor-icons/react';
import { create } from 'zustand';
import { ConfirmDialog } from '../layout/ConfirmDialog';
import type { ContextMenuItem } from '../layout/ContextMenu';
import { PresetIcon } from './TerminalPresetBar';
import { buildAgentPrompt, isAgentCommand, shellQuote, type AgentTarget } from './terminalAgentPrompt';
import { getTerminalStatus, launchTerminalCommand } from './terminalLaunch';
import { isRiskyCommand, useTerminalPresets, type TerminalPreset } from './terminalPresets';

interface PendingAsk {
  preset: TerminalPreset;
  target: AgentTarget;
}

interface StopPromptState {
  pending: PendingAsk | null;
  ask: (pending: PendingAsk) => void;
  clear: () => void;
}

/** Holds the "stop the running program first?" question so any menu can raise it. */
const useStopPrompt = create<StopPromptState>((set) => ({
  pending: null,
  ask: (pending) => set({ pending }),
  clear: () => set({ pending: null }),
}));

/** Opens `preset` in the terminal with a prompt about `target`. When the
 *  terminal is busy this asks first — unless `stopFirst`, where the menu label
 *  already told the user the running program will be stopped. */
export async function askAgentAbout(preset: TerminalPreset, target: AgentTarget, stopFirst = false): Promise<void> {
  if (!stopFirst && (await getTerminalStatus().catch(() => 'none' as const)) === 'busy') {
    useStopPrompt.getState().ask({ preset, target });
    return;
  }
  await launchTerminalCommand(`${preset.command} ${shellQuote(buildAgentPrompt(target))}`, { stopFirst });
}

/** One item per claude/codex preset (read at call time, so menus see edits). */
export function agentPresetItems(target: AgentTarget, stopFirst = false): ContextMenuItem[] {
  return useTerminalPresets
    .getState()
    .presets.filter((preset) => isAgentCommand(preset.command))
    .map((preset) => ({
      label: preset.label,
      icon: <PresetIcon command={preset.command} />,
      isRisky: isRiskyCommand(preset.command),
      onSelect: () => void askAgentAbout(preset, target, stopFirst),
    }));
}

/** Submenu row for the right-click menus. */
export function agentMenuItem(target: AgentTarget, label = 'ask agent about this', stopFirst = false): ContextMenuItem {
  const submenu = agentPresetItems(target, stopFirst);
  if (submenu.length === 0) return { label: 'ask agent (no claude/codex presets)', disabled: true };
  return { label, icon: <Robot size={12} className="shrink-0" />, submenu };
}

/** Render once at the app root. */
export function AgentStopConfirm() {
  const pending = useStopPrompt((state) => state.pending);
  const clear = useStopPrompt((state) => state.clear);
  if (!pending) return null;
  return (
    <ConfirmDialog
      message={`A program is running in the terminal. Stop it and start ${pending.preset.label} about "${pending.target.name}"?`}
      confirmLabel="stop & start"
      onCancel={clear}
      onConfirm={() => {
        clear();
        void askAgentAbout(pending.preset, pending.target, true);
      }}
    />
  );
}
