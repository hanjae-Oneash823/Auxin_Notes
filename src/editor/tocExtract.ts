import { ensureSyntaxTree, syntaxTree } from '@codemirror/language';
import type { EditorState } from '@codemirror/state';
import type { TocHeading } from './tocStore';

const HEADING_LEVEL: Record<string, number> = {
  ATXHeading1: 1,
  ATXHeading2: 2,
  ATXHeading3: 3,
  ATXHeading4: 4,
  ATXHeading5: 5,
  ATXHeading6: 6,
};

// Lezer parses lazily — `syntaxTree(state)` alone only returns however much
// of the document CodeMirror has gotten around to parsing so far, which for
// a longer note can mean everything past the initial viewport just isn't in
// the tree yet at the moment this runs (right after mount, or right after an
// edit). `ensureSyntaxTree` forces parsing out to the full document length
// first, so headings further down aren't silently skipped. 1s is generous
// for a single note's worth of markdown; falling back to whatever's parsed
// so far only matters for a pathologically large document.
const FULL_PARSE_TIMEOUT_MS = 1000;

/** Walks the note's full syntax tree (not just `visibleRanges`, unlike
 *  hideSyntaxPlugin — the TOC needs every heading, including ones scrolled
 *  out of view) collecting each ATX heading's level, display text, and the
 *  position to jump the cursor to when it's clicked in the panel. */
export function extractHeadings(state: EditorState): TocHeading[] {
  const headings: TocHeading[] = [];
  const tree = ensureSyntaxTree(state, state.doc.length, FULL_PARSE_TIMEOUT_MS) ?? syntaxTree(state);
  tree.iterate({
    enter: (node) => {
      const level = HEADING_LEVEL[node.name];
      if (level === undefined) return;
      const mark = node.node.getChild('HeaderMark');
      const textStart = mark ? Math.min(mark.to + 1, node.to) : node.from;
      const text = state.doc.sliceString(textStart, node.to).trim();
      if (text) headings.push({ level, text, pos: textStart });
    },
  });
  return headings;
}
