interface SegmentedProps<T extends string> {
  value: T;
  options: readonly { value: T; label: string; title?: string }[];
  onChange: (value: T) => void;
  className?: string;
}

/** A joined row of mutually exclusive options; the selected one is raised. */
export function Segmented<T extends string>({ value, options, onChange, className = '' }: SegmentedProps<T>) {
  return (
    <div role="group" className={`flex gap-0.5 rounded-tab border border-border-subtle p-0.5 ${className}`}>
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          title={option.title}
          aria-pressed={option.value === value}
          onClick={() => onChange(option.value)}
          className={`min-w-0 flex-1 truncate rounded-[5px] px-1.5 py-1 transition-colors duration-panel ease-panel ${
            option.value === value ? 'bg-border-subtle text-fg-prominent' : 'text-fg-muted hover:text-fg-prominent'
          }`}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}
