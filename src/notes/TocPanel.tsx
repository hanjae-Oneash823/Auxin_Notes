import { getEditorView } from '../editor/editorRegistry';
import { useTocStore } from '../editor/tocStore';
import { SidebarPacket } from '../layout/SidebarPacket';

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
    <SidebarPacket title="Contents">
      {headings.map((heading, index) => (
        <button
          key={index}
          type="button"
          onClick={() => goToHeading(heading.pos)}
          className="truncate rounded-row py-1 pr-2 text-left text-fg-muted transition-colors duration-panel ease-panel hover:bg-border-subtle hover:text-fg-prominent"
          style={{ fontSize: '0.82rem', paddingLeft: `${8 + (heading.level - 1) * 10}px` }}
        >
          {heading.text}
        </button>
      ))}
    </SidebarPacket>
  );
}
