import { HighlightedText } from './HighlightedText';
import { useEffect, useRef, type CSSProperties } from 'react';

export type TextBlockVariant = 'title' | 'sticky' | 'warning' | 'heading';

const BLACK_ON_COLOR = 'text-black placeholder:text-black/30';

const VARIANTS: Record<TextBlockVariant, { placeholder: string; textClass: string; style: CSSProperties; colorClass: string; takesFocus: boolean }> = {
  title: {
    placeholder: 'Title',
    textClass: 'px-5 py-4 text-center',
    style: { fontSize: '1.8rem', lineHeight: 1.2, fontWeight: 600 },
    colorClass: BLACK_ON_COLOR,
    takesFocus: true,
  },
  sticky: {
    placeholder: 'Note',
    textClass: 'px-4 py-3 text-left',
    style: { fontSize: '1.12rem', lineHeight: 1.35, fontStyle: 'italic' },
    colorClass: BLACK_ON_COLOR,
    takesFocus: true,
  },
  warning: {
    placeholder: 'Warning',
    textClass: 'px-4 py-3 text-left',
    style: { fontSize: '1.12rem', lineHeight: 1.35, fontWeight: 700 },
    colorClass: BLACK_ON_COLOR,
    takesFocus: true,
  },
  // The optional heading of a plain text card: themed text. It takes focus only
  // when asked to (`autoFocus`), never when the card starts editing, so the
  // body editor keeps the cursor.
  heading: {
    placeholder: 'Title',
    textClass: 'px-3.5 pb-0 pt-2.5',
    style: { fontSize: '1.05rem', lineHeight: 1.3, fontWeight: 700 },
    colorClass: 'text-[color:var(--accent-warning)] placeholder:text-fg-faint',
    takesFocus: false,
  },
};

interface CardTitleFieldProps {
  variant: TextBlockVariant;
  value: string;
  onChange: (value: string) => void;
  autoFocus: boolean;
  /** Same contract as `CardTextEditor`: false makes the field inert so the
   *  card around it takes every click and drag. */
  isEditable: boolean;
  /** Fires when the field loses focus. */
  onBlur?: () => void;
  /** Words from the board's search box; every occurrence in the text is marked. */
  highlightWords?: readonly string[];
}

const BASE_TEXT_CLASS = '[overflow-wrap:anywhere]';

/** The black-on-color text field shared by title, sticky and warning cards (and, themed, a text card's heading).
 *  A textarea can't size itself to its content, so a transparent mirror `div`
 *  holding the same text gives the card its shrink-to-fit width and wrapped
 *  height, and the textarea is absolutely positioned over it (in flow, its
 *  default `cols` width would hold the card ~20 characters wide). */
export function CardTitleField({ variant, value, onChange, autoFocus, isEditable, onBlur, highlightWords = [] }: CardTitleFieldProps) {
  const ref = useRef<HTMLTextAreaElement>(null);

  const { placeholder, textClass, style: variantStyle, colorClass, takesFocus } = VARIANTS[variant];

  useEffect(() => {
    const el = ref.current;
    if (!el || !(autoFocus || (takesFocus && isEditable))) return;
    el.focus();
    el.setSelectionRange(el.value.length, el.value.length);
  }, [isEditable, autoFocus, takesFocus]);

  const textStyle = { ...variantStyle, fontFamily: 'var(--font-family)' };
  const className = `${BASE_TEXT_CLASS} ${textClass}`;
  return (
    <div className="relative w-full">
      {/* Zero-width space keeps a trailing newline from collapsing its line. */}
      <div aria-hidden className={`whitespace-pre-wrap text-transparent ${className}`} style={textStyle}>
        <HighlightedText text={value || placeholder} words={value ? highlightWords : []} />
        {'\u200b'}
      </div>
      <textarea
        ref={ref}
        rows={1}
        inert={!isEditable}
        value={value}
        placeholder={placeholder}
        onChange={(event) => onChange(event.target.value)}
        onBlur={onBlur}
        onPointerDown={(event) => {
          if (isEditable) event.stopPropagation();
        }}
        onKeyDown={(event) => {
          // A heading is one paragraph: Enter finishes it instead of adding a line.
          if (variant === 'heading' && event.key === 'Enter') {
            event.preventDefault();
            event.currentTarget.blur();
          }
        }}
        className={`absolute inset-0 h-full w-full resize-none overflow-hidden bg-transparent outline-none ${colorClass} ${className}`}
        style={textStyle}
      />
    </div>
  );
}
