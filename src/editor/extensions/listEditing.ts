import { EditorSelection, type Extension } from '@codemirror/state';
import { keymap, type Command } from '@codemirror/view';

const LIST_INDENT_UNIT = '    ';
const BULLET_ITEM_RE = /^(\s*)([-*+])( +)(.*)$/;
const ORDERED_ITEM_RE = /^(\s*)(\d+)([.)])( +)(.*)$/;
const TASK_CONTENT_RE = /^\[[ xX]\]( +)/;

export function isListItemLine(text: string): boolean {
  return BULLET_ITEM_RE.test(text) || ORDERED_ITEM_RE.test(text);
}

/** Distinguishes a `1.`/`1)` marker from a `-`/`*`/`+` one — used to give
 *  ordered items their own (wider) hanging-indent footprint in
 *  hideSyntaxPlugin.ts, since a numeral column needs more room than a
 *  bullet's small fixed-size dot. */
export function isOrderedListItemLine(text: string): boolean {
  return ORDERED_ITEM_RE.test(text);
}

/** Tab/Shift-Tab nest and un-nest list items by adjusting the marker's
 *  leading whitespace, mirroring Obsidian/Notion. Only lines that are
 *  actually list items are touched, so selecting mixed content indents
 *  just the list rows within it. */
const indentListItem: Command = (view) => {
  const { state } = view;
  if (state.readOnly) return false;
  const touchedLines = new Set<number>();
  const changes: { from: number; insert: string }[] = [];

  for (const range of state.selection.ranges) {
    const first = state.doc.lineAt(range.from).number;
    const last = state.doc.lineAt(range.to).number;
    for (let n = first; n <= last; n++) {
      if (touchedLines.has(n)) continue;
      const line = state.doc.line(n);
      if (!isListItemLine(line.text)) continue;
      touchedLines.add(n);
      changes.push({ from: line.from, insert: LIST_INDENT_UNIT });
    }
  }

  if (changes.length === 0) return false;
  view.dispatch(state.update({ changes, userEvent: 'input.indent', scrollIntoView: true }));
  return true;
};

const outdentListItem: Command = (view) => {
  const { state } = view;
  if (state.readOnly) return false;
  const touchedLines = new Set<number>();
  const changes: { from: number; to: number }[] = [];

  for (const range of state.selection.ranges) {
    const first = state.doc.lineAt(range.from).number;
    const last = state.doc.lineAt(range.to).number;
    for (let n = first; n <= last; n++) {
      if (touchedLines.has(n)) continue;
      const line = state.doc.line(n);
      const match = BULLET_ITEM_RE.exec(line.text) ?? ORDERED_ITEM_RE.exec(line.text);
      const leadingWhitespace = match?.[1];
      if (!leadingWhitespace) continue;
      touchedLines.add(n);
      const removeLength = Math.min(LIST_INDENT_UNIT.length, leadingWhitespace.length);
      changes.push({ from: line.from, to: line.from + removeLength });
    }
  }

  if (changes.length === 0) return false;
  view.dispatch(state.update({ changes, userEvent: 'delete.dedent', scrollIntoView: true }));
  return true;
};

/** Enter on a list item continues it onto the next line with the same
 *  marker (an ordered marker increments; a task checkbox resets to
 *  unchecked). Enter on an *empty* item instead drops the marker and exits
 *  the list, same as Obsidian/Notion — otherwise finishing a list would
 *  leave a trailing empty bullet behind.
 *
 *  Falls through (returns false) to the default `insertNewlineAndIndent`
 *  whenever the cursor isn't on a list line, or sits inside the marker
 *  itself, or the selection spans multiple ranges with a non-list one
 *  among them — so plain paragraphs and code blocks keep their normal
 *  Enter behavior untouched. */
const continueListOnEnter: Command = (view) => {
  const { state } = view;
  if (state.readOnly) return false;
  const changes: { from: number; to?: number; insert?: string }[] = [];
  const cursorAnchors: number[] = [];

  for (const range of state.selection.ranges) {
    if (!range.empty) return false;
    const line = state.doc.lineAt(range.from);
    const bulletMatch = BULLET_ITEM_RE.exec(line.text);
    const orderedMatch = !bulletMatch ? ORDERED_ITEM_RE.exec(line.text) : null;
    if (!bulletMatch && !orderedMatch) return false;

    const indent = bulletMatch ? bulletMatch[1] : orderedMatch![1];
    const markerEnd = bulletMatch
      ? line.from + bulletMatch[1].length + bulletMatch[2].length + bulletMatch[3].length
      : line.from +
        orderedMatch![1].length +
        orderedMatch![2].length +
        orderedMatch![3].length +
        orderedMatch![4].length;
    if (range.from < markerEnd) return false;

    const content = bulletMatch ? bulletMatch[4] : orderedMatch![5];

    if (content.trim() === '') {
      changes.push({ from: line.from, to: line.to, insert: indent });
      cursorAnchors.push(line.from);
      continue;
    }

    const nextMarker = bulletMatch ? bulletMatch[2] : `${Number(orderedMatch![2]) + 1}${orderedMatch![3]}`;
    const taskMatch = TASK_CONTENT_RE.exec(content);
    const insert = taskMatch ? `\n${indent}${nextMarker} [ ]${taskMatch[1]}` : `\n${indent}${nextMarker} `;
    changes.push({ from: range.from, insert });
    cursorAnchors.push(range.from);
  }

  const changeSet = state.changes(changes);
  const selection = EditorSelection.create(
    cursorAnchors.map((pos) => EditorSelection.cursor(changeSet.mapPos(pos, 1))),
  );
  view.dispatch(state.update({ changes: changeSet, selection, scrollIntoView: true, userEvent: 'input' }));
  return true;
};

/** Placed before `defaultKeymap` in the extension list so these bindings
 *  win the tie on Tab/Shift-Tab/Enter; each command returns `false` outside
 *  list context, letting the keymap search continue to the defaults. */
export function createListEditingKeymap(): Extension {
  return keymap.of([
    { key: 'Tab', run: indentListItem },
    { key: 'Shift-Tab', run: outdentListItem },
    { key: 'Enter', run: continueListOnEnter },
  ]);
}
