import { Fire, Flame, Snowflake, ThermometerCold, Tray } from '@phosphor-icons/react';
import type { Icon } from '@phosphor-icons/react';
import type { Pool } from '../db/queries/planner/types';

// Shared constants for the Dashboard (DashboardView + DashboardQuickInput).

export interface PoolStyle {
  label: string;
  Icon: Icon;
  color: string;
  emptyText: string;
}

/** Inbox is the landing strip on top; below it Grill | Hot, then Cold | Freezer (reading order = tier order). */
export const POOL_ORDER: readonly Pool[] = ['inbox', 'grill', 'hot', 'cold', 'freezer'];

/** Amber pushed toward ember so Hot reads as heat and not as a warning. */
export const HOT_COLOR = 'color-mix(in srgb, var(--accent-warning) 62%, #ff6a2b)';

/** Hotter than Hot: the few tasks that matter most. */
const GRILL_COLOR = 'color-mix(in srgb, var(--accent-warning) 22%, #ff3d2e)';

/** A deeper, bluer ice than Cold. */
const FREEZER_COLOR = 'color-mix(in srgb, var(--accent-link) 55%, #5b6cff)';

export const POOL_STYLES: Record<Pool, PoolStyle> = {
  cold: { label: 'Cold', Icon: Snowflake, color: 'var(--accent-link)', emptyText: 'Nothing on ice. Drag a task here to shelve it.' },
  inbox: { label: 'Inbox', Icon: Tray, color: 'var(--fg-muted)', emptyText: 'Inbox is empty. Capture something above.' },
  freezer: { label: 'Freezer', Icon: ThermometerCold, color: FREEZER_COLOR, emptyText: 'Nothing in the freezer. Park super long-term ideas here.' },
  grill: { label: 'Grill', Icon: Fire, color: GRILL_COLOR, emptyText: 'Nothing on the grill. Drag your top priorities here.' },
  hot: { label: 'Hot', Icon: Flame, color: HOT_COLOR, emptyText: 'Nothing hot. Drag something up from Inbox or Cold.' },
};

/** The four tiers in priority order, 1 = most important. Inbox is untriaged, so it has no tier. */
export const TIER_NUMBER: Partial<Record<Pool, number>> = { grill: 1, hot: 2, cold: 3, freezer: 4 };

/** Where each pool sits on screen (row 0 = the Inbox strip; the Inbox spans both columns, so it sits between them). */
const GRID_POSITION: Record<Pool, { row: number; col: number }> = {
  inbox: { row: 0, col: 0.5 },
  grill: { row: 1, col: 0 },
  hot: { row: 1, col: 1 },
  cold: { row: 2, col: 0 },
  freezer: { row: 2, col: 1 },
};

const ARROWS: Record<string, string> = {
  '1,0': '→', '-1,0': '←', '0,1': '↓', '0,-1': '↑', '1,1': '↘', '-1,1': '↙', '1,-1': '↗', '-1,-1': '↖',
};

/** The arrow that points from one pool's panel toward another's on screen. */
export function arrowBetween(from: Pool, to: Pool): string {
  const dx = Math.sign(GRID_POSITION[to].col - GRID_POSITION[from].col);
  const dy = Math.sign(GRID_POSITION[to].row - GRID_POSITION[from].row);
  return ARROWS[`${dx},${dy}`] ?? '';
}

/** The only pools a row offers a move button for: its neighbors, not every pool. */
export const MOVE_BUTTONS: Record<Pool, readonly Pool[]> = {
  inbox: ['hot', 'cold'],
  grill: ['hot'],
  hot: ['grill', 'cold'],
  cold: ['hot', 'freezer'],
  freezer: ['cold', 'hot'],
};

export type MoveKey = 'ArrowLeft' | 'ArrowRight' | 'ArrowUp' | 'ArrowDown';

/** Where an arrow key sends a focused task, following the on-screen layout: Grill | Hot over Cold | Freezer, Inbox above. */
export const KEY_TARGETS: Record<Pool, Partial<Record<MoveKey, Pool>>> = {
  inbox: { ArrowDown: 'grill' },
  grill: { ArrowRight: 'hot', ArrowDown: 'cold', ArrowUp: 'inbox' },
  hot: { ArrowLeft: 'grill', ArrowDown: 'freezer', ArrowUp: 'inbox' },
  cold: { ArrowRight: 'freezer', ArrowUp: 'grill' },
  freezer: { ArrowLeft: 'cold', ArrowUp: 'hot' },
};

/** Matches `@grill`, `@hot`, `@cold`, `@freezer` or `@inbox` as a whole word in the quick input. */
export const POOL_TOKEN = /(^|\s)@(grill|hot|cold|freezer|inbox)(?=\s|$)/i;
