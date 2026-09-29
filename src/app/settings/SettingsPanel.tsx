import { useSettingsStore } from './settingsStore';
import { FONT_FAMILY_OPTIONS, FONT_SIZE_PX_MIN, FONT_SIZE_PX_MAX } from '../../design/fontOptions';

const selectClassName =
  'border border-border bg-bg px-2 py-1 text-fg-prominent outline-none transition-colors duration-panel ease-panel focus:border-border-strong';

export function SettingsPanel() {
  const { fontFamilyId, fontSizePx, userName, setFontFamily, setFontSize, setUserName } = useSettingsStore();

  return (
    <div
      className="flex w-48 flex-col gap-2 border border-border bg-bg p-3"
      style={{ fontSize: '0.8rem' }}
    >
      <span className="text-fg-faint tracking-label uppercase" style={{ fontSize: '0.68rem' }}>
        [settings]
      </span>

      <label className="flex flex-col gap-1">
        <span className="text-fg-muted">name</span>
        <input
          type="text"
          defaultValue={userName}
          onBlur={(event) => void setUserName(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') event.currentTarget.blur();
          }}
          placeholder="your name"
          className={selectClassName}
        />
      </label>

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
        <span className="text-fg-muted">size (px)</span>
        <input
          type="number"
          min={FONT_SIZE_PX_MIN}
          max={FONT_SIZE_PX_MAX}
          value={fontSizePx}
          onChange={(event) => {
            const parsed = Number(event.target.value);
            if (!Number.isNaN(parsed)) void setFontSize(parsed);
          }}
          className={selectClassName}
        />
      </label>
    </div>
  );
}
