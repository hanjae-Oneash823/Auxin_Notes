import { CaretDown, CaretRight } from '@phosphor-icons/react';

interface SectionLabelProps {
  label: string;
  count: number;
  onClick?: () => void;
  isOpen?: boolean;
}

export function SectionLabel({ label, count, onClick, isOpen }: SectionLabelProps) {
  const Caret = isOpen ? CaretDown : CaretRight;
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={!onClick}
      className="flex items-center gap-1.5 px-1 text-left uppercase tracking-wider text-fg-faint enabled:hover:text-fg-muted"
      style={{ fontSize: '0.68rem' }}
    >
      {onClick && <Caret size={10} />}
      {label} <span>({count})</span>
    </button>
  );
}
