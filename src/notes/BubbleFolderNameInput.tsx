import { useEffect, useRef } from 'react';

const MIN_WIDTH_PX = 96;
/** Share of the bubble's diameter the input spans. */
const WIDTH_RATIO = 0.9;

interface BubbleFolderNameInputProps {
  initialName: string;
  /** Bubble center as a percentage of the chart, and its diameter as a
   *  percentage of the chart's width — the same coordinates the tooltip uses. */
  leftPercent: number;
  topPercent: number;
  diameterPercent: number;
  /** Called once, with the trimmed text, on Enter or blur. */
  onCommit: (name: string) => void;
  onCancel: () => void;
}

/** The name field a just-created subfolder's bubble shows: focused with the
 *  default name selected, Enter (or clicking away) keeps it, Escape leaves the
 *  default name as is. */
export function BubbleFolderNameInput({
  initialName,
  leftPercent,
  topPercent,
  diameterPercent,
  onCommit,
  onCancel,
}: BubbleFolderNameInputProps) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  // Enter/Escape unmount the input, which fires blur — this stops that blur
  // from committing a second time.
  const isDoneRef = useRef(false);

  useEffect(() => {
    inputRef.current?.focus();
    inputRef.current?.select();
  }, []);

  function finish(commit: boolean) {
    if (isDoneRef.current) return;
    isDoneRef.current = true;
    if (commit) onCommit(inputRef.current?.value.trim() ?? '');
    else onCancel();
  }

  return (
    <input
      ref={inputRef}
      defaultValue={initialName}
      aria-label="Folder name"
      spellCheck={false}
      onBlur={() => finish(true)}
      onKeyDown={(event) => {
        if (event.key === 'Enter') finish(true);
        else if (event.key === 'Escape') finish(false);
      }}
      className="absolute rounded-row border border-border bg-bg-panel px-2 py-1 text-center text-fg-prominent outline-none focus:border-fg-faint"
      style={{
        left: `${leftPercent}%`,
        top: `${topPercent}%`,
        width: `max(${MIN_WIDTH_PX}px, ${diameterPercent * WIDTH_RATIO}%)`,
        transform: 'translate(-50%, -50%)',
        fontSize: '0.8rem',
        fontWeight: 600,
      }}
    />
  );
}
