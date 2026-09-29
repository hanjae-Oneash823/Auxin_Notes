import { useEffect, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { usePanelLayoutStore } from '../layout/panelLayoutStore';

/** `none`: no shell yet · `idle`: at its prompt · `busy`: a program is running. */
export type TerminalStatus = 'none' | 'idle' | 'busy';

export type LaunchResult = 'started' | 'busy' | 'failed';

const STATUS_POLL_MS = 1000;
/** How long to wait for a first-time shell to come up after showing the layer. */
const SHELL_WAIT_MS = 4000;
const SHELL_POLL_MS = 50;
/** How long a stop signal gets to take effect before escalating / giving up. */
const STOP_WAIT_MS = 1500;
const STOP_POLL_MS = 100;

export function getTerminalStatus(): Promise<TerminalStatus> {
  return invoke<TerminalStatus>('terminal_status');
}

/** Live status for enabling/disabling launchers — polls only while `isActive`. */
export function useTerminalStatus(isActive: boolean): TerminalStatus {
  const [status, setStatus] = useState<TerminalStatus>('none');

  useEffect(() => {
    if (!isActive) return;
    let isCancelled = false;
    const poll = () =>
      getTerminalStatus()
        .then((next) => {
          if (!isCancelled) setStatus(next);
        })
        .catch((error: unknown) => console.error('[terminal] status check failed', error));
    void poll();
    const timer = window.setInterval(() => void poll(), STATUS_POLL_MS);
    return () => {
      isCancelled = true;
      window.clearInterval(timer);
    };
  }, [isActive]);

  return status;
}

async function waitForShell(): Promise<TerminalStatus> {
  const deadline = Date.now() + SHELL_WAIT_MS;
  for (;;) {
    const status = await getTerminalStatus();
    if (status !== 'none' || Date.now() >= deadline) return status;
    await new Promise((resolve) => window.setTimeout(resolve, SHELL_POLL_MS));
  }
}

async function waitForIdle(): Promise<boolean> {
  const deadline = Date.now() + STOP_WAIT_MS;
  for (;;) {
    if ((await getTerminalStatus()) === 'idle') return true;
    if (Date.now() >= deadline) return false;
    await new Promise((resolve) => window.setTimeout(resolve, STOP_POLL_MS));
  }
}

/** Stops the terminal's foreground program: polite SIGTERM first, SIGKILL if it
 *  is still there after a moment. Resolves to whether the shell is back at its
 *  prompt. */
export async function stopTerminalProcess(): Promise<boolean> {
  for (const force of [false, true]) {
    await invoke('terminal_stop', { force });
    if (await waitForIdle()) return true;
  }
  return false;
}

/** Shows the terminal layer (opening the right panel if it is hidden), then
 *  types `command` + Enter into the shell. Refuses when a program is already
 *  running — the text would go into that program instead of a prompt — unless
 *  `stopFirst`, which stops that program first. The check is repeated here,
 *  right before writing, so a stale button can't slip through. */
export async function launchTerminalCommand(
  command: string,
  { stopFirst = false }: { stopFirst?: boolean } = {},
): Promise<LaunchResult> {
  const layout = usePanelLayoutStore.getState();
  if (!layout.isRightSidebarOpen) layout.toggleSidebar('right');
  if (layout.activeRightLayer !== 'terminal') layout.setRightLayer('terminal');

  try {
    const status = await waitForShell();
    if (status === 'none') return 'failed';
    if (status === 'busy' && !(stopFirst && (await stopTerminalProcess()))) return 'busy';
    await invoke('terminal_write', { data: `${command}\r` });
    // Hand the keyboard to the terminal so the agent can be typed to right away.
    document.querySelector<HTMLTextAreaElement>('.xterm-helper-textarea')?.focus();
    return 'started';
  } catch (error: unknown) {
    console.error('[terminal] failed to launch command', error);
    return 'failed';
  }
}
