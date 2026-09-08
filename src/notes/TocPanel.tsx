import { getEditorView } from '../editor/editorRegistry';
import { useTocStore } from '../editor/tocStore';

interface TocPanelProps {
  activePath: string | null;
}

/** Mirrors BacklinksPanel's layout — reads the current note's heading
 *  outline from tocStore (published by Editor.tsx) and, on click, moves that
 *  note's live CodeMirror selection to the heading and scrolls it into
 *  view. */
export function TocPanel({ activePath }: TocPanelProps) {
  const headings = useTocStore((state) => state.headings);

  if (!activePath || headings.length === 0) return null;

  function goToHeading(pos: number) {
    const view = activePath ? getEditorView(activePath) : undefined;
    if (!view) return;
    view.dispatch({ selection: { anchor: pos, head: pos }, scrollIntoView: true });
    view.focus();
  }

  return (
    <div className="flex flex-col gap-1">
      <span className="text-fg-faint tracking-label uppercase" style={{ fontSize: '0.68rem' }}>
        [contents]
      </span>
      {headings.map((heading, index) => (
        <button
          key={index}
          type="button"
          onClick={() => goToHeading(heading.pos)}
          className="truncate text-left text-fg-faint hover:text-fg-prominent"
          style={{ fontSize: '0.82rem', paddingLeft: `${4 + (heading.level - 1) * 10}px` }}
        >
          {heading.text}
        </button>
      ))}
    </div>
  );
}
