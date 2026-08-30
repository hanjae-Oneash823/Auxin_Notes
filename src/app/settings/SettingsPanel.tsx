import { useSettingsStore } from './settingsStore';
import { FONT_FAMILY_OPTIONS, FONT_SIZE_OPTIONS } from '../../design/fontOptions';

const selectClassName =
  'border border-border bg-bg px-2 py-1 text-fg-prominent outline-none transition-colors duration-panel ease-panel focus:border-border-strong';

export function SettingsPanel() {
  const { fontFamilyId, fontSizeId, setFontFamily, setFontSize } = useSettingsStore();

  return (
    <div
      className="flex w-48 flex-col gap-2 border border-border bg-bg p-3"
      style={{ fontSize: '0.8rem' }}
    >
      <span className="text-fg-faint tracking-label uppercase" style={{ fontSize: '0.68rem' }}>
        [settings]
      </span>

      <label className="flex flex-col gap-1">
        <span className="text-fg-muted">font</span>
        <select
          value={fontFamilyId}
          onChange={(event) => void setFontFamily(event.target.value)}
          className={selectClassName}
        >
          {FONT_FAMILY_OPTIONS.map((option) => (
            <option key={option.id} value={option.id}>
              {option.label}
            </option>
          ))}
        </select>
      </label>

      <label className="flex flex-col gap-1">
        <span className="text-fg-muted">size</span>
        <select
          value={fontSizeId}
          onChange={(event) => void setFontSize(event.target.value)}
          className={selectClassName}
        >
          {FONT_SIZE_OPTIONS.map((option) => (
            <option key={option.id} value={option.id}>
              {option.label}
            </option>
          ))}
        </select>
      </label>
    </div>
  );
}
