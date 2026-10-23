import type { Icon } from '@phosphor-icons/react';
import { EntityIcon, ICON_NAMES } from './plannerIcons';
import { PopupPicker } from './PopupPicker';

interface IconPickerProps {
  /** The chosen icon's name, or '' for the default. */
  value: string;
  color: string;
  /** Shown while nothing is chosen. */
  fallback: Icon;
  onChange: (icon: string) => void;
}

/** The entity's icon as a button; clicking it opens a grid of icons to choose from. */
export function IconPicker({ value, color, fallback, onChange }: IconPickerProps) {
  return (
    <PopupPicker
      label="Change icon"
      align="left"
      triggerClassName="flex h-7 w-7 items-center justify-center rounded-tab transition-colors duration-panel ease-panel hover:bg-border-subtle"
      trigger={<EntityIcon icon={value} fallback={fallback} size={18} weight="bold" color={color} />}
    >
      {(close) => (
        <div className="flex flex-col gap-2">
          <div className="grid grid-cols-8 gap-1">
            {ICON_NAMES.map((name) => (
              <button
                key={name}
                type="button"
                aria-label={name}
                title={name}
                onClick={() => { onChange(name); close(); }}
                className={`flex h-7 w-7 items-center justify-center rounded-tab transition-colors duration-panel ease-panel hover:bg-border-subtle ${name === value ? 'bg-border-subtle' : ''}`}
              >
                <EntityIcon icon={name} fallback={fallback} size={16} weight="bold" color={name === value ? color : 'currentColor'} />
              </button>
            ))}
          </div>
          <button type="button" onClick={() => { onChange(''); close(); }} className="self-start text-fg-faint transition-colors duration-panel ease-panel hover:text-fg-prominent" style={{ fontSize: '0.72rem' }}>
            Reset to default
          </button>
        </div>
      )}
    </PopupPicker>
  );
}
