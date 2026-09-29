import { Fire } from '@phosphor-icons/react';
import { TRASH_COLOR_CLASS } from '../vault/trash';

/** A flame that empties the trash. A `span` (not a `button`) because it sits
 *  inside the trash row's own button, and buttons can't nest; it swallows the
 *  pointer events so clicking it doesn't also open the trash. */
export function EmptyTrashButton({ onClick }: { onClick: () => void }) {
  return (
    <span
      role="button"
      tabIndex={0}
      title="empty trash"
      aria-label="empty trash"
      onMouseDown={(event) => event.stopPropagation()}
      onClick={(event) => {
        event.stopPropagation();
        onClick();
      }}
      onKeyDown={(event) => {
        if (event.key !== 'Enter' && event.key !== ' ') return;
        event.preventDefault();
        event.stopPropagation();
        onClick();
      }}
      className={`flex shrink-0 items-center rounded-row p-0.5 opacity-70 transition-opacity duration-panel ease-panel hover:opacity-100 ${TRASH_COLOR_CLASS}`}
    >
      <Fire size={15} weight="fill" />
    </span>
  );
}
