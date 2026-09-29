import { useEffect, useRef, type CSSProperties } from 'react';

export type TextBlockVariant = 'title' | 'sticky' | 'warning';

const VARIANTS: Record<TextBlockVariant, { placeholder: string; textClass: string; style: CSSProperties }> = {
  title: {
    placeholder: 'Title',
    textClass: 'px-5 py-4 text-center',
    style: { fontSize: '1.6rem', lineHeight: 1.2, fontWeight: 600 },
  },
  sticky: {
    placeholder: 'Note',
    textClass: 'px-4 py-3 text-left',
    style: { fontSize: '1rem', lineHeight: 1.35, fontStyle: 'italic' },
  },
  warning: {
    placeholder: 'Warning',
    textClass: 'px-4 py-3 text-left',
    style: { fontSize: '1rem', lineHeight: 1.35, fontWeight: 700 },
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
}

const BASE_TEXT_CLASS = '[overflow-wrap:anywhere]';

/** The black-on-color text field shared by title, sticky and warning cards.
 *  A textarea can't size itself to its content, so an invisible mirror `div`
 *  holding the same text gives the card its shrink-to-fit width and wrapped
 *  height, and the textarea is absolutely positioned over it (in flow, its
 *  default `cols` width would hold the card ~20 characters wide). */
export function CardTitleField({ variant, value, onChange, autoFocus, isEditable }: CardTitleFieldProps) {
  const ref = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el || !(isEditable || autoFocus)) return;
    el.focus();
    el.setSelectionRange(el.value.length, el.value.length);
  }, [isEditable, autoFocus]);

  const { placeholder, textClass, style: variantStyle } = VARIANTS[variant];
  const textStyle = { ...variantStyle, fontFamily: 'var(--font-family)' };
  const className = `${BASE_TEXT_CLASS} ${textClass}`;
  return (
    <div className="relative w-full">
      {/* Zero-width space keeps a trailing newline from collapsing its line. */}
      <div aria-hidden className={`invisible whitespace-pre-wrap ${className}`} style={textStyle}>
        {(value || placeholder) + '\u200b'}
      </div>
      <textarea
        ref={ref}
        rows={1}
        inert={!isEditable}
        value={value}
        placeholder={placeholder}
        onChange={(event) => onChange(event.target.value)}
        onPointerDown={(event) => {
          if (isEditable) event.stopPropagation();
        }}
        className={`absolute inset-0 h-full w-full resize-none overflow-hidden bg-transparent text-black outline-none placeholder:text-black/30 ${className}`}
        style={textStyle}
      />
    </div>
  );
}
