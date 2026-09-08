import { syntaxTree } from '@codemirror/language';
import {
  type ChangeDesc,
  type EditorState,
  MapMode,
  RangeSetBuilder,
  StateEffect,
  StateField,
} from '@codemirror/state';
import { Decoration, type DecorationSet, EditorView } from '@codemirror/view';
import { HEADING_LEVEL } from './markdownHeadingUtils';

const HIDDEN_SECTION = Decoration.replace({ block: true });

/** Toggles whether the section under the heading starting at this position
 *  is collapsed. Keyed by the heading's own start position (`ATXHeadingN`'s
 *  `.from`) rather than a generated id — it's already a stable, unique
 *  handle on "this particular heading" for as long as the heading exists,
 *  and position mapping through edits is what `StateField.update` already
 *  does for everything else in CM6. */
export const toggleHeadingFold = StateEffect.define<number>();

interface HeadingFoldState {
  collapsed: ReadonlySet<number>;
  decorations: DecorationSet;
}

function toggle(collapsed: ReadonlySet<number>, pos: number): Set<number> {
  const next = new Set(collapsed);
  if (next.has(pos)) next.delete(pos);
  else next.add(pos);
  return next;
}

/** Drops a collapsed heading from the set once its line is actually deleted
 *  (`MapMode.TrackDel` surfaces that as `null`) rather than leaving a stale
 *  position that happens to land on unrelated text after the edit. */
function mapCollapsed(collapsed: ReadonlySet<number>, changes: ChangeDesc): Set<number> {
  const next = new Set<number>();
  for (const pos of collapsed) {
    const mapped = changes.mapPos(pos, -1, MapMode.TrackDel);
    if (mapped !== null) next.add(mapped);
  }
  return next;
}

interface HeadingSpan {
  from: number;
  level: number;
}

function collectHeadings(state: EditorState): HeadingSpan[] {
  const headings: HeadingSpan[] = [];
  syntaxTree(state).iterate({
    enter: (node) => {
      const level = HEADING_LEVEL[node.name];
      if (level !== undefined) headings.push({ from: node.from, level });
    },
  });
  return headings;
}

/** A collapsed section runs from the line right after its heading down to
 *  (not including) the next heading of equal or higher rank — same nesting
 *  rule outliners use everywhere: collapsing an H2 takes its H3s with it,
 *  but stops at the next H2 or H1. Runs on the full document rather than
 *  `view.visibleRanges` (unlike `hideSyntaxPlugin`'s decorations) since a
 *  collapsed heading miles below the viewport still needs its section
 *  hidden for the document's total height to be right. */
function buildFoldDecorations(state: EditorState, collapsed: ReadonlySet<number>): DecorationSet {
  if (collapsed.size === 0) return Decoration.none;

  const headings = collectHeadings(state);
  const builder = new RangeSetBuilder<Decoration>();
  const doc = state.doc;

  headings.forEach((heading, index) => {
    if (!collapsed.has(heading.from)) return;

    const headingLine = doc.lineAt(heading.from);
    let sectionEnd = doc.length;
    for (let j = index + 1; j < headings.length; j++) {
      if (headings[j].level <= heading.level) {
        sectionEnd = doc.lineAt(headings[j].from).from;
        break;
      }
    }

    const from = Math.min(headingLine.to + 1, doc.length);
    if (from < sectionEnd) builder.add(from, sectionEnd, HIDDEN_SECTION);
  });

  return builder.finish();
}

const headingFoldField = StateField.define<HeadingFoldState>({
  create() {
    return { collapsed: new Set(), decorations: Decoration.none };
  },
  update(value, tr) {
    let collapsed = value.collapsed;
    let changed = false;

    // A collapsed section's own boundaries can shift on any edit (text
    // added/removed under it, a heading's level changed) even without a
    // fold being toggled, so decorations get rebuilt on every doc change,
    // same as the position-mapping pass just above it.
    if (tr.docChanged) {
      collapsed = mapCollapsed(collapsed, tr.changes);
      changed = true;
    }
    for (const effect of tr.effects) {
      if (effect.is(toggleHeadingFold)) {
        collapsed = toggle(collapsed, effect.value);
        changed = true;
      }
    }

    if (!changed) return value;
    return { collapsed, decorations: buildFoldDecorations(tr.state, collapsed) };
  },
  provide: (field) => EditorView.decorations.from(field, (value) => value.decorations),
});

export function isHeadingFolded(state: EditorState, headingFrom: number): boolean {
  return state.field(headingFoldField).collapsed.has(headingFrom);
}

/** Whether a transaction actually changed fold state — `hideSyntaxPlugin`'s
 *  own decorations (the chevron's rotation among them) need to rebuild on a
 *  toggle even though it's neither a doc change nor a selection change. */
export function headingFoldChanged(startState: EditorState, state: EditorState): boolean {
  return startState.field(headingFoldField) !== state.field(headingFoldField);
}

/** Hides every collapsed section's lines. A `StateField`, not a
 *  `ViewPlugin`: CM6 only allows `block: true` decorations (ones that
 *  affect document layout height) to come from state, not from a view
 *  plugin. */
export function createHeadingFoldPlugin() {
  return headingFoldField;
}
