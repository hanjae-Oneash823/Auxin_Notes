import { CANVAS_EXTENSION } from '../vault/canvasTypes';
import { isPdfPath } from '../pdf/pdfFiles';

export type AgentTargetKind = 'folder' | 'note' | 'pdf' | 'canvas';

/** What "ask agent about this" points at. `absolutePath` is on disk, not vault-relative. */
export interface AgentTarget {
  kind: AgentTargetKind;
  absolutePath: string;
  name: string;
}

export function agentTargetFromPath(absolutePath: string, isFolder: boolean): AgentTarget {
  const kind: AgentTargetKind = isFolder
    ? 'folder'
    : isPdfPath(absolutePath)
      ? 'pdf'
      : absolutePath.endsWith(CANVAS_EXTENSION)
        ? 'canvas'
        : 'note';
  return { kind, absolutePath, name: absolutePath.split('/').pop() ?? absolutePath };
}

/** POSIX single-quoting — the same text is safe in zsh, bash and fish. */
export function shellQuote(text: string): string {
  return `'${text.replace(/'/g, `'\\''`)}'`;
}

/** Short and neutral on purpose: it opens a conversation, it doesn't assign a task. */
export function buildAgentPrompt({ kind, absolutePath }: AgentTarget): string {
  switch (kind) {
    case 'folder':
      return `Let's talk about this folder: ${absolutePath}. Start by looking through it.`;
    case 'note':
      return `Let's talk about this note: ${absolutePath}. Start by reading it.`;
    case 'canvas':
      return `Let's talk about this canvas (a ${CANVAS_EXTENSION} JSON board): ${absolutePath}. Start by reading it.`;
    case 'pdf': {
      const fusedNote = absolutePath.replace(/\.pdf$/i, '.md');
      return `Let's talk about this PDF: ${absolutePath}. Its notes are in ${fusedNote}, if it exists. Start by looking through them.`;
    }
  }
}

/** Only claude/codex take an initial prompt argument, so only they get the agent menu. */
export function isAgentCommand(command: string): boolean {
  return /^(claude|codex)(\s|$)/.test(command);
}
