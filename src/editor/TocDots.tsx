import { getEditorView } from './editorRegistry';
import { useTocStore } from './tocStore';

interface TocDotsProps {
  activePath: string;
}

const DOT_SIZE = 6;
const LEVEL_INDENT = 8;
const ROW_HEIGHT = 16;

/** The heading currently on screen: the last heading (headings are already
 *  in document order — extractHeadings walks the tree front-to-back) whose
 *  position is at or before whatever's scrolled to the vertical middle of
 *  the editor viewport. -1 (nothing highlighted) if the note hasn't been
 *  scrolled far enough yet to reach the first heading. */
function activeHeadingIndex(headings: { pos: number }[], anchorPos: number): number {
  let active = -1;
  for (let i = 0; i < headings.length; i++) {
    if (headings[i].pos > anchorPos) break;
    active = i;
  }
  return active;
}

/** Minimal heading outline pinned to the editing pane's left edge — one dot
 *  per heading (from tocStore, the same outline TocPanel.tsx shows as text
 *  in the right sidebar). A click moves the note's live CodeMirror selection
 *  there and scrolls it into view; the dot for whichever heading is
 *  currently scrolled into view is colored to mark "you are here" —
 *  scrollspy-style, tracking the viewport rather than the text cursor.
 *
 *  Each row's hoverable area is a full-width rectangle, not a box hugging
 *  just the dot — deeper headings' dots sit further right (paddingLeft, same
 *  per-level indent as TocPanel.tsx's text list), but if the hover target
 *  matched that indent exactly, moving the mouse straight down from a
 *  shallow heading to a deeper one below it would exit the hitbox partway
 *  and the tooltip would flicker off between them. A shared full-width rail
 *  keeps hover continuous no matter which levels are stacked in what order.
 *  The tooltip itself still tracks the dot's own position, not the row's. */
export function TocDots({ activePath }: TocDotsProps) {
  const headings = useTocStore((state) => state.headings);
  const activeAnchorPos = useTocStore((state) => state.activeAnchorPos);

  if (headings.length === 0) return null;

  const activeIndex = activeHeadingIndex(headings, activeAnchorPos);
  const maxLevel = headings.reduce((max, heading) => Math.max(max, heading.level), 1);
  const railWidth = (maxLevel - 1) * LEVEL_INDENT + DOT_SIZE + LEVEL_INDENT;

  function goToHeading(pos: number) {
    const view = getEditorView(activePath);
    if (!view) return;
    view.dispatch({ selection: { anchor: pos, head: pos }, scrollIntoView: true });
    view.focus();
  }

  return (
    <div
      className="absolute z-10 flex flex-col"
      style={{ left: 'var(--space-chrome-lg)', top: '50%', transform: 'translateY(-50%)' }}
    >
      {headings.map((heading, index) => {
        const isActive = index === activeIndex;
        const indent = (heading.level - 1) * LEVEL_INDENT;
        return (
          <button
            key={index}
            type="button"
            aria-label={heading.text}
            onClick={() => goToHeading(heading.pos)}
            className="group relative flex shrink-0 items-center"
            style={{ width: `${railWidth}px`, height: `${ROW_HEIGHT}px`, paddingLeft: `${indent}px` }}
          >
            <span
              className="rounded-full transition-opacity duration-panel ease-panel group-hover:opacity-100"
              style={{
                width: `${DOT_SIZE}px`,
                height: `${DOT_SIZE}px`,
                backgroundColor: isActive ? 'var(--accent-link)' : 'var(--border-strong)',
                opacity: isActive ? 1 : 0.5,
              }}
            />
            <span
              className="pointer-events-none absolute whitespace-nowrap opacity-0 transition-opacity duration-panel ease-panel group-hover:opacity-100"
              style={{
                left: `${indent + DOT_SIZE + 4}px`,
                fontSize: '0.95rem',
                color: 'var(--color-fg)',
                backgroundColor: 'var(--color-bg)',
                border: '1px solid var(--border-default)',
                borderRadius: '4px',
                padding: '3px 8px',
              }}
            >
              {heading.text}
            </span>
          </button>
        );
      })}
    </div>
  );
}
