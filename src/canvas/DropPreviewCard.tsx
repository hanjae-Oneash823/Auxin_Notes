import { LinkCardBody, PDF_CARD_BG, SELECTED_BORDER } from './CanvasCard';
import { CARD_BORDER_PX, LINK_CARD_MAX_WIDTH, MIN_CARD_HEIGHT, MIN_CARD_WIDTH } from './canvasConstants';

interface DropPreviewCardProps {
  path: string;
  isPdf: boolean;
  /** World coordinates of the card's top-left — where a drop here would place it. */
  x: number;
  y: number;
}

/** The card a note or PDF becomes if released here: same frame and contents as
 *  the real note/PDF card, drawn in the board's world layer (so it scales with
 *  zoom and lands exactly where it will), lifted with a shadow and a slight
 *  tilt so it reads as "in the hand". Purely visual: takes no pointer events. */
export function DropPreviewCard({ path, isPdf, x, y }: DropPreviewCardProps) {
  return (
    <div
      className={`pointer-events-none absolute z-30 flex flex-col border rounded-tab ${isPdf ? '' : 'bg-bg-packet-card'}`}
      style={{
        left: x,
        top: y,
        width: 'max-content',
        minWidth: MIN_CARD_WIDTH,
        maxWidth: LINK_CARD_MAX_WIDTH,
        minHeight: MIN_CARD_HEIGHT,
        borderWidth: CARD_BORDER_PX,
        borderColor: SELECTED_BORDER,
        backgroundColor: isPdf ? PDF_CARD_BG : undefined,
        boxShadow: 'var(--shadow-float)',
        opacity: 0.92,
        transform: 'rotate(-2deg) scale(1.03)',
      }}
    >
      <LinkCardBody path={path} isPdf={isPdf} />
    </div>
  );
}
