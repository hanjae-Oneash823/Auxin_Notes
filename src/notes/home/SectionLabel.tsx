interface SectionLabelProps {
  label: string;
  /** Optional right-aligned annotation, e.g. a count. */
  meta?: string;
}

/** Section heading for the Home dashboard's lower half — a mono, tracked,
 *  uppercase label with a hairline rule running out to the right edge, in
 *  place of a boxed card with a title inside it. */
export function SectionLabel({ label, meta }: SectionLabelProps) {
  return (
    <div className="flex items-center gap-3">
      <span
        className="shrink-0 text-fg-muted"
        style={{
          fontFamily: 'var(--font-family-mono)',
          fontSize: '0.68rem',
          letterSpacing: 'var(--letter-spacing-label)',
          textTransform: 'uppercase',
        }}
      >
        {label}
      </span>
      <span className="h-px flex-1 bg-border-subtle" />
      {meta && (
        <span className="shrink-0 text-fg-faint" style={{ fontFamily: 'var(--font-family-mono)', fontSize: '0.68rem' }}>
          {meta}
        </span>
      )}
    </div>
  );
}
